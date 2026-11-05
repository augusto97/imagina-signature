<?php
/**
 * Unit tests for the invitation / reminder emails.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment;

use Brain\Monkey;
use Brain\Monkey\Actions;
use Brain\Monkey\Functions;
use ImaginaSignatures\Deployment\Install\InvitationMailer;
use ImaginaSignatures\Tests\Unit\Settings\BrandKitStubs;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/DeploymentStubs.php';
require_once __DIR__ . '/../Settings/BrandKitStubs.php';

/**
 * @covers \ImaginaSignatures\Deployment\Install\InvitationMailer
 */
final class InvitationMailerTest extends TestCase {

	use DeploymentStubs;
	use BrandKitStubs;

	private const URL = 'https://example.com/signatures/install/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/';

	/** @var array<int, array<int, mixed>> */
	private array $mails = [];

	/** @var callable|null */
	private $phpmailer_hook = null;

	/** @var string[] */
	private array $locales = [];

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_wordpress();
		$this->stub_sanitizers();
		$this->mails          = [];
		$this->phpmailer_hook = null;
		$this->locales        = [];

		$this->options['imgsig_brand_kit'] = [
			'company'    => [
				'name'       => 'Acme <b>&</b> Co',
				'logo_url'   => 'https://cdn.example.com/logo.png?a=1&b=2',
				'logo_width' => 400,
			],
			'typography' => [
				'accent_color' => '#fde047',
				'text_color'   => '#222222',
			],
		];

		Functions\when( 'get_user_locale' )->justReturn( 'es_ES' );
		Functions\when( 'switch_to_locale' )->alias(
			function ( $locale ): bool {
				$this->locales[] = 'switch:' . $locale;
				return true;
			}
		);
		Functions\when( 'restore_previous_locale' )->alias(
			function (): bool {
				$this->locales[] = 'restore';
				return true;
			}
		);
		Actions\expectAdded( 'phpmailer_init' )->zeroOrMoreTimes()->whenHappen(
			function ( $callback ): void {
				$this->phpmailer_hook = $callback;
			}
		);
		Functions\when( 'wp_mail' )->alias(
			function ( ...$args ): bool {
				$mailer          = new \stdClass();
				$mailer->AltBody = ''; // phpcs:ignore WordPress.NamingConventions.ValidVariableName
				if ( null !== $this->phpmailer_hook ) {
					( $this->phpmailer_hook )( $mailer );
				}
				$args[]        = $mailer->AltBody; // phpcs:ignore WordPress.NamingConventions.ValidVariableName
				$this->mails[] = $args;
				return true;
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	private function user(): \WP_User {
		return $this->add_user(
			4,
			[
				'first_name'   => 'Ana <img src=x onerror=alert(1)>',
				'display_name' => 'Ana López',
				'user_email'   => 'ana@example.com',
			]
		);
	}

	public function test_invitation_html_is_branded_and_escaped(): void {
		$mail = ( new InvitationMailer() )->build( $this->user(), self::URL, InvitationMailer::KIND_INVITE, "Line one <script>alert(2)</script>\nLine & two" );
		$html = $mail['html'];

		$this->assertSame( 'Your email signature is ready', $mail['subject'] );
		$this->assertStringContainsString( '<title>Your email signature is ready</title>', $html );

		// Brand kit: logo (width capped), accent button with readable text.
		$this->assertStringContainsString( 'src="https://cdn.example.com/logo.png?a=1&amp;b=2"', $html );
		$this->assertStringContainsString( 'width="200"', $html );
		$this->assertStringContainsString( 'bgcolor="#fde047"', $html );
		$this->assertStringContainsString( 'color:#111827;text-decoration:none', $html, 'dark text on a light accent' );

		// Everything user-supplied is escaped.
		$this->assertStringNotContainsString( '<img src=x', $html );
		$this->assertStringNotContainsString( '<script', $html );
		$this->assertStringContainsString( "Line one alert(2)<br>\nLine &amp; two", $html );
		$this->assertStringContainsString( 'alt="Acme &amp; Co"', $html );

		// The CTA and the fallback link carry the personal URL.
		$this->assertSame( 2, substr_count( $html, 'href="' . self::URL . '"' ) );
		$this->assertStringContainsString( 'Install my signature', $html );
	}

	public function test_plain_text_part_has_no_markup_and_quotes_the_message(): void {
		$mail = ( new InvitationMailer() )->build( $this->user(), self::URL, InvitationMailer::KIND_INVITE, "Hola\nequipo" );
		$text = $mail['text'];

		$this->assertStringNotContainsString( '<', str_replace( '<img src=x onerror=alert(1)>', '', $text ) );
		$this->assertStringContainsString( "> Hola\n> equipo", $text );
		$this->assertStringContainsString( 'Install my signature: ' . self::URL, $text );
		$this->assertStringContainsString( "-- \nAcme & Co", $text );
	}

	public function test_reminder_has_its_own_subject_and_no_admin_message_block_when_empty(): void {
		$mail = ( new InvitationMailer() )->build( $this->user(), self::URL, InvitationMailer::KIND_REMINDER );
		$this->assertSame( 'Reminder: install your email signature', $mail['subject'] );
		$this->assertStringContainsString( 'still waiting to be installed', $mail['html'] );
		$this->assertStringNotContainsString( 'Message from your administrator', $mail['html'] );
		$this->assertStringNotContainsString( 'Message from your administrator', $mail['text'] );
	}

	public function test_without_logo_the_company_name_heads_the_email(): void {
		$this->options['imgsig_brand_kit']['company']['logo_url'] = '';
		$html = ( new InvitationMailer() )->build( $this->user(), self::URL, InvitationMailer::KIND_INVITE )['html'];
		$this->assertStringNotContainsString( '<img', $html );
		$this->assertStringContainsString( '>Acme &amp; Co</span>', $html );
	}

	public function test_send_is_multipart_in_the_recipient_locale_with_a_safe_reply_to(): void {
		$admin = new \WP_User(
			[
				'ID'           => 1,
				'display_name' => "Boss\r\nBcc: victim@example.org",
				'user_email'   => 'boss@example.com',
			]
		);

		$this->assertTrue( ( new InvitationMailer() )->send( $this->user(), self::URL, InvitationMailer::KIND_INVITE, 'Hi', $admin ) );
		$this->assertSame( [ 'switch:es_ES', 'restore' ], $this->locales );
		$this->assertCount( 1, $this->mails );

		[ $to, $subject, $body, $headers, $alt ] = $this->mails[0];
		$this->assertSame( 'ana@example.com', $to );
		$this->assertSame( 'Your email signature is ready', $subject );
		$this->assertStringContainsString( '<!DOCTYPE html>', $body );
		$this->assertContains( 'Content-Type: text/html; charset=UTF-8', $headers );
		$this->assertContains( 'Reply-To: "Boss Bcc: victim@example.org" <boss@example.com>', $headers );
		foreach ( $headers as $header ) {
			$this->assertDoesNotMatchRegularExpression( '/[\r\n]/', $header );
		}
		$this->assertNotSame( '', $alt );
		$this->assertStringContainsString( self::URL, $alt );
	}
}
