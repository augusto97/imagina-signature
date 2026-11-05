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
		Functions\when( 'get_user_meta' )->justReturn( '' );
		Functions\when( 'get_option' )->justReturn( [] );
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

		// 1.3.0: every canonical profile key, '' when the profile is empty.
		$this->assertSame( '', $vars['job_title'] );
		$this->assertSame( '', $vars['pronouns'] );
		$this->assertCount( 5 + 10 + 15, $vars );
	}

	public function test_includes_profile_values(): void {
		$vars = SystemVariables::for_user(
			$this->user(),
			$this->kit(),
			[
				'job_title' => 'CTO',
				'phone'     => '+34 600 000 000',
			]
		);

		$this->assertSame( 'CTO', $vars['job_title'] );
		$this->assertSame( '+34 600 000 000', $vars['phone'] );
		$this->assertSame( 'Acme', $vars['company_name'] );
	}

	public function test_resolves_profile_values_from_user_meta(): void {
		Functions\when( 'get_user_meta' )->alias(
			static function ( $user_id, $key ) {
				return 7 === $user_id && 'imgsig_profile' === $key ? [ 'department' => 'Ventas' ] : '';
			}
		);

		$vars = SystemVariables::for_user( $this->user(), $this->kit() );
		$this->assertSame( 'Ventas', $vars['department'] );
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
