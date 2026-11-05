<?php
/**
 * Unit tests for marking stored HTML outdated when its inputs change.
 *
 * @package ImaginaSignatures\Tests\Unit\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Services;

use Brain\Monkey;
use Brain\Monkey\Actions;
use Brain\Monkey\Functions;
use ImaginaSignatures\Directory\Groups;
use ImaginaSignatures\Directory\ProfileFields;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Services\StaleHtmlMarker;
use ImaginaSignatures\Settings\BrandKit;
use ImaginaSignatures\Tests\Unit\Settings\BrandKitStubs;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../Settings/BrandKitStubs.php';

if ( ! defined( 'ARRAY_A' ) ) {
	define( 'ARRAY_A', 'ARRAY_A' );
}

/**
 * Records the SQL a repository method sends, and answers with a row count.
 */
final class Imgsig_Stale_Wpdb extends \wpdb { // phpcs:ignore

	/** @var array<int, array{sql: string, args: array<int, mixed>}> */
	public array $prepared = [];

	/** @var array<int, string> */
	public array $queries = [];

	/** @var array<int, array<string, mixed>> */
	public array $results = [];

	/** @var int */
	public int $affected = 3;

	/**
	 * @param string $query   SQL.
	 * @param mixed  ...$args Values.
	 * @return string
	 */
	public function prepare( $query, ...$args ) {
		$this->prepared[] = [
			'sql'  => (string) $query,
			'args' => $args,
		];
		return (string) $query . ' /*' . implode( ',', $args ) . '*/';
	}

	/**
	 * @param string $query SQL.
	 * @return int
	 */
	public function query( $query ) {
		$this->queries[] = (string) $query;
		return $this->affected;
	}

	/**
	 * @param string|null $query  SQL.
	 * @param string      $output Output type.
	 * @return array<int, array<string, mixed>>
	 */
	public function get_results( $query = null, $output = 'OBJECT' ) {
		$this->queries[] = (string) $query;
		return $this->results;
	}
}

/**
 * @covers \ImaginaSignatures\Services\StaleHtmlMarker
 * @covers \ImaginaSignatures\Repositories\SignatureRepository::mark_html_outdated
 * @covers \ImaginaSignatures\Repositories\SignatureRepository::summaries_for_users
 * @covers \ImaginaSignatures\Directory\ProfileFields::save_config
 */
final class StaleHtmlMarkerTest extends TestCase {

	use BrandKitStubs;

	/** @var array<int, int[]|null> Every mark_html_outdated() call. */
	private array $marked = [];

	/** @var array<string, mixed> */
	private array $options = [];

	/** @var array<int, object> */
	private array $users = [];

	/** @var array<int, int[]> group => members */
	private array $members = [];

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_sanitizers();
		$this->marked  = [];
		$this->options = [];
		$this->users   = [];
		$this->members = [];

		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'sanitize_key' )->alias(
			static function ( $key ): string {
				return (string) preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $key ) );
			}
		);
		Functions\when( 'current_time' )->justReturn( '2026-11-05' );
		Functions\when( 'get_option' )->alias(
			function ( $name, $fallback = false ) {
				return array_key_exists( $name, $this->options ) ? $this->options[ $name ] : $fallback;
			}
		);
		Functions\when( 'update_option' )->alias(
			function ( $name, $value ): bool {
				$this->options[ $name ] = $value;
				return true;
			}
		);
		Functions\when( 'get_userdata' )->alias(
			function ( $id ) {
				return $this->users[ (int) $id ] ?? false;
			}
		);
		Functions\when( 'get_objects_in_term' )->alias(
			function ( $group_id ) {
				return $this->members[ (int) $group_id ] ?? [];
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	private function marker(): StaleHtmlMarker {
		$repo = $this->createMock( SignatureRepository::class );
		$repo->method( 'mark_html_outdated' )->willReturnCallback(
			function ( ?array $ids ): int {
				$this->marked[] = $ids;
				return null === $ids ? 10 : count( $ids );
			}
		);
		return new StaleHtmlMarker( $repo );
	}

	/**
	 * @param array<string, mixed> $props User props.
	 */
	private function user( int $id, array $props = [] ): object {
		$user = new \WP_User(
			array_merge(
				[
					'ID'           => $id,
					'display_name' => 'Ana López',
					'user_email'   => 'ana@acme.test',
					'user_url'     => '',
				],
				$props
			)
		);
		$this->users[ $id ] = $user;
		return $user;
	}

	// ---------------------------------------------------------------
	// Repository: one cheap, idempotent UPDATE.
	// ---------------------------------------------------------------

	public function test_repository_marks_users_in_one_update_that_skips_rows_already_outdated(): void {
		$wpdb = new Imgsig_Stale_Wpdb();
		$repo = new SignatureRepository( $wpdb );

		$this->assertSame( 3, $repo->mark_html_outdated( [ 7, '9', 7, 0, -2 ] ) );

		$this->assertCount( 1, $wpdb->prepared );
		$sql = $wpdb->prepared[0]['sql'];
		$this->assertStringStartsWith( 'UPDATE wp_imgsig_signatures SET compiled_at = NULL', $sql );
		$this->assertStringContainsString( 'WHERE compiled_at IS NOT NULL AND user_id IN (%d,%d)', $sql );
		$this->assertSame( [ 7, 9 ], $wpdb->prepared[0]['args'] );
		$this->assertStringNotContainsString( 'json_content', $sql );
		$this->assertStringNotContainsString( 'updated_at', $sql, 'Listing order and the implicit primary must not move.' );
		$this->assertStringNotContainsString( 'FIND_IN_SET', $sql );
	}

	public function test_repository_marks_everyone_without_binding_ids(): void {
		$wpdb = new Imgsig_Stale_Wpdb();
		$repo = new SignatureRepository( $wpdb );

		$this->assertSame( 3, $repo->mark_html_outdated( null ) );
		$this->assertSame( [ 'UPDATE wp_imgsig_signatures SET compiled_at = NULL WHERE compiled_at IS NOT NULL' ], $wpdb->queries );
	}

	public function test_repository_chunks_large_id_lists_and_ignores_empty_ones(): void {
		$wpdb = new Imgsig_Stale_Wpdb();
		$repo = new SignatureRepository( $wpdb );

		$this->assertSame( 0, $repo->mark_html_outdated( [] ) );
		$this->assertSame( [], $wpdb->queries );

		$repo->mark_html_outdated( range( 1, SignatureRepository::ID_CHUNK + 1 ) );
		$this->assertCount( 2, $wpdb->queries );
		$this->assertCount( SignatureRepository::ID_CHUNK, $wpdb->prepared[0]['args'] );
		$this->assertSame( [ SignatureRepository::ID_CHUNK + 1 ], $wpdb->prepared[1]['args'] );
	}

	public function test_summaries_are_grouped_by_owner_without_blobs(): void {
		$wpdb          = new Imgsig_Stale_Wpdb();
		$wpdb->results = [
			[
				'id'       => 3,
				'user_id'  => 7,
				'name'     => 'A',
				'has_html' => 1,
			],
			[
				'id'       => 2,
				'user_id'  => 7,
				'name'     => 'B',
				'has_html' => 0,
			],
			[
				'id'       => 5,
				'user_id'  => 9,
				'name'     => 'C',
				'has_html' => 1,
			],
		];
		$repo = new SignatureRepository( $wpdb );

		$out = $repo->summaries_for_users( [ 7, 9 ] );

		$this->assertSame( [ 3, 2 ], array_map( static fn( $s ) => $s->id, $out[7] ) );
		$this->assertSame( [ 5 ], array_map( static fn( $s ) => $s->id, $out[9] ) );
		$this->assertStringNotContainsString( 'json_content', $wpdb->prepared[0]['sql'] );
		$this->assertStringContainsString( 'html_hash', $wpdb->prepared[0]['sql'] );
		$this->assertSame( [], $repo->summaries_for_users( [] ) );
	}

	// ---------------------------------------------------------------
	// Listeners.
	// ---------------------------------------------------------------

	public function test_profile_update_marks_the_users_signatures_and_announces_it(): void {
		Actions\expectDone( 'imgsig/signature/html_outdated' )->once()->with( [ 7 ], 'profile', 1 );

		$this->marker()->on_profile_updated( 7 );

		$this->assertSame( [ [ 7 ] ], $this->marked );
	}

	public function test_wp_profile_update_only_counts_fields_the_signature_reads(): void {
		$marker = $this->marker();
		$before = clone $this->user( 7 );

		// Password / colour scheme change: nothing the signature shows.
		$marker->on_wp_profile_update( 7, $before );
		$this->assertSame( [], $this->marked );

		$this->user( 7, [ 'display_name' => 'Ana López Ruiz' ] );
		$marker->on_wp_profile_update( 7, $before );
		$this->assertSame( [ [ 7 ] ], $this->marked );
	}

	public function test_name_meta_and_mapped_profile_meta_mark_but_other_meta_does_not(): void {
		$this->options[ ProfileFields::OPTION ] = [
			'mapping' => [
				'phone'     => [
					'source'   => 'meta',
					'meta_key' => 'billing_phone',
				],
				'job_title' => [
					'source'   => 'meta',
					'meta_key' => 'display_name',
				],
			],
		];
		$marker = $this->marker();

		$marker->on_user_meta_changed( 1, 7, 'session_tokens' );
		$marker->on_user_meta_changed( 1, 7, 'imgsig_deploy_status' );
		$marker->on_user_meta_changed( 1, 7, 'imgsig_profile' );
		$this->assertSame( [], $this->marked, 'Unrelated and plugin-owned meta never mark.' );

		$marker->on_user_meta_changed( 1, 7, 'first_name' );
		$marker->on_user_meta_changed( [ 1 ], 8, 'billing_phone' );
		$this->assertSame( [ [ 7 ], [ 8 ] ], $this->marked );
	}

	public function test_extra_meta_keys_can_be_watched_through_the_filter(): void {
		Monkey\Filters\expectApplied( 'imgsig/signature/stale_meta_keys' )->once()->andReturnUsing(
			static function ( array $keys ): array {
				$keys[] = 'hr_employee_number';
				return $keys;
			}
		);
		$marker = $this->marker();

		$marker->on_user_meta_changed( 1, 7, 'hr_employee_number' );
		$marker->on_user_meta_changed( 1, 7, 'last_name' );
		$this->assertSame( [ [ 7 ], [ 7 ] ], $this->marked );
	}

	public function test_group_membership_changes_mark_added_and_removed_users(): void {
		$this->marker()->on_members_changed( 4, [ 7, 8 ], [ 9 ] );
		$this->assertSame( [ [ 7, 8, 9 ] ], $this->marked );
	}

	public function test_group_edits_and_deletions_mark_the_members(): void {
		$this->members[4] = [ 9, 7 ];
		$marker           = $this->marker();

		$marker->on_group_saved( 4, 'created' );
		$this->assertSame( [], $this->marked, 'A new group has no members.' );

		$marker->on_group_saved( 4, 'updated' );
		$marker->on_term_deleting( 4, Groups::TAXONOMY );
		$marker->on_term_deleting( 4, 'category' );
		$this->assertSame( [ [ 7, 9 ], [ 7, 9 ] ], $this->marked );
	}

	public function test_empty_groups_mark_nothing(): void {
		$this->marker()->on_group_saved( 4, 'updated' );
		$this->assertSame( [], $this->marked );
	}

	public function test_profile_field_mapping_changes_mark_everyone(): void {
		Actions\expectDone( 'imgsig/signature/html_outdated' )->once()->with( null, 'profile_fields', 10 );
		$this->marker()->on_profile_fields_changed();
		$this->assertSame( [ null ], $this->marked );
	}

	public function test_site_settings_only_mark_for_values_that_reach_the_html(): void {
		$marker = $this->marker();
		$kit    = BrandKit::sanitize( [ 'company' => [ 'name' => 'Acme' ] ] );

		// Typography only: editor defaults, not compiled output.
		$typography                              = $kit;
		$typography['typography']['font_family'] = 'Georgia, serif';
		$marker->on_site_settings_changed( [ 'brand_kit' ], [ 'brand_kit' => $kit ], [ 'brand_kit' => $typography ] );
		$this->assertSame( [], $this->marked );

		$renamed                    = $kit;
		$renamed['company']['name'] = 'Acme Corp';
		$marker->on_site_settings_changed( [ 'brand_kit' ], [ 'brand_kit' => $kit ], [ 'brand_kit' => $renamed ] );
		$marker->on_site_settings_changed( [ 'compliance_footer' ] );
		$this->assertSame( [ null, null ], $this->marked );
	}

	public function test_saving_campaigns_marks_everyone_and_resets_the_window_check(): void {
		$this->options['imgsig_banner_campaigns'] = [ self::campaign( 'c1', '2026-11-01', '' ) ];

		$this->marker()->on_site_settings_changed( [ 'banner_campaigns' ] );

		$this->assertSame( [ null ], $this->marked );
		$this->assertSame( StaleHtmlMarker::campaign_window_fingerprint(), $this->options[ StaleHtmlMarker::CAMPAIGN_WINDOW_OPTION ] );
	}

	public function test_daily_check_marks_everyone_when_a_campaign_starts_or_ends(): void {
		$this->options['imgsig_banner_campaigns'] = [
			self::campaign( 'live', '2026-11-01', '2026-11-30' ),
			self::campaign( 'later', '2026-12-01', '' ),
		];
		$marker = $this->marker();

		$marker->check_campaign_window();
		$this->assertSame( [], $this->marked, 'First run only records the state.' );

		$marker->check_campaign_window();
		$this->assertSame( [], $this->marked, 'Nothing started or ended.' );

		Functions\when( 'current_time' )->justReturn( '2026-12-01' );
		$marker->check_campaign_window();
		$this->assertSame( [ null ], $this->marked );
	}

	public function test_saving_an_unchanged_field_mapping_does_not_announce_a_change(): void {
		$stored = ProfileFields::sanitize_config( [] );
		$this->options[ ProfileFields::OPTION ] = $stored;
		Actions\expectDone( 'imgsig/profile/fields_changed' )->never();
		ProfileFields::save_config( $stored );

		Actions\expectDone( 'imgsig/profile/fields_changed' )->once();
		$changed                                 = $stored;
		$changed['mapping']['phone']['source']   = 'meta';
		$changed['mapping']['phone']['meta_key'] = 'billing_phone';
		$this->assertSame( $changed, ProfileFields::save_config( $changed ) );
	}

	public function test_register_hooks_every_listener(): void {
		$this->marker()->register();

		foreach ( [ 'imgsig/profile/updated', 'profile_update', 'updated_user_meta', 'added_user_meta', 'deleted_user_meta', 'imgsig/group/members_changed', 'imgsig/group/saved', 'pre_delete_term', 'imgsig/profile/fields_changed', 'imgsig/site_settings/changed', 'imgsig_daily_cleanup' ] as $hook ) {
			$this->assertNotFalse( has_action( $hook ), $hook );
		}
	}

	/**
	 * @return array<string, mixed>
	 */
	private static function campaign( string $id, string $start, string $end ): array {
		return [
			'id'         => $id,
			'name'       => $id,
			'enabled'    => true,
			'image_url'  => 'https://cdn.acme.test/' . $id . '.png',
			'link_url'   => '',
			'alt'        => '',
			'width'      => 600,
			'start_date' => $start,
			'end_date'   => $end,
			'groups'     => [],
		];
	}
}
