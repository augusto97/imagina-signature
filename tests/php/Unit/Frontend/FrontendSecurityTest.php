<?php
/**
 * Unit tests for the public route's CSP and main-query short-circuit.
 *
 * @package ImaginaSignatures\Tests\Unit\Frontend
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Frontend;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Frontend\FrontendPage;
use ImaginaSignatures\Frontend\FrontendRouter;
use PHPUnit\Framework\TestCase;

/**
 * Minimal WP_Query stand-in.
 */
final class FakeQuery { // phpcs:ignore

	/** @var array<string, mixed> */
	private array $vars;

	private bool $main;

	/** @var int */
	public $found_posts = 10;

	/** @var int */
	public $max_num_pages = 2;

	/**
	 * @param array<string, mixed> $vars Query vars.
	 * @param bool                 $main Main query?
	 */
	public function __construct( array $vars, bool $main = true ) {
		$this->vars = $vars;
		$this->main = $main;
	}

	public function is_main_query(): bool {
		return $this->main;
	}

	/**
	 * @return mixed
	 */
	public function get( string $key ) {
		return $this->vars[ $key ] ?? '';
	}
}

/**
 * @covers \ImaginaSignatures\Frontend\FrontendPage::content_security_policy
 * @covers \ImaginaSignatures\Frontend\FrontendRouter
 */
final class FrontendSecurityTest extends TestCase {

	private bool $enabled = true;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->enabled = true;
		Functions\when( 'get_option' )->alias(
			function ( $name, $default = false ) {
				return 'imgsig_frontend_access' === $name ? [ 'enabled' => $this->enabled ] : $default;
			}
		);
		Functions\when( 'sanitize_key' )->returnArg( 1 );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_csp_uses_nonce_instead_of_unsafe_inline_scripts(): void {
		$csp = FrontendPage::content_security_policy(
			'bm9uY2U=',
			[ 'https://acct.r2.cloudflarestorage.com', 'https://example.com' ],
			[ 'https://cdn.example.com' ]
		);

		$directives = [];
		foreach ( array_filter( array_map( 'trim', explode( ';', $csp ) ) ) as $directive ) {
			$parts                   = explode( ' ', $directive, 2 );
			$directives[ $parts[0] ] = $parts[1] ?? '';
		}

		$this->assertSame( "'self' https://cdn.example.com 'nonce-bm9uY2U='", $directives['script-src'] );
		$this->assertStringNotContainsString( 'unsafe-inline', $directives['script-src'] );
		$this->assertStringContainsString( "'unsafe-inline'", $directives['style-src'] );
		$this->assertSame( "'self' https://acct.r2.cloudflarestorage.com https://example.com", $directives['connect-src'] );
		$this->assertSame( "'none'", $directives['object-src'] );
		$this->assertSame( "'self'", $directives['base-uri'] );
		$this->assertSame( "'self'", $directives['frame-ancestors'] );
		$this->assertStringContainsString( 'data:', $directives['img-src'] );
		$this->assertStringContainsString( 'https:', $directives['img-src'] );
	}

	public function test_csp_never_emits_wildcards_or_injected_directives(): void {
		$csp = FrontendPage::content_security_policy(
			'abc',
			[ 'https:', '*', "https://evil.example; script-src 'unsafe-inline'", 'https://ok.example:9000' ]
		);

		$this->assertStringContainsString( "connect-src 'self' https://ok.example:9000;", $csp );
		$this->assertStringNotContainsString( 'evil.example', $csp );
		$this->assertStringNotContainsString( '*', $csp );
		$this->assertSame( 1, substr_count( $csp, 'script-src' ) );
	}

	public function test_main_query_is_short_circuited_on_the_public_route_only(): void {
		$ours = new FakeQuery( [ FrontendRouter::QV_VIEW => 'index' ] );
		$this->assertSame( [], FrontendRouter::short_circuit_main_query( null, $ours ) );
		$this->assertSame( 0, $ours->found_posts );
		$this->assertTrue( FrontendRouter::skip_404_handling( false, $ours ) );

		$home = new FakeQuery( [] );
		$this->assertNull( FrontendRouter::short_circuit_main_query( null, $home ) );
		$this->assertFalse( FrontendRouter::skip_404_handling( false, $home ) );

		$secondary = new FakeQuery( [ FrontendRouter::QV_VIEW => 'index' ], false );
		$this->assertNull( FrontendRouter::short_circuit_main_query( null, $secondary ) );
	}

	public function test_disabled_route_falls_back_to_normal_query_and_404(): void {
		$this->enabled = false;
		$ours          = new FakeQuery( [ FrontendRouter::QV_VIEW => 'editor' ] );

		$this->assertNull( FrontendRouter::short_circuit_main_query( null, $ours ) );
		$this->assertFalse( FrontendRouter::skip_404_handling( false, $ours ) );
	}
}
