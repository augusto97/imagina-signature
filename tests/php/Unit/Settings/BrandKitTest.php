<?php
/**
 * Unit tests for the brand kit's sanitisation and derived variables.
 *
 * @package ImaginaSignatures\Tests\Unit\Settings
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Settings;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Settings\BrandKit;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/BrandKitStubs.php';

/**
 * @covers \ImaginaSignatures\Settings\BrandKit
 */
final class BrandKitTest extends TestCase {

	use BrandKitStubs;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_sanitizers();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_empty_input_yields_the_default_shape(): void {
		$kit = BrandKit::sanitize( null );

		$this->assertSame( BrandKit::defaults(), $kit );
		$this->assertSame( [ 'company', 'social', 'typography' ], array_keys( $kit ) );
		$this->assertSame( BrandKit::SOCIAL_NETWORKS, array_keys( $kit['social'] ) );
		$this->assertSame( 'Arial, sans-serif', $kit['typography']['font_family'] );
		$this->assertSame( 160, $kit['company']['logo_width'] );
	}

	/**
	 * @return array<string, array{0: string, 1: string}>
	 */
	public function urls(): array {
		return [
			'https kept'            => [ 'https://acme.com/about', 'https://acme.com/about' ],
			'http kept'             => [ 'http://acme.com', 'http://acme.com' ],
			'bare domain → https'   => [ 'acme.com', 'https://acme.com' ],
			'www + path → https'    => [ 'www.acme.com/team?x=1', 'https://www.acme.com/team?x=1' ],
			'surrounding spaces'    => [ '  https://acme.com  ', 'https://acme.com' ],
			'javascript rejected'   => [ 'javascript:alert(1)', '' ],
			'data rejected'         => [ 'data:text/html;base64,PHNjcmlwdD4=', '' ],
			'ftp rejected'          => [ 'ftp://files.acme.com', '' ],
			'mailto rejected'       => [ 'mailto:hello@acme.com', '' ],
			'relative rejected'     => [ '/wp-content/uploads/logo.png', '' ],
			'protocol-relative'     => [ '//cdn.acme.com/logo.png', '' ],
			'scheme without host'   => [ 'https://', '' ],
			'not a url'             => [ 'just some words', '' ],
			'empty'                 => [ '', '' ],
		];
	}

	/**
	 * @dataProvider urls
	 *
	 * @param string $input    Raw value.
	 * @param string $expected Stored value.
	 */
	public function test_url_fields_accept_only_http_and_https( string $input, string $expected ): void {
		$kit = BrandKit::sanitize(
			[
				'company' => [
					'website'  => $input,
					'logo_url' => $input,
				],
				'social'  => [ 'linkedin' => $input ],
			]
		);

		$this->assertSame( $expected, $kit['company']['website'] );
		$this->assertSame( $expected, $kit['company']['logo_url'] );
		$this->assertSame( $expected, $kit['social']['linkedin'] );
	}

	public function test_overlong_urls_are_dropped(): void {
		$kit = BrandKit::sanitize( [ 'company' => [ 'website' => 'https://acme.com/' . str_repeat( 'a', 3000 ) ] ] );
		$this->assertSame( '', $kit['company']['website'] );
	}

	public function test_text_fields_are_stripped_and_capped(): void {
		$kit = BrandKit::sanitize(
			[
				'company' => [
					'name'    => '<script>alert(1)</script><b>Acme</b>   Inc.',
					'tagline' => str_repeat( 'x', 500 ),
					'phone'   => "+1 555\n0100",
					'address' => [ 'not', 'a', 'string' ],
				],
			]
		);

		$this->assertSame( 'Acme Inc.', $kit['company']['name'] );
		$this->assertSame( 160, strlen( (string) $kit['company']['tagline'] ) );
		$this->assertSame( '+1 555 0100', $kit['company']['phone'] );
		$this->assertSame( '', $kit['company']['address'] );
	}

	public function test_email_must_be_valid(): void {
		$this->assertSame( 'hello@acme.com', BrandKit::sanitize( [ 'company' => [ 'email' => ' hello@acme.com ' ] ] )['company']['email'] );
		$this->assertSame( '', BrandKit::sanitize( [ 'company' => [ 'email' => 'not-an-email' ] ] )['company']['email'] );
	}

	/**
	 * @return array<string, array{0: mixed, 1: int}>
	 */
	public function widths(): array {
		return [
			'in range'      => [ 240, 240 ],
			'numeric str'   => [ '200', 200 ],
			'float rounded' => [ 120.6, 121 ],
			'below min'     => [ 2, BrandKit::LOGO_WIDTH_MIN ],
			'above max'     => [ 9000, BrandKit::LOGO_WIDTH_MAX ],
			'negative'      => [ -50, BrandKit::LOGO_WIDTH_MIN ],
			'garbage'       => [ 'wide', BrandKit::LOGO_WIDTH_DEFAULT ],
		];
	}

	/**
	 * @dataProvider widths
	 *
	 * @param mixed $input    Raw width.
	 * @param int   $expected Stored width.
	 */
	public function test_logo_width_is_an_integer_clamped_to_range( $input, int $expected ): void {
		$kit = BrandKit::sanitize( [ 'company' => [ 'logo_width' => $input ] ] );
		$this->assertSame( $expected, $kit['company']['logo_width'] );
	}

	public function test_colours_must_be_hex(): void {
		$kit = BrandKit::sanitize(
			[
				'typography' => [
					'text_color'   => '#ABCDEF',
					'link_color'   => 'red',
					'accent_color' => '#0f0',
				],
			]
		);
		$this->assertSame( '#abcdef', $kit['typography']['text_color'] );
		$this->assertSame( BrandKit::DEFAULT_TYPOGRAPHY['link_color'], $kit['typography']['link_color'] );
		$this->assertSame( '#0f0', $kit['typography']['accent_color'] );

		$kit = BrandKit::sanitize(
			[
				'typography' => [
					'text_color'   => '#11223344',
					'link_color'   => '#12345',
					'accent_color' => 'url(javascript:alert(1))',
				],
			]
		);
		$this->assertSame( BrandKit::DEFAULT_TYPOGRAPHY, array_intersect_key( $kit['typography'], BrandKit::DEFAULT_TYPOGRAPHY ) );
	}

	public function test_font_must_come_from_the_web_safe_allowlist(): void {
		$font = static function ( $value ): string {
			return (string) BrandKit::sanitize( [ 'typography' => [ 'font_family' => $value ] ] )['typography']['font_family'];
		};

		$this->assertSame( 'Georgia, serif', $font( 'Georgia, serif' ) );
		$this->assertSame( '"Times New Roman", Times, serif', $font( '"Times New Roman", Times, serif' ) );
		$this->assertSame( 'Verdana, Geneva, sans-serif', $font( 'verdana' ), 'label match' );
		$this->assertSame( 'Arial, sans-serif', $font( 'Comic Sans MS' ) );
		$this->assertSame( 'Arial, sans-serif', $font( 'Arial;} body{display:none' ) );
		$this->assertSame( 'Arial, sans-serif', $font( [ 'Georgia' ] ) );
	}

	public function test_unknown_keys_are_dropped(): void {
		$kit = BrandKit::sanitize(
			[
				'company'    => [
					'name'  => 'Acme',
					'admin' => true,
				],
				'social'     => [ 'myspace' => 'https://myspace.com/acme' ],
				'typography' => [ 'font_size' => 99 ],
				'secret'     => 'leak',
			]
		);

		$this->assertSame( array_keys( BrandKit::defaults() ), array_keys( $kit ) );
		$this->assertArrayNotHasKey( 'admin', $kit['company'] );
		$this->assertArrayNotHasKey( 'myspace', $kit['social'] );
		$this->assertArrayNotHasKey( 'font_size', $kit['typography'] );
	}

	public function test_merge_applies_a_partial_update(): void {
		$current = BrandKit::sanitize(
			[
				'company' => [
					'name'    => 'Acme',
					'website' => 'https://acme.com',
				],
				'social'  => [
					'x'        => 'https://x.com/acme',
					'linkedin' => 'https://linkedin.com/company/acme',
				],
			]
		);

		$next = BrandKit::merge(
			$current,
			[
				'company'    => [ 'tagline' => 'We make things' ],
				'social'     => [
					'x'      => '',
					'github' => 'javascript:alert(1)',
				],
				'typography' => 'not-an-array',
			]
		);

		$this->assertSame( 'Acme', $next['company']['name'] );
		$this->assertSame( 'https://acme.com', $next['company']['website'] );
		$this->assertSame( 'We make things', $next['company']['tagline'] );
		$this->assertSame( '', $next['social']['x'], 'explicit empty clears the field' );
		$this->assertSame( 'https://linkedin.com/company/acme', $next['social']['linkedin'] );
		$this->assertSame( '', $next['social']['github'], 'patch values are sanitised' );
		$this->assertSame( BrandKit::DEFAULT_TYPOGRAPHY, $next['typography'] );

		$this->assertSame( $current, BrandKit::merge( $current, 'garbage' ) );
	}

	public function test_company_variables_cover_every_key_and_default_to_empty(): void {
		$expected_keys = [
			'company_name',
			'company_tagline',
			'company_website',
			'company_phone',
			'company_email',
			'company_address',
			'company_logo',
			'company_linkedin',
			'company_x',
			'company_facebook',
			'company_instagram',
			'company_youtube',
			'company_tiktok',
			'company_github',
			'company_whatsapp',
		];

		$empty = BrandKit::company_variables( [] );
		$this->assertSame( $expected_keys, array_keys( $empty ) );
		$this->assertSame( array_fill_keys( $expected_keys, '' ), $empty );

		$vars = BrandKit::company_variables(
			[
				'company' => [
					'name'     => 'Acme',
					'logo_url' => 'https://cdn.acme.com/logo.png',
				],
				'social'  => [ 'whatsapp' => 'https://wa.me/15550100' ],
			]
		);
		$this->assertSame( 'Acme', $vars['company_name'] );
		$this->assertSame( 'https://cdn.acme.com/logo.png', $vars['company_logo'] );
		$this->assertSame( 'https://wa.me/15550100', $vars['company_whatsapp'] );
	}

	public function test_current_reads_and_sanitises_the_option(): void {
		Functions\when( 'get_option' )->justReturn(
			[
				'company'    => [ 'website' => 'javascript:alert(1)' ],
				'typography' => [ 'font_family' => 'Georgia, serif' ],
			]
		);
		$kit = BrandKit::current();
		$this->assertSame( '', $kit['company']['website'] );
		$this->assertSame( 'Georgia, serif', $kit['typography']['font_family'] );

		Functions\when( 'get_option' )->justReturn( 'corrupt' );
		$this->assertSame( BrandKit::defaults(), BrandKit::current() );
	}

	public function test_public_payload_is_the_three_public_groups(): void {
		$payload = BrandKit::public_payload( [ 'company' => [ 'name' => 'Acme' ] ] );
		$this->assertSame( [ 'company', 'social', 'typography' ], array_keys( $payload ) );
		$this->assertSame( 'Acme', $payload['company']['name'] );
	}
}
