<?php
/**
 * Unit tests for the brand kit on `/admin/site-settings`.
 *
 * @package ImaginaSignatures\Tests\Unit\Api
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Api;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Api\Controllers\SiteSettingsController;
use ImaginaSignatures\Settings\BrandKit;
use ImaginaSignatures\Tests\Unit\Settings\BrandKitStubs;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../Settings/BrandKitStubs.php';

/**
 * In-memory `wp_options` table for the controller's direct `$wpdb`
 * writes and cache-bypassing reads.
 */
final class Imgsig_Options_Wpdb extends \wpdb { // phpcs:ignore

	/** @var array<string, array{value: string, autoload: string}> */
	public array $rows = [];

	/** @var array<int, mixed> */
	private array $args = [];

	/**
	 * @param string $query   SQL.
	 * @param mixed  ...$args Values.
	 * @return string
	 */
	public function prepare( $query, ...$args ) {
		$this->args = $args;
		return (string) $query;
	}

	/**
	 * @param string|null $query SQL.
	 * @return mixed
	 */
	public function get_var( $query = null ) {
		$name = (string) ( $this->args[0] ?? '' );
		if ( ! isset( $this->rows[ $name ] ) ) {
			return null;
		}
		return false !== strpos( (string) $query, 'option_id' ) ? '1' : $this->rows[ $name ]['value'];
	}

	/**
	 * @param string              $table  Table.
	 * @param array<string,mixed> $data   Data.
	 * @param mixed               $format Formats.
	 * @return int
	 */
	public function insert( $table, $data, $format = null ) {
		$this->rows[ (string) $data['option_name'] ] = [
			'value'    => (string) $data['option_value'],
			'autoload' => (string) $data['autoload'],
		];
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
		$name = (string) $where['option_name'];
		if ( ! isset( $this->rows[ $name ] ) ) {
			return 0;
		}
		$this->rows[ $name ] = [
			'value'    => (string) $data['option_value'],
			'autoload' => (string) $data['autoload'],
		];
		return 1;
	}
}

/**
 * @covers \ImaginaSignatures\Api\Controllers\SiteSettingsController
 */
final class SiteSettingsBrandKitTest extends TestCase {

	use BrandKitStubs;

	private Imgsig_Options_Wpdb $db;

	/** @var mixed */
	private $previous_wpdb;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_sanitizers();

		$this->previous_wpdb = $GLOBALS['wpdb'] ?? null;
		$this->db            = new Imgsig_Options_Wpdb();
		$GLOBALS['wpdb']     = $this->db;

		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'maybe_serialize' )->alias(
			static function ( $value ) {
				return is_array( $value ) || is_object( $value ) ? serialize( $value ) : $value; // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.serialize_serialize
			}
		);
		Functions\when( 'maybe_unserialize' )->alias(
			static function ( $value ) {
				$out = @unserialize( (string) $value ); // phpcs:ignore
				return false === $out ? $value : $out;
			}
		);
		Functions\when( 'wp_cache_delete' )->justReturn( true );
		Functions\when( 'current_time' )->justReturn( '2026-11-05' );
		Functions\when( 'rest_ensure_response' )->alias(
			static function ( $data ) {
				return $data instanceof \WP_REST_Response ? $data : new \WP_REST_Response( $data );
			}
		);
		// get_option() reads the same in-memory table.
		Functions\when( 'get_option' )->alias(
			function ( $name, $fallback = false ) {
				$row = $this->db->rows[ (string) $name ] ?? null;
				return null === $row ? $fallback : unserialize( $row['value'] ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.serialize_unserialize
			}
		);
	}

	protected function tearDown(): void {
		$GLOBALS['wpdb'] = $this->previous_wpdb;
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * @param array<string, mixed> $body Request params.
	 * @return mixed
	 */
	private function patch( array $body ) {
		$response = ( new SiteSettingsController() )->update( new \WP_REST_Request( $body ) );
		return $response instanceof \WP_REST_Response ? $response->get_data() : $response;
	}

	public function test_patch_sanitises_and_stores_an_autoloaded_kit(): void {
		Functions\when( 'current_user_can' )->justReturn( true );

		$data = $this->patch(
			[
				'brand_kit' => [
					'company'    => [
						'name'       => '<b>Acme</b>',
						'website'    => 'javascript:alert(1)',
						'logo_url'   => 'https://cdn.acme.com/logo.png',
						'logo_width' => 5000,
					],
					'social'     => [ 'linkedin' => 'linkedin.com/company/acme' ],
					'typography' => [
						'font_family' => 'Comic Sans MS',
						'text_color'  => '#222222',
					],
					'unknown'    => 'x',
				],
			]
		);

		$this->assertIsArray( $data );
		$kit = $data['brand_kit'];
		$this->assertSame( 'Acme', $kit['company']['name'] );
		$this->assertSame( '', $kit['company']['website'] );
		$this->assertSame( 'https://cdn.acme.com/logo.png', $kit['company']['logo_url'] );
		$this->assertSame( BrandKit::LOGO_WIDTH_MAX, $kit['company']['logo_width'] );
		$this->assertSame( 'https://linkedin.com/company/acme', $kit['social']['linkedin'] );
		$this->assertSame( 'Arial, sans-serif', $kit['typography']['font_family'] );
		$this->assertSame( '#222222', $kit['typography']['text_color'] );
		$this->assertArrayNotHasKey( 'unknown', $kit );

		$this->assertArrayHasKey( BrandKit::OPTION, $this->db->rows );
		$this->assertSame( 'yes', $this->db->rows[ BrandKit::OPTION ]['autoload'] );
		$this->assertSame( $kit, unserialize( $this->db->rows[ BrandKit::OPTION ]['value'] ) ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.serialize_unserialize
	}

	public function test_patch_merges_with_the_stored_kit(): void {
		Functions\when( 'current_user_can' )->justReturn( true );

		$this->patch(
			[
				'brand_kit' => [
					'company' => [
						'name'  => 'Acme',
						'phone' => '+1 555 0100',
					],
				],
			]
		);
		$data = $this->patch( [ 'brand_kit' => [ 'company' => [ 'phone' => '' ] ] ] );

		$this->assertSame( 'Acme', $data['brand_kit']['company']['name'] );
		$this->assertSame( '', $data['brand_kit']['company']['phone'] );
	}

	public function test_other_settings_keep_autoload_off(): void {
		Functions\when( 'current_user_can' )->justReturn( true );

		$this->patch( [ 'brand_palette' => [ '#ffffff' ] ] );

		$this->assertSame( 'no', $this->db->rows[ SiteSettingsController::OPT_BRAND_PALETTE ]['autoload'] );
		$this->assertArrayNotHasKey( BrandKit::OPTION, $this->db->rows, 'kit untouched when not sent' );
	}

	public function test_signature_users_can_read_the_kit(): void {
		Functions\when( 'current_user_can' )->justReturn( false );
		Functions\when( 'get_current_user_id' )->justReturn( 5 );
		Functions\when( 'wp_get_object_terms' )->justReturn( [] );
		$this->db->rows[ BrandKit::OPTION ] = [
			'value'    => serialize( [ 'company' => [ 'name' => 'Acme' ] ] ), // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.serialize_serialize
			'autoload' => 'yes',
		];

		$data = ( new SiteSettingsController() )->show()->get_data();

		$this->assertSame( 'Acme', $data['brand_kit']['company']['name'] );
		$this->assertSame( BrandKit::defaults()['typography'], $data['brand_kit']['typography'] );
	}
}
