<?php
/**
 * Unit tests for the recursive schema sanitizer.
 *
 * @package ImaginaSignatures\Tests\Unit\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Services;

use Brain\Monkey;
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

	// -----------------------------------------------------------------
	// Schema 1.1: container columns + box styles
	// -----------------------------------------------------------------

	/**
	 * @return array<string, mixed>
	 */
	private function clean_v2_container(): array {
		return [
			'id'              => 'row',
			'type'            => 'container',
			'gap'             => 16,
			'stack_on_mobile' => true,
			'divider'         => [
				'width' => 1,
				'style' => 'dashed',
				'color' => '#e5e7eb',
			],
			'box'             => [
				'background_color' => '#f8fafc',
				'border'           => [
					'width' => 1,
					'style' => 'solid',
					'color' => 'rgba(15, 23, 42, 0.1)',
				],
				'border_left'      => [
					'width' => 4,
					'style' => 'solid',
					'color' => '#2563eb',
				],
				'border_radius'    => 12,
				'padding'          => [
					'top'    => 16,
					'right'  => 20,
					'bottom' => 16,
					'left'   => 20,
				],
				'align'            => 'center',
				'width'            => 480,
			],
			'columns'         => [
				[
					'id'       => 'col_a',
					'width'    => 33,
					'valign'   => 'middle',
					'box'      => [ 'background_color' => 'navy' ],
					'children' => [
						[
							'id'      => 'h',
							'type'    => 'heading',
							'content' => 'Smith & Sons',
						],
					],
				],
				[
					'id'       => 'col_b',
					'width'    => 67,
					'children' => [],
				],
			],
		];
	}

	public function test_clean_v2_schema_is_returned_unchanged_without_notes(): void {
		$schema                   = $this->schema( [ $this->clean_v2_container() ] );
		$schema['schema_version'] = '1.1';

		$out = $this->sanitizer->sanitize( $schema );

		$this->assertSame( $schema['blocks'], $out['blocks'] );
		$this->assertSame( [], $this->sanitizer->notes() );
	}

	public function test_recurses_into_v2_column_children(): void {
		$row                                  = $this->clean_v2_container();
		$row['columns'][1]['children']        = [
			[
				'id'      => 'x',
				'type'    => 'text',
				'content' => '<p>a<script>alert(1)</script></p>',
			],
			[
				'id'   => 'btn',
				'type' => 'button_cta',
				'href' => 'javascript:alert(1)',
			],
		];
		$row['columns'][0]['children'][]      = [
			'id'      => 'inner',
			'type'    => 'container',
			'columns' => [
				[
					'id'       => 'ic',
					'width'    => 100,
					'children' => [
						[
							'id'   => 'img',
							'type' => 'image',
							'src'  => 'data:image/png;base64,AAAA',
							'alt'  => '<b>Logo</b>',
						],
					],
				],
			],
		];

		$out  = $this->sanitizer->sanitize( $this->schema( [ $row ] ) );
		$cols = $out['blocks'][0]['columns'];

		$this->assertStringNotContainsString( '<script', $cols[1]['children'][0]['content'] );
		$this->assertSame( '', $cols[1]['children'][1]['href'] );
		// Plain-text heading content inside a column is not entity-encoded.
		$this->assertSame( 'Smith & Sons', $cols[0]['children'][0]['content'] );
		$image = $cols[0]['children'][1]['columns'][0]['children'][0];
		$this->assertSame( '', $image['src'] );
		$this->assertSame( 'Logo', $image['alt'] );

		$paths = array_column( $this->sanitizer->notes(), 'path' );
		$this->assertContains( 'blocks[0].columns[1].children[0].content', $paths );
		$this->assertContains( 'blocks[0].columns[1].children[1].href', $paths );
		$this->assertContains( 'blocks[0].columns[0].children[1].columns[0].children[0].src', $paths );
	}

	public function test_box_styles_are_rebuilt_from_an_allowlist(): void {
		$out = $this->sanitizer->sanitize(
			$this->schema(
				[
					[
						'id'      => 't',
						'type'    => 'text',
						'content' => 'Hi',
						'box'     => [
							'background_color' => 'red;background:url(javascript:alert(1))',
							'border'           => [
								'width' => 2,
								'style' => 'groove',
								'color' => '#ABCDEF',
							],
							'border_top'       => [
								'width' => 'wide',
								'style' => 'solid',
								'color' => '#000',
							],
							'border_bottom'    => [
								'width' => 1,
								'style' => 'solid',
								'color' => '"><script>',
							],
							'border_radius'    => 5000,
							'padding'          => [
								'top'   => -4,
								'right' => '12',
								'left'  => 'x',
							],
							'align'            => 'justify',
							'width'            => 0,
							'onclick'          => 'alert(1)',
						],
					],
				]
			)
		);

		$box = $out['blocks'][0]['box'];
		$this->assertSame(
			[
				'border'        => [
					'width' => 2,
					'style' => 'solid',
					'color' => '#ABCDEF',
				],
				'border_radius' => 999,
				'padding'       => [
					'top'    => 0,
					'right'  => 12,
					'bottom' => 0,
					'left'   => 0,
				],
			],
			$box
		);

		$paths = array_column( $this->sanitizer->notes(), 'path' );
		foreach ( [ 'background_color', 'border_top', 'border_bottom', 'align', 'onclick' ] as $key ) {
			$this->assertContains( 'blocks[0].box.' . $key, $paths );
		}
	}

	public function test_invalid_box_is_removed_entirely(): void {
		$out = $this->sanitizer->sanitize(
			$this->schema(
				[
					[
						'id'   => 's',
						'type' => 'spacer',
						'box'  => [ 'background_color' => 'expression(alert(1))' ],
					],
					[
						'id'   => 'd',
						'type' => 'divider',
						'box'  => 'not-an-object',
					],
				]
			)
		);

		$this->assertArrayNotHasKey( 'box', $out['blocks'][0] );
		$this->assertArrayNotHasKey( 'box', $out['blocks'][1] );
	}

	public function test_column_and_divider_fields_are_validated(): void {
		$row                            = $this->clean_v2_container();
		$row['divider']['color']        = 'url(x)';
		$row['columns'][0]['width']     = '250';
		$row['columns'][0]['valign']    = 'baseline';
		$row['columns'][1]['width']     = 'wide';
		$row['columns'][1]['box']       = [
			'padding' => [
				'top'    => 999,
				'right'  => 1,
				'bottom' => 2,
				'left'   => 3.5,
			],
		];

		$out = $this->sanitizer->sanitize( $this->schema( [ $row ] ) );
		$row = $out['blocks'][0];

		$this->assertArrayNotHasKey( 'divider', $row );
		$this->assertSame( 100, $row['columns'][0]['width'] );
		$this->assertArrayNotHasKey( 'valign', $row['columns'][0] );
		$this->assertArrayNotHasKey( 'width', $row['columns'][1] );
		$this->assertSame(
			[
				'top'    => 400,
				'right'  => 1,
				'bottom' => 2,
				'left'   => 3.5,
			],
			$row['columns'][1]['box']['padding']
		);

		$paths = array_column( $this->sanitizer->notes(), 'path' );
		$this->assertContains( 'blocks[0].divider', $paths );
		$this->assertContains( 'blocks[0].columns[0].valign', $paths );
		$this->assertContains( 'blocks[0].columns[1].width', $paths );
	}
}
