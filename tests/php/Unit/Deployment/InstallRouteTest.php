<?php
/**
 * Unit tests for the install-link rewrite route.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Frontend\FrontendRouter;
use PHPUnit\Framework\TestCase;

/**
 * Minimal main WP_Query stand-in.
 */
final class InstallRouteQuery { // phpcs:ignore

	/** @var array<string, mixed> */
	private array $vars;

	/** @var int */
	public $found_posts = 10;

	/** @var int */
	public $max_num_pages = 2;

	/**
	 * @param array<string, mixed> $vars Query vars.
	 */
	public function __construct( array $vars ) {
		$this->vars = $vars;
	}

	public function is_main_query(): bool {
		return true;
	}

	/**
	 * @return mixed
	 */
	public function get( string $key ) {
		return $this->vars[ $key ] ?? '';
	}
}

/**
 * @covers \ImaginaSignatures\Frontend\FrontendRouter
 */
final class InstallRouteTest extends TestCase {

	/** @var array<int, array{0: string, 1: string, 2: string}> */
	private array $rules = [];

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->rules = [];
		Functions\when( 'get_option' )->alias(
			static function ( $name, $default = false ) {
				// Editor route DISABLED, custom slug.
				return 'imgsig_frontend_access' === $name ? [
					'enabled' => false,
					'slug'    => 'firmas',
				] : $default;
			}
		);
		Functions\when( 'add_rewrite_rule' )->alias(
			function ( $regex, $query, $after = 'bottom' ): void {
				$this->rules[] = [ (string) $regex, (string) $query, (string) $after ];
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_install_rule_is_registered_with_the_other_rules_under_the_slug(): void {
		FrontendRouter::register_rewrite_rules();

		$install = array_values(
			array_filter(
				$this->rules,
				static function ( array $rule ): bool {
					return false !== strpos( $rule[1], FrontendRouter::QV_INSTALL . '=' );
				}
			)
		);
		$this->assertCount( 1, $install );
		$this->assertSame( '^firmas/install/([a-f0-9]{64})/?$', $install[0][0] );
		$this->assertSame( 'index.php?imgsig_install=$matches[1]', $install[0][1] );
		$this->assertSame( 'top', $install[0][2] );

		$this->assertSame( 1, preg_match( '#' . $install[0][0] . '#', 'firmas/install/' . str_repeat( 'a', 64 ) . '/' ) );
		$this->assertSame( 0, preg_match( '#' . $install[0][0] . '#', 'firmas/install/' . str_repeat( 'A', 64 ) . '/' ) );
		$this->assertSame( 0, preg_match( '#' . $install[0][0] . '#', 'firmas/install/abc/' ) );
	}

	public function test_install_query_var_is_public(): void {
		$this->assertContains( FrontendRouter::QV_INSTALL, FrontendRouter::register_query_vars( [] ) );
	}

	public function test_install_requests_are_ours_even_while_the_editor_route_is_disabled(): void {
		$install = new InstallRouteQuery( [ FrontendRouter::QV_INSTALL => str_repeat( 'a', 64 ) ] );
		$this->assertSame( [], FrontendRouter::short_circuit_main_query( null, $install ) );
		$this->assertTrue( FrontendRouter::skip_404_handling( false, $install ) );

		$editor = new InstallRouteQuery( [ FrontendRouter::QV_VIEW => 'index' ] );
		$this->assertNull( FrontendRouter::short_circuit_main_query( null, $editor ), 'the disabled editor route still 404s' );
	}

	public function test_deactivation_unregisters_the_install_rule_too(): void {
		global $wp_rewrite;
		$previous   = $wp_rewrite;
		$wp_rewrite = (object) [
			'extra_rules_top' => [
				'^firmas/install/([a-f0-9]{64})/?$' => 'index.php?imgsig_install=$matches[1]',
				'^firmas/?$'                        => 'index.php?imgsig_frontend=index',
				'^shop/?$'                          => 'index.php?pagename=shop',
			],
		];

		FrontendRouter::unregister_rewrite_rules();
		$this->assertSame( [ '^shop/?$' => 'index.php?pagename=shop' ], $wp_rewrite->extra_rules_top );

		$wp_rewrite = $previous; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
	}
}
