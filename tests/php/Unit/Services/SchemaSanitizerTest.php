<?php
/**
 * Unit tests for the recursive schema sanitizer.
 *
 * @package ImaginaSignatures\Tests\Unit\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Services;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Services\HtmlSanitizer;
use ImaginaSignatures\Services\SchemaSanitizer;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Services\SchemaSanitizer
 */
final class SchemaSanitizerTest extends TestCase {

	private SchemaSanitizer $sanitizer;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		Functions\when( '__' )->returnArg();
		imgsig_tests_load_kses();
		$this->sanitizer = new SchemaSanitizer( new HtmlSanitizer() );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * @param array<int, array<string, mixed>> $blocks    Blocks.
	 * @param array<string, string>            $variables Variables.
	 *
	 * @return array<string, mixed>
	 */
	private function schema( array $blocks, array $variables = [] ): array {
		return [
			'schema_version' => '1.0',
			'meta'           => [ 'editor_version' => '1.0.0' ],
			'canvas'         => [
				'width'       => 600,
				'font_family' => '"Helvetica Neue", Arial, sans-serif',
			],
			'blocks'         => $blocks,
			'variables'      => $variables,
		];
	}

	public function test_clean_schema_is_returned_unchanged_without_notes(): void {
		$schema = $this->schema(
			[
				[
					'id'      => 't1',
					'type'    => 'text',
					'content' => '<p>Hi <strong>there</strong> &amp; <a href="https://example.com" target="_blank" rel="noopener">site</a></p>',
				],
				[
					'id'      => 'h1',
					'type'    => 'heading',
					'content' => 'Smith & Sons',
				],
				[
					'id'       => 's1',
					'type'     => 'social_icons',
					'networks' => [
						[
							'platform' => 'linkedin',
							'url'      => 'https://linkedin.com/in/x',
						],
					],
				],
				[
					'id'   => 'c1',
					'type' => 'contact_row',
					'rows' => [
						[
							'icon'  => 'email',
							'label' => 'me@example.com',
							'href'  => 'mailto:{{email}}',
						],
					],
				],
			],
			[
				'email' => 'me@example.com',
				'title' => 'Data: Analyst',
			]
		);

		$this->assertSame( $schema, $this->sanitizer->sanitize( $schema ) );
		$this->assertSame( [], $this->sanitizer->notes() );
	}

	public function test_recurses_into_container_children_and_right_children(): void {
		$schema = $this->schema(
			[
				[
					'id'             => 'row',
					'type'           => 'container',
					'children'       => [
						[
							'id'      => 'deep',
							'type'    => 'container',
							'children' => [
								[
									'id'      => 'x',
									'type'    => 'text',
									'content' => '<p>a<script>alert(1)</script><img src=x onerror=alert(1)></p>',
								],
							],
						],
					],
					'right_children' => [
						[
							'id'   => 'img',
							'type' => 'image',
							'src'  => 'javascript:alert(1)',
							'link' => 'JaVaScRiPt:alert(1)',
							'alt'  => '<b>Logo</b>',
							'static_fallback_url' => 'data:image/png;base64,AAAA',
						],
						[
							'id'    => 'btn',
							'type'  => 'button_cta',
							'label' => 'Go',
							'href'  => 'vbscript:msgbox(1)',
						],
					],
				],
			]
		);

		$out = $this->sanitizer->sanitize( $schema );

		$text = $out['blocks'][0]['children'][0]['children'][0]['content'];
		$this->assertStringNotContainsString( '<script', $text );
		$this->assertStringNotContainsString( 'onerror', $text );
		$this->assertStringNotContainsString( '<img', $text );

		$image = $out['blocks'][0]['right_children'][0];
		$this->assertSame( '', $image['src'] );
		$this->assertSame( '', $image['link'] );
		$this->assertSame( '', $image['static_fallback_url'] );
		$this->assertSame( 'Logo', $image['alt'] );
		$this->assertSame( '', $out['blocks'][0]['right_children'][1]['href'] );

		$paths = array_column( $this->sanitizer->notes(), 'path' );
		$this->assertContains( 'blocks[0].children[0].children[0].content', $paths );
		$this->assertContains( 'blocks[0].right_children[0].src', $paths );
		$this->assertContains( 'blocks[0].right_children[0].link', $paths );
		$this->assertContains( 'blocks[0].right_children[0].static_fallback_url', $paths );
		$this->assertContains( 'blocks[0].right_children[1].href', $paths );
	}

	public function test_nested_url_lists_and_suffix_keys_are_validated(): void {
		$schema = $this->schema(
			[
				[
					'id'       => 's',
					'type'     => 'social_icons',
					'networks' => [
						[
							'platform' => 'x',
							'url'      => 'https://x.com/me',
						],
						[
							'platform' => 'evil',
							'url'      => "java\tscript:alert(1)",
						],
					],
				],
				[
					'id'        => 'b',
					'type'      => 'banner',
					'src'       => 'https://cdn.example.com/b.gif',
					'link'      => 'https://example.com/campaign',
					'image_url' => 'data:text/html,<script>alert(1)</script>',
				],
				[
					'id'       => 'v',
					'type'     => 'vcard',
					'website'  => 'javascript:alert(1)',
					'file_url' => 'https://cdn.example.com/u/abc/card.vcf',
					'email'    => 'me@example.com',
				],
			]
		);

		$out = $this->sanitizer->sanitize( $schema );

		$this->assertSame( 'https://x.com/me', $out['blocks'][0]['networks'][0]['url'] );
		$this->assertSame( '', $out['blocks'][0]['networks'][1]['url'] );
		$this->assertSame( 'https://cdn.example.com/b.gif', $out['blocks'][1]['src'] );
		$this->assertSame( '', $out['blocks'][1]['image_url'] );
		$this->assertSame( '', $out['blocks'][2]['website'] );
		$this->assertSame( 'https://cdn.example.com/u/abc/card.vcf', $out['blocks'][2]['file_url'] );
		$this->assertSame( 'me@example.com', $out['blocks'][2]['email'] );
		$this->assertContains( 'blocks[0].networks[1].url', array_column( $this->sanitizer->notes(), 'path' ) );
	}

	public function test_plain_text_content_blocks_are_not_entity_encoded(): void {
		$schema = $this->schema(
			[
				[
					'id'      => 'h',
					'type'    => 'heading',
					'content' => 'R&D <b>Lead</b>',
				],
				[
					'id'      => 'd',
					'type'    => 'disclaimer',
					'content' => 'Confidential & privileged',
				],
			]
		);

		$out = $this->sanitizer->sanitize( $schema );

		$this->assertSame( 'R&D Lead', $out['blocks'][0]['content'] );
		$this->assertSame( 'Confidential & privileged', $out['blocks'][1]['content'] );
	}

	public function test_variables_lose_script_urls_and_markup(): void {
		$out = $this->sanitizer->sanitize(
			$this->schema(
				[],
				[
					'website' => 'javascript:alert(document.cookie)',
					'name'    => 'Jane <img src=x onerror=alert(1)>',
					'phone'   => '+1 555 0100',
				]
			)
		);

		$this->assertSame( '', $out['variables']['website'] );
		$this->assertSame( 'Jane', $out['variables']['name'] );
		$this->assertSame( '+1 555 0100', $out['variables']['phone'] );
	}

	public function test_unknown_block_types_treat_content_as_html(): void {
		$out = $this->sanitizer->sanitize(
			$this->schema(
				[
					[
						'id'      => 'c',
						'type'    => 'custom_widget',
						'content' => '<p onclick="x()">hi</p>',
						'body_html' => '<script>1</script><em>ok</em>',
					],
				]
			)
		);

		$this->assertSame( '<p>hi</p>', $out['blocks'][0]['content'] );
		$this->assertSame( '1<em>ok</em>', $out['blocks'][0]['body_html'] );
	}
}
