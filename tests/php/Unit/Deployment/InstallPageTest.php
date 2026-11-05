<?php
/**
 * Unit tests for the public install page.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Deployment\Install\BrandColors;
use ImaginaSignatures\Deployment\Install\InstallPage;
use ImaginaSignatures\Deployment\Install\InstallService;
use ImaginaSignatures\Deployment\Install\InstallTokens;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Services\SignatureService;
use ImaginaSignatures\Tests\Unit\Settings\BrandKitStubs;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/DeploymentStubs.php';
require_once __DIR__ . '/../Settings/BrandKitStubs.php';

/**
 * @covers \ImaginaSignatures\Deployment\Install\InstallPage
 */
final class InstallPageTest extends TestCase {

	use DeploymentStubs;
	use BrandKitStubs;

	private string $token;

	private ?Signature $primary = null;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_wordpress();
		$this->stub_sanitizers();

		if ( ! defined( 'IMGSIG_FILE' ) ) {
			define( 'IMGSIG_FILE', '/srv/wp/wp-content/plugins/imagina-signatures/imagina-signatures.php' );
		}

		$this->token   = str_repeat( 'e', 64 );
		$this->primary = null;
		$this->add_user(
			9,
			[
				'display_name' => 'Ana <script>alert(1)</script>',
				'first_name'   => '',
			]
		);
		$this->meta[9][ InstallTokens::META_KEY ] = $this->token;

		$this->options['imgsig_brand_kit'] = [
			'company'    => [
				'name'     => 'Acme & Sons "Ltd"',
				'logo_url' => 'https://cdn.example.com/logo.png',
			],
			'typography' => [ 'accent_color' => '#ff6600' ],
		];
		$this->options['date_format'] = 'Y-m-d';

		Functions\when( 'get_users' )->alias(
			function ( array $args ): array {
				$out = [];
				foreach ( $this->meta as $id => $meta ) {
					if ( ( $meta[ $args['meta_key'] ] ?? null ) === $args['meta_value'] ) {
						$out[] = $id;
					}
				}
				return $out;
			}
		);
		Functions\when( 'get_user_locale' )->justReturn( 'es_ES' );
		Functions\when( 'get_locale' )->justReturn( 'en_US' );
		Functions\when( 'determine_locale' )->justReturn( 'es_ES' );
		Functions\when( 'is_rtl' )->justReturn( false );
		Functions\when( 'rest_url' )->alias(
			static function ( $path = '' ): string {
				return 'https://api.example.com/wp-json/' . ltrim( (string) $path, '/' );
			}
		);
		Functions\when( 'plugins_url' )->alias(
			static function ( $path = '' ): string {
				return 'https://example.com/wp-content/plugins/imagina-signatures/' . $path;
			}
		);
		Functions\when( 'add_query_arg' )->alias(
			static function ( $key, $value, $url ): string {
				return $url . '?' . $key . '=' . $value;
			}
		);
		Functions\when( 'wp_date' )->alias(
			static function ( $format, $ts ): string {
				return gmdate( (string) $format, (int) $ts );
			}
		);
		Functions\when( 'wp_strip_all_tags' )->alias( 'strip_tags' );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	private function page(): InstallPage {
		$signatures = $this->createMock( SignatureService::class );
		$signatures->method( 'primary_for_user' )->willReturnCallback(
			function (): ?Signature {
				return $this->primary;
			}
		);
		return new InstallPage( new InstallService( $signatures ) );
	}

	/**
	 * @param array{status: int, headers: array<string, string>, body: string} $response Response.
	 */
	private static function nonce_of( array $response ): string {
		preg_match( "/script-src 'nonce-([A-Za-z0-9+\/=]+)'/", $response['headers']['Content-Security-Policy'], $m );
		return $m[1] ?? '';
	}

	/**
	 * @param array{status: int, headers: array<string, string>, body: string} $response Response.
	 */
	private function assert_private_headers( array $response ): void {
		$h = $response['headers'];
		$this->assertStringContainsString( "default-src 'none'", $h['Content-Security-Policy'] );
		$this->assertStringNotContainsString( 'unsafe-inline', explode( 'style-src', $h['Content-Security-Policy'] )[0], 'scripts never run inline' );
		$this->assertStringContainsString( "frame-ancestors 'none'", $h['Content-Security-Policy'] );
		$this->assertStringContainsString( "base-uri 'none'", $h['Content-Security-Policy'] );
		$this->assertSame( 'noindex, nofollow, noarchive', $h['X-Robots-Tag'] );
		$this->assertSame( 'no-referrer', $h['Referrer-Policy'] );
		$this->assertSame( 'DENY', $h['X-Frame-Options'] );
		$this->assertStringContainsString( 'no-store', $h['Cache-Control'] );
		$this->assertStringContainsString( '<meta name="robots" content="noindex,nofollow,noarchive">', $response['body'] );
	}

	public function test_unknown_token_gets_a_404_page_without_scripts(): void {
		$response = $this->page()->build( str_repeat( 'f', 64 ) );

		$this->assertSame( 404, $response['status'] );
		$this->assert_private_headers( $response );
		$this->assertStringContainsString( 'This link is no longer valid', $response['body'] );
		$this->assertStringNotContainsString( '<script', $response['body'] );
	}

	public function test_token_of_a_user_without_access_is_invalid(): void {
		$this->caps[9]  = [];
		$this->primary  = self::signature( 9 );
		$response       = $this->page()->build( $this->token );

		$this->assertSame( 404, $response['status'] );
		$this->assertStringNotContainsString( 'Ana', $response['body'] );
	}

	public function test_missing_or_never_compiled_html_shows_the_being_prepared_state(): void {
		foreach ( [ null, self::never_compiled( 9 ) ] as $primary ) {
			$this->primary = $primary;
			$response      = $this->page()->build( $this->token );

			$this->assertSame( 200, $response['status'] );
			$this->assert_private_headers( $response );
			$this->assertStringContainsString( 'Your signature is being prepared', $response['body'] );
			$this->assertStringNotContainsString( '<iframe', $response['body'] );
			$this->assertStringNotContainsString( 'imgsig-install-data', $response['body'] );
		}
	}

	public function test_outdated_html_keeps_being_served(): void {
		$this->primary = self::signature( 9, false );
		$response      = $this->page()->build( $this->token );

		$this->assertSame( 200, $response['status'] );
		$this->assertStringNotContainsString( 'Your signature is being prepared', $response['body'] );
		$this->assertStringContainsString( '<iframe', $response['body'] );
		$this->assertStringContainsString( 'imgsig-install-data', $response['body'] );
	}

	public function test_page_renders_the_signature_with_nonce_csp_and_escaped_values(): void {
		$fragment      = '<table role="presentation"><tr><td style="color:#111">R&amp;D &lt;b&gt;not bold&lt;/b&gt; "q"</td></tr></table>';
		$this->primary = self::signature( 9, true, $fragment );
		$this->primary->html_text = "R&D <b>not bold</b>\n</script><script>alert(2)</script>";

		$response = $this->page()->build( $this->token );
		$body     = $response['body'];

		$this->assertSame( 200, $response['status'] );
		$this->assert_private_headers( $response );

		// The only script element runs on the per-request nonce.
		$nonce = self::nonce_of( $response );
		$this->assertNotSame( '', $nonce );
		$this->assertSame( 24, strlen( $nonce ) );
		$this->assertStringContainsString( 'install.js?ver=', $body );
		$this->assertSame( 1, preg_match_all( '/<script\b(?![^>]*application\/json)[^>]*>/', $body, $scripts ) );
		$this->assertStringContainsString( 'nonce="' . $nonce . '"', $scripts[0][0] );
		// Cloudflare Rocket Loader would re-create it without the nonce.
		$this->assertStringContainsString( 'data-cfasync="false"', $scripts[0][0] );
		$this->assertStringContainsString( 'connect-src \'self\' https://api.example.com', $response['headers']['Content-Security-Policy'] );

		// Names / brand are escaped everywhere.
		$this->assertStringNotContainsString( '<script>alert(1)', $body );
		$this->assertStringContainsString( 'Ana &lt;script&gt;alert(1)&lt;/script&gt;', $body );
		$this->assertStringNotContainsString( 'Acme & Sons', $body );
		$this->assertStringContainsString( 'Acme &amp; Sons &quot;Ltd&quot;', $body );
		$this->assertStringContainsString( 'src="https://cdn.example.com/logo.png"', $body );
		$this->assertStringContainsString( '--accent:#ff6600', $body );

		// srcdoc is encoded exactly: entities inside the signature survive
		// the attribute decoding (so `&lt;b&gt;` stays text, never a tag).
		preg_match( '/<iframe[^>]*srcdoc="([^"]*)"/', $body, $m );
		$this->assertNotEmpty( $m );
		$this->assertStringContainsString( 'R&amp;amp;D &amp;lt;b&amp;gt;not bold', $m[1] );
		$decoded = html_entity_decode( $m[1], ENT_QUOTES, 'UTF-8' );
		$this->assertStringContainsString( $fragment, $decoded );
		$this->assertStringContainsString( 'sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"', $body );
		$this->assertStringNotContainsString( 'allow-scripts', $body );

		// The JSON data block can't be broken out of.
		preg_match( '#<script type="application/json" id="imgsig-install-data">(.*?)</script>#s', $body, $json );
		$this->assertNotEmpty( $json );
		$this->assertStringNotContainsString( '<', $json[1] );
		$data = json_decode( $json[1], true );
		$this->assertSame( $fragment, $data['fragment'] );
		$this->assertSame( $this->primary->html_text, $data['text'] );
		$this->assertSame( 'es-ES', $data['lang'] );
		$this->assertSame( 'https://api.example.com/wp-json/imagina-signatures/v1/install/' . $this->token . '/installed', $data['installedUrl'] );
		$this->assertSame( 'Copied!', $data['i18n']['copied'] );

		// Client tabs + numbered steps.
		foreach ( InstallPage::CLIENTS as $client ) {
			$this->assertStringContainsString( 'data-imgsig-tab="' . $client . '"', $body );
			$this->assertStringContainsString( 'data-imgsig-panel="' . $client . '"', $body );
		}
		foreach ( [ 'copy-rich', 'copy-html', 'download-htm', 'download-txt', 'download-html', 'open-tab', 'installed' ] as $action ) {
			$this->assertStringContainsString( 'data-imgsig-action="' . $action . '"', $body );
		}
		$this->assertStringContainsString( '<ol class="steps">', $body );
		$this->assertStringContainsString( '%APPDATA%\\Microsoft\\Signatures', $body );

		// Opening the page is recorded for the team console.
		$this->assertArrayHasKey( 'opened_at', $this->meta[9]['imgsig_deploy_status']['install'] );
	}

	public function test_nonce_changes_on_every_request(): void {
		$this->primary = self::signature( 9 );
		$this->assertNotSame( self::nonce_of( $this->page()->build( $this->token ) ), self::nonce_of( $this->page()->build( $this->token ) ) );
	}

	public function test_outdated_install_is_flagged_and_current_install_dated(): void {
		$this->primary                         = self::signature( 9 );
		$this->meta[9]['imgsig_deploy_status'] = [
			'install' => [
				'installed_at' => '2026-11-02 10:00:00',
				'hash'         => 'an-older-hash',
			],
		];
		$this->assertStringContainsString( 'Your signature has changed since you installed it.', $this->page()->build( $this->token )['body'] );

		$this->meta[9]['imgsig_deploy_status']['install']['hash'] = $this->primary->html_hash;
		$body = $this->page()->build( $this->token )['body'];
		$this->assertStringNotContainsString( 'Your signature has changed', $body );
		$this->assertStringContainsString( 'Installed on 2026-11-02.', $body );
	}

	public function test_accent_buttons_get_readable_text(): void {
		$this->assertSame( '#ffffff', BrandColors::text_on( '#2563eb' ) );
		$this->assertSame( '#ffffff', BrandColors::text_on( '#000' ) );
		$this->assertSame( '#111827', BrandColors::text_on( '#ffffff' ) );
		$this->assertSame( '#111827', BrandColors::text_on( '#fde047' ) );
		$this->assertSame( '#ffffff', BrandColors::text_on( 'nope' ) );

		$this->options['imgsig_brand_kit']['typography']['accent_color'] = '#fde047';
		$this->primary = self::signature( 9 );
		$this->assertStringContainsString( '--accent:#fde047;--on-accent:#111827', $this->page()->build( $this->token )['body'] );
	}

	public function test_attr_exact_double_encodes_entities(): void {
		$this->assertSame( '&amp;lt;b&amp;gt; &quot;&#039;', InstallPage::attr_exact( '&lt;b&gt; "\'' ) );
	}
}
