<?php
/**
 * Unit tests for HtmlSanitizer against WordPress' real kses.
 *
 * @package ImaginaSignatures\Tests\Unit\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Services;

use Brain\Monkey;
use ImaginaSignatures\Services\HtmlSanitizer;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Services\HtmlSanitizer
 */
final class HtmlSanitizerTest extends TestCase {

	private HtmlSanitizer $sanitizer;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		imgsig_tests_load_kses();
		$this->sanitizer = new HtmlSanitizer();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_clean_tiptap_output_round_trips_unchanged(): void {
		$html = '<p>Hello <strong>World</strong> &amp; <em>friends</em><br><u>u</u> '
			. '<a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com/?a=1&amp;b=2">link</a> '
			. '<a href="mailto:{{email}}">mail</a> <a href="tel:+1 555 0100">call</a> '
			. '<span style="color: #ff0000">red</span></p>';

		$this->assertSame( $html, $this->sanitizer->sanitize( $html ) );
	}

	/**
	 * @return array<string, array{0: string, 1: string}>
	 */
	public function xss_vectors(): array {
		return [
			'script tag'          => [ '<p>x<script>alert(1)</script></p>', '<script' ],
			'img onerror'         => [ '<img src=x onerror=alert(1)>', 'onerror' ],
			'event handler'       => [ '<p onclick="alert(1)">x</p>', 'onclick' ],
			'javascript href'     => [ '<a href="javascript:alert(1)">x</a>', 'javascript:' ],
			'entity-obfuscated'   => [ '<a href="java&#x09;script:alert(1)">x</a>', 'script:' ],
			'data uri'            => [ '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>', 'data:' ],
			'vbscript'            => [ '<a href="vbscript:msgbox(1)">x</a>', 'vbscript' ],
			'iframe'              => [ '<iframe src="https://evil.example"></iframe>', '<iframe' ],
			'svg onload'          => [ '<svg onload=alert(1)>', '<svg' ],
			'style url'           => [ '<span style="background-image:url(javascript:alert(1))">x</span>', 'url(' ],
			'style expression'    => [ '<span style="width: expression(alert(1))">x</span>', 'expression' ],
			'style position'      => [ '<span style="position:fixed;top:0">x</span>', 'position' ],
			'form'                => [ '<form action="https://evil"><input name=a></form>', '<form' ],
			'disallowed tag attr' => [ '<span class="x" data-x="1" style="color:red">x</span>', 'class=' ],
		];
	}

	/**
	 * @dataProvider xss_vectors
	 */
	public function test_rich_text_strips_xss_vectors( string $input, string $forbidden ): void {
		$output = $this->sanitizer->sanitize( $input );
		$this->assertStringNotContainsStringIgnoringCase( $forbidden, $output );
	}

	public function test_style_allowlist_keeps_safe_properties_only(): void {
		$output = $this->sanitizer->sanitize( '<span style="color: red; position: absolute; font-weight: bold">x</span>' );
		$this->assertSame( '<span style="color: red; font-weight: bold">x</span>', $output );
	}

	public function test_style_attribute_removed_when_nothing_survives(): void {
		$this->assertSame( '<span>x</span>', $this->sanitizer->sanitize( '<span style="position:fixed">x</span>' ) );
	}

	/**
	 * @return array<string, array{0: string}>
	 */
	public function accepted_urls(): array {
		return [
			'https'           => [ 'https://example.com/a?b=c#d' ],
			'http'            => [ 'http://example.com' ],
			'mailto'          => [ 'mailto:me@example.com' ],
			'tel with spaces' => [ 'tel:+1 555 0100' ],
			'variable only'   => [ '{{website}}' ],
			'variable mailto' => [ 'mailto:{{email}}' ],
			'variable host'   => [ 'https://{{domain}}/path' ],
			'relative'        => [ '/wp-content/uploads/logo.png' ],
			'schemeless'      => [ 'www.example.com' ],
			'query colon'     => [ '{{website}}?q=a:b' ],
			'empty'           => [ '' ],
		];
	}

	/**
	 * @dataProvider accepted_urls
	 */
	public function test_sanitize_url_accepts_safe_values_unchanged( string $url ): void {
		$this->assertSame( $url, $this->sanitizer->sanitize_url( $url ) );
	}

	/**
	 * @return array<string, array{0: string}>
	 */
	public function rejected_urls(): array {
		return [
			'javascript'          => [ 'javascript:alert(1)' ],
			'uppercase'           => [ 'JavaScript:alert(1)' ],
			'leading whitespace'  => [ "  \tjavascript:alert(1)" ],
			'tab inside scheme'   => [ "java\tscript:alert(1)" ],
			'entity tab'          => [ 'java&#x09;script:alert(1)' ],
			'entity no semicolon' => [ '&#106avascript:alert(1)' ],
			'named entity colon'  => [ 'javascript&colon;alert(1)' ],
			'data'                => [ 'data:image/svg+xml;base64,PHN2Zz4=' ],
			'vbscript'            => [ 'vbscript:msgbox(1)' ],
			'token scheme'        => [ '{{proto}}:alert(1)' ],
			'token in scheme'     => [ 'java{{x}}script:alert(1)' ],
			'unknown scheme'      => [ 'ftp://example.com' ],
			'quote breakout'      => [ 'https://example.com/" onmouseover="alert(1)' ],
			'angle brackets'      => [ 'https://example.com/<script>' ],
			'null byte'           => [ "https://example.com/\0" ],
		];
	}

	/**
	 * @dataProvider rejected_urls
	 */
	public function test_sanitize_url_rejects_dangerous_values( string $url ): void {
		$this->assertNull( $this->sanitizer->sanitize_url( $url ) );
	}

	public function test_is_script_url_is_narrow(): void {
		$this->assertTrue( $this->sanitizer->is_script_url( 'javascript:alert(1)' ) );
		$this->assertTrue( $this->sanitizer->is_script_url( ' data:text/html,<b>x</b>' ) );
		$this->assertTrue( $this->sanitizer->is_script_url( 'data:,hello' ) );
		$this->assertFalse( $this->sanitizer->is_script_url( 'Data: Analyst' ) );
		$this->assertFalse( $this->sanitizer->is_script_url( 'Note: call me' ) );
		$this->assertFalse( $this->sanitizer->is_script_url( 'JavaScript developer' ) );
	}

	public function test_strip_markup_leaves_plain_text_byte_identical(): void {
		$this->assertSame( 'A & B < C', $this->sanitizer->strip_markup( 'A & B < C' ) );
		$this->assertSame( 'I <3 email', $this->sanitizer->strip_markup( 'I <3 email' ) );
		$this->assertSame( 'Hi', $this->sanitizer->strip_markup( 'Hi<script>alert(1)</script>' ) );
		$this->assertSame( 'bold', $this->sanitizer->strip_markup( '<b>bold</b>' ) );
	}

	public function test_email_document_keeps_tables_and_drops_active_content(): void {
		$doc = '<!DOCTYPE html><html><head><title>Email Signature</title><style>body{}</style>'
			. '<script>alert(1)</script></head><body style="margin:0">'
			. '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="border-collapse:collapse;width:600px">'
			. '<tr><td valign="top" style="padding:0 8px 0 0;font-family:Arial">'
			. '<img src="https://cdn.example.com/a.png" alt="Logo" width="80" onerror="alert(1)" style="display:block;position:absolute">'
			. '<a href="javascript:alert(1)">bad</a> <a href="https://example.com" target="_blank">good</a>'
			. '<iframe src="https://evil.example"></iframe><form action="x"><input></form>'
			. '<svg><script>alert(2)</script></svg><div onmouseover="x()">d</div><center>c</center>'
			. '</td></tr></table></body></html>';

		$out = $this->sanitizer->sanitize_email_document( $doc );

		$this->assertStringContainsString( '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"', $out );
		$this->assertStringContainsString( '<td valign="top"', $out );
		$this->assertStringContainsString( 'src="https://cdn.example.com/a.png"', $out );
		$this->assertStringContainsString( 'href="https://example.com"', $out );
		$this->assertStringContainsString( '<center>c</center>', $out );
		// `position` dropped, `display` (email-critical) kept.
		$this->assertStringContainsString( 'style="display: block"', $out );
		$this->assertStringContainsString( 'style="border-collapse:collapse;width:600px"', $out );

		foreach ( [ 'Email Signature', '<script', 'alert(2)', 'onerror', 'onmouseover', 'javascript:', '<iframe', '<form', '<input', '<svg', 'position', '<style', '<title' ] as $forbidden ) {
			$this->assertStringNotContainsStringIgnoringCase( $forbidden, $out, $forbidden );
		}
	}

	public function test_plain_text_alternative(): void {
		$text = $this->sanitizer->to_plain_text( '<p>Jane Doe<br>CEO</p><a href="https://example.com">Website</a>' );
		$this->assertSame( "Jane Doe\nCEO\nWebsite (https://example.com)", $text );
	}
}
