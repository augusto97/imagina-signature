<?php
/**
 * HTML compiled by an editor whose bootstrap inputs changed since it
 * loaded is stored, but stays outdated.
 *
 * @package ImaginaSignatures\Tests\Unit\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Services;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Services\HtmlSanitizer;
use ImaginaSignatures\Services\JsonSchemaValidator;
use ImaginaSignatures\Services\RenderInputs;
use ImaginaSignatures\Services\SchemaSanitizer;
use ImaginaSignatures\Services\SignatureService;
use ImaginaSignatures\Tests\Unit\Settings\BrandKitStubs;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../Settings/BrandKitStubs.php';

if ( ! defined( 'ARRAY_A' ) ) {
	define( 'ARRAY_A', 'ARRAY_A' );
}

/**
 * Captures what SignatureRepository::insert() / update() hand to $wpdb.
 */
final class Imgsig_Capture_Wpdb extends \wpdb { // phpcs:ignore

	/** @var array<string, mixed>|null */
	public ?array $inserted = null;

	/** @var array<string, mixed>|null */
	public ?array $updated = null;

	/**
	 * @param string              $table  Table.
	 * @param array<string,mixed> $data   Data.
	 * @param mixed               $format Formats.
	 * @return int
	 */
	public function insert( $table, $data, $format = null ) {
		$this->inserted  = $data;
		$this->insert_id = 9;
		return 1;
	}

	/**
	 * @param string              $table        Table.
	 * @param array<string,mixed> $data         Data.
	 * @param array<string,mixed> $where        Where.
	 * @param mixed               $format       Formats.
	 * @param mixed               $where_format Where formats.
	 * @return int
	 */
	public function update( $table, $data, $where, $format = null, $where_format = null ) {
		$this->updated = $data;
		return 1;
	}

	/**
	 * @param string|null $query  SQL.
	 * @param string      $output Output.
	 * @return array<string, mixed>
	 */
	public function get_row( $query = null, $output = 'OBJECT' ) {
		return [
			'id'      => 9,
			'user_id' => 3,
		];
	}
}

/**
 * @covers \ImaginaSignatures\Services\SignatureService
 * @covers \ImaginaSignatures\Repositories\SignatureRepository::insert
 * @covers \ImaginaSignatures\Repositories\SignatureRepository::update
 */
final class StaleInputsSaveTest extends TestCase {

	use BrandKitStubs;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		imgsig_tests_load_kses();
		$this->stub_sanitizers();
		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'wp_strip_all_tags' )->alias( 'strip_tags' );
		Functions\when( 'get_user_meta' )->justReturn( '' );
		Functions\when( 'get_option' )->alias(
			static function ( $name, $default = false ) {
				return $default;
			}
		);
		Functions\when( 'wp_get_object_terms' )->justReturn( [] );
		Functions\when( 'current_time' )->justReturn( '2026-11-05' );
		Functions\when( 'get_user_locale' )->justReturn( 'es_ES' );
		Functions\when( 'plugins_url' )->justReturn( 'https://example.com/wp-content/plugins/imagina-signatures/assets' );
		Functions\when( 'untrailingslashit' )->alias(
			static function ( $value ): string {
				return rtrim( (string) $value, '/\\' );
			}
		);
		Functions\when( 'get_userdata' )->alias(
			static function ( $id ) {
				return 3 === (int) $id
					? new \WP_User(
						[
							'ID'           => 3,
							'display_name' => 'Ana López',
							'user_email'   => 'ana@acme.test',
						]
					)
					: false;
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	private static function current_hash(): string {
		return RenderInputs::fingerprint( RenderInputs::for_user( get_userdata( 3 ) ) );
	}

	/**
	 * @param array<string, mixed>|null $written Receives the update data.
	 */
	private function service( ?array &$written ): SignatureService {
		$repo = $this->createMock( SignatureRepository::class );
		$repo->method( 'find_owned_by' )->willReturn(
			Signature::from_row(
				[
					'id'           => 5,
					'user_id'      => 3,
					'json_content' => '{}',
				]
			)
		);
		$repo->method( 'update' )->willReturnCallback(
			static function ( int $id, array $data ) use ( &$written ): Signature {
				$written = $data;
				return Signature::from_row(
					[
						'id'      => $id,
						'user_id' => 3,
					]
				);
			}
		);
		return new SignatureService( $repo, new JsonSchemaValidator(), new SchemaSanitizer( new HtmlSanitizer() ) );
	}

	public function test_html_compiled_from_changed_inputs_is_flagged_outdated(): void {
		$written = null;
		$this->service( $written )->update(
			5,
			3,
			[
				'html'        => '<table><tr><td>Ana</td></tr></table>',
				'inputs_hash' => str_repeat( 'a', 64 ),
			]
		);

		$this->assertTrue( $written['html_outdated'] ?? false );
		$this->assertArrayHasKey( 'html_cache', $written, 'The HTML is still stored.' );
	}

	public function test_html_compiled_from_current_inputs_is_fresh(): void {
		$written = null;
		$this->service( $written )->update(
			5,
			3,
			[
				'html'        => '<table><tr><td>Ana</td></tr></table>',
				'inputs_hash' => self::current_hash(),
			]
		);

		$this->assertArrayNotHasKey( 'html_outdated', $written );
	}

	public function test_saves_without_a_fingerprint_are_trusted_as_before(): void {
		$written = null;
		$this->service( $written )->update( 5, 3, [ 'html' => '<table><tr><td>Ana</td></tr></table>' ] );
		$this->assertArrayNotHasKey( 'html_outdated', $written );

		$written = null;
		$this->service( $written )->update(
			5,
			3,
			[
				'name'        => 'Renamed',
				'inputs_hash' => str_repeat( 'a', 64 ),
			]
		);
		$this->assertArrayNotHasKey( 'html_outdated', $written, 'No HTML, nothing to flag.' );
	}

	public function test_repository_leaves_compiled_at_empty_for_outdated_html(): void {
		$wpdb = new Imgsig_Capture_Wpdb();
		$repo = new SignatureRepository( $wpdb );

		$repo->update(
			5,
			[
				'html_cache'    => '<table></table>',
				'html_outdated' => true,
			]
		);
		$this->assertArrayHasKey( 'compiled_at', $wpdb->updated );
		$this->assertNull( $wpdb->updated['compiled_at'] );
		$this->assertArrayNotHasKey( 'html_outdated', $wpdb->updated, 'Not a column.' );

		$repo->update( 5, [ 'html_cache' => '<table></table>' ] );
		$this->assertSame( $wpdb->updated['updated_at'], $wpdb->updated['compiled_at'] );

		$repo->insert(
			[
				'user_id'       => 3,
				'html_cache'    => '<table></table>',
				'html_outdated' => true,
			]
		);
		$this->assertNull( $wpdb->inserted['compiled_at'] );
	}
}
