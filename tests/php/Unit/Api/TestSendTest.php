<?php
/**
 * Unit tests for POST /signatures/test-send hardening.
 *
 * @package ImaginaSignatures\Tests\Unit\Api
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Api;

use Brain\Monkey;
use Brain\Monkey\Actions;
use Brain\Monkey\Functions;
use ImaginaSignatures\Api\Controllers\SignaturesController;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Exceptions\RateLimitException;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Services\HtmlSanitizer;
use ImaginaSignatures\Services\SignatureService;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Api\Controllers\SignaturesController::test_send
 */
final class TestSendTest extends TestCase {

	/** @var array<int, array<int, mixed>> */
	private array $mails = [];

	/** @var callable|null */
	private $phpmailer_hook = null;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		imgsig_tests_load_kses();

		$this->mails          = [];
		$this->phpmailer_hook = null;

		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'esc_html' )->alias(
			static function ( $text ): string {
				return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' );
			}
		);
		Functions\when( 'sanitize_text_field' )->alias( 'trim' );
		Functions\when( 'is_email' )->alias(
			static function ( $email ) {
				return false !== filter_var( $email, FILTER_VALIDATE_EMAIL ) ? $email : false;
			}
		);
		Functions\when( 'get_current_user_id' )->justReturn( 5 );
		Functions\when( 'wp_get_current_user' )->justReturn(
			(object) [
				'ID'           => 5,
				'user_email'   => 'owner@example.com',
				'display_name' => 'Owner <b>X</b>',
			]
		);
		Functions\when( 'rest_ensure_response' )->alias(
			static function ( $data ) {
				return $data instanceof \WP_REST_Response ? $data : new \WP_REST_Response( $data );
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

	private function controller( ?RateLimiter $limiter = null ): SignaturesController {
		return new SignaturesController(
			$this->createMock( SignatureService::class ),
			$this->createMock( SignatureRepository::class ),
			$limiter ?? $this->createMock( RateLimiter::class ),
			new HtmlSanitizer()
		);
	}

	public function test_sends_sanitised_html_to_the_owner_only_with_plain_text_part(): void {
		$request = new \WP_REST_Request(
			[
				'html' => '<!DOCTYPE html><html><head><title>Email Signature</title></head><body>'
					. '<table role="presentation" width="600"><tr><td>Jane Doe '
					. '<a href="https://example.com" onclick="steal()">Site</a>'
					. '<script>alert(1)</script><iframe src="https://evil.example"></iframe>'
					. '<form action="https://evil.example"><input name="pw"></form>'
					. '<img src="https://cdn.example.com/x.png" alt="x" width="10" onerror="alert(2)">'
					. '</td></tr></table></body></html>',
				'to'   => 'victim@example.org',
			]
		);

		$response = $this->controller()->test_send( $request );

		$this->assertInstanceOf( \WP_REST_Response::class, $response );
		$this->assertSame( 'owner@example.com', $response->get_data()['recipient'] );
		$this->assertCount( 1, $this->mails );

		[ $to, $subject, $body, $headers, $alt ] = $this->mails[0];
		$this->assertSame( 'owner@example.com', $to );
		$this->assertSame( [ 'Content-Type: text/html; charset=UTF-8' ], $headers );
		$this->assertStringContainsString( '<table role="presentation" width="600">', $body );
		$this->assertStringContainsString( 'Owner &lt;b&gt;X&lt;/b&gt;', $body );

		foreach ( [ '<script', 'alert(', 'onclick', 'onerror', '<iframe', '<form', '<input', 'Email Signature', 'victim@' ] as $forbidden ) {
			$this->assertStringNotContainsStringIgnoringCase( $forbidden, $body, $forbidden );
		}

		$this->assertNotSame( '', $alt );
		$this->assertStringContainsString( 'Site (https://example.com)', $alt );
		$this->assertStringNotContainsString( '<', $alt );
	}

	public function test_rejects_payloads_over_200_kb_without_burning_a_rate_limit_slot(): void {
		$limiter = $this->createMock( RateLimiter::class );
		$limiter->expects( $this->never() )->method( 'check' );

		$result = $this->controller( $limiter )->test_send(
			new \WP_REST_Request( [ 'html' => '<p>' . str_repeat( 'a', 204800 ) . '</p>' ] )
		);

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'imgsig_html_too_large', $result->get_error_code() );
		$this->assertSame( 413, $result->get_error_data()['status'] );
		$this->assertSame( [], $this->mails );
	}

	public function test_applies_per_user_and_site_wide_limits(): void {
		$limiter = $this->createMock( RateLimiter::class );
		$limiter->expects( $this->once() )->method( 'check' )->with( 'signatures_test_send', 5, 6, HOUR_IN_SECONDS );
		$limiter->expects( $this->once() )->method( 'check_site' )->with( 'signatures_test_send', 100, HOUR_IN_SECONDS );

		$this->controller( $limiter )->test_send( new \WP_REST_Request( [ 'html' => '<p>Hi</p>' ] ) );
		$this->assertCount( 1, $this->mails );
	}

	public function test_site_wide_limit_returns_429_and_sends_nothing(): void {
		$limiter = $this->createMock( RateLimiter::class );
		$limiter->method( 'check_site' )->willThrowException( new RateLimitException( 'Too many requests.', 120 ) );

		$result = $this->controller( $limiter )->test_send( new \WP_REST_Request( [ 'html' => '<p>Hi</p>' ] ) );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'imgsig_rate_limited', $result->get_error_code() );
		$this->assertSame( 429, $result->get_error_data()['status'] );
		$this->assertSame( 120, $result->get_error_data()['retry_after'] );
		$this->assertSame( [], $this->mails );
	}

	public function test_refuses_html_that_sanitises_to_nothing(): void {
		$result = $this->controller()->test_send(
			new \WP_REST_Request( [ 'html' => '<script>alert(1)</script><iframe src="x"></iframe>' ] )
		);

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'imgsig_empty_html', $result->get_error_code() );
		$this->assertSame( [], $this->mails );
	}
}
