<?php
/**
 * Unit tests for the merged editor system variables.
 *
 * @package ImaginaSignatures\Tests\Unit\Settings
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Settings;

use Brain\Monkey;
use Brain\Monkey\Filters;
use Brain\Monkey\Functions;
use ImaginaSignatures\Settings\SystemVariables;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/BrandKitStubs.php';

/**
 * @covers \ImaginaSignatures\Settings\SystemVariables
 */
final class SystemVariablesTest extends TestCase {

	use BrandKitStubs;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_sanitizers();

		if ( ! defined( 'IMGSIG_FILE' ) ) {
			define( 'IMGSIG_FILE', '/var/www/wp-content/plugins/imagina-signatures/imagina-signatures.php' );
		}
		Functions\when( 'plugins_url' )->alias(
			static function ( string $path = '', string $plugin = '' ): string {
				return 'https://example.com/wp-content/plugins/' . basename( dirname( $plugin ) ) . ( '' !== $path ? '/' . ltrim( $path, '/' ) : '' );
			}
		);
		Functions\when( 'untrailingslashit' )->alias(
			static function ( $value ): string {
				return rtrim( (string) $value, '/\\' );
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	private function user(): \WP_User {
		return new \WP_User(
			[
				'ID'           => 7,
				'display_name' => 'Jane Doe',
				'user_email'   => 'jane@acme.com',
				'first_name'   => 'Jane',
				'last_name'    => 'Doe',
				'user_url'     => 'https://jane.dev',
			]
		);
	}

	/**
	 * @return array<string, mixed>
	 */
	private function kit(): array {
		return [
			'company' => [
				'name'     => 'Acme',
				'website'  => 'acme.com',
				'logo_url' => 'https://cdn.acme.com/logo.png',
			],
			'social'  => [ 'linkedin' => 'https://linkedin.com/company/acme' ],
		];
	}

	public function test_merges_wp_and_company_variables(): void {
		$vars = SystemVariables::for_user( $this->user(), $this->kit() );

		$this->assertSame( 'Jane Doe', $vars['wp_display_name'] );
		$this->assertSame( 'jane@acme.com', $vars['wp_email'] );
		$this->assertSame( 'https://jane.dev', $vars['wp_url'] );

		$this->assertSame( 'Acme', $vars['company_name'] );
		$this->assertSame( 'https://acme.com', $vars['company_website'] );
		$this->assertSame( 'https://cdn.acme.com/logo.png', $vars['company_logo'] );
		$this->assertSame( 'https://linkedin.com/company/acme', $vars['company_linkedin'] );

		// Blank kit fields are present as '' so tokens resolve, not ship raw.
		$this->assertArrayHasKey( 'company_tiktok', $vars );
		$this->assertSame( '', $vars['company_tiktok'] );
		$this->assertSame( '', $vars['company_phone'] );

		// Templates reference their placeholder images through it.
		$this->assertSame( 'https://example.com/wp-content/plugins/imagina-signatures/assets', $vars['imgsig_assets_url'] );
		$this->assertCount( 5 + 15 + 1, $vars );
	}

	public function test_assets_url_has_no_trailing_slash(): void {
		Functions\when( 'plugins_url' )->justReturn( 'https://cdn.example.com/plugins/imagina-signatures/assets/' );

		$this->assertSame( 'https://cdn.example.com/plugins/imagina-signatures/assets', SystemVariables::assets_url() );
	}

	public function test_filter_can_point_the_assets_url_at_a_cdn(): void {
		Filters\expectApplied( 'imgsig/editor/system_variables' )
			->once()
			->andReturnUsing(
				static function ( array $vars ): array {
					$vars['imgsig_assets_url'] = 'https://cdn.example.net/imgsig/assets';
					return $vars;
				}
			);

		$vars = SystemVariables::for_user( $this->user(), $this->kit() );
		$this->assertSame( 'https://cdn.example.net/imgsig/assets', $vars['imgsig_assets_url'] );
	}

	public function test_reads_the_stored_kit_when_none_is_given(): void {
		Functions\when( 'get_option' )->justReturn( [ 'company' => [ 'tagline' => 'Since 1999' ] ] );

		$vars = SystemVariables::for_user( $this->user() );
		$this->assertSame( 'Since 1999', $vars['company_tagline'] );
	}

	public function test_filter_runs_after_the_merge(): void {
		Filters\expectApplied( 'imgsig/editor/system_variables' )
			->once()
			->with( \Mockery::on( static fn ( $vars ): bool => is_array( $vars ) && 'Acme' === $vars['company_name'] && 'Jane' === $vars['wp_first_name'] ), 7 )
			->andReturnUsing(
				static function ( array $vars ): array {
					$vars['company_name'] = 'Acme Europe';
					unset( $vars['company_x'] );
					$vars['department'] = 'Sales';
					$vars['employees']  = 250;
					$vars['bad_array']  = [ 'x' ];
					$vars[3]            = 'numeric key';
					return $vars;
				}
			);

		$vars = SystemVariables::for_user( $this->user(), $this->kit() );

		$this->assertSame( 'Acme Europe', $vars['company_name'] );
		$this->assertArrayNotHasKey( 'company_x', $vars );
		$this->assertSame( 'Sales', $vars['department'] );
		$this->assertSame( '250', $vars['employees'] );
		$this->assertArrayNotHasKey( 'bad_array', $vars );
		$this->assertArrayNotHasKey( 3, $vars );
	}
}
