<?php
/**
 * Unit tests for linked-signature schema operations.
 *
 * @package ImaginaSignatures\Tests\Unit\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Services;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Services\SchemaMigration;
use ImaginaSignatures\Services\TemplateLink;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Services\TemplateLink
 * @covers \ImaginaSignatures\Services\SchemaMigration
 */
final class TemplateLinkTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * A 1.1 template: a locked logo image, an unlocked name heading, an
	 * unlocked text block and a locked disclaimer, inside / outside a
	 * container.
	 *
	 * @param string $mode Employee mode.
	 *
	 * @return array<string, mixed>
	 */
	public static function template( string $mode = TemplateLink::MODE_LOCKED_DESIGN ): array {
		return [
			'schema_version' => '1.1',
			'meta'           => [ 'created_at' => '2026-01-01T00:00:00Z', 'updated_at' => '2026-01-01T00:00:00Z', 'editor_version' => '1.3.0' ],
			'canvas'         => [ 'width' => 600, 'background_color' => '#ffffff', 'font_family' => 'Arial', 'font_size' => 14, 'text_color' => '#111111', 'link_color' => '#1d4ed8' ],
			'settings'       => [ 'employee_mode' => $mode ],
			'variables'      => [ 'tagline' => 'Default tagline' ],
			'blocks'         => [
				[
					'id'     => 'logo',
					'type'   => 'image',
					'src'    => 'https://cdn.acme.test/logo.png',
					'alt'    => 'Acme',
					'locked' => true,
				],
				[
					'id'      => 'row',
					'type'    => 'container',
					'gap'     => 8,
					'columns' => [
						[
							'id'       => 'col-a',
							'width'    => 100,
							'children' => [
								[
									'id'           => 'name',
									'type'         => 'heading',
									'content'      => '{{wp_display_name}}',
									'content_html' => '<p>{{wp_display_name}}</p>',
									'style'        => [ 'font_weight' => 700 ],
								],
								[
									'id'      => 'bio',
									'type'    => 'text',
									'content' => '<p>{{tagline}}</p>',
									'style'   => [ 'color' => '#333333' ],
								],
							],
						],
					],
				],
				[
					'id'      => 'legal',
					'type'    => 'disclaimer',
					'content' => 'Confidential.',
					'style'   => [],
					'locked'  => true,
				],
			],
		];
	}

	public function test_employee_mode_defaults_to_free(): void {
		$this->assertSame( 'free', TemplateLink::employee_mode( [] ) );
		$this->assertSame( 'free', TemplateLink::employee_mode( [ 'settings' => [ 'employee_mode' => 'bogus' ] ] ) );
		$this->assertSame( 'fields_only', TemplateLink::employee_mode( (object) [ 'settings' => (object) [ 'employee_mode' => 'fields_only' ] ] ) );
	}

	public function test_refresh_takes_the_template_design_and_keeps_variables_and_overrides(): void {
		$signature = [
			'meta'      => [ 'created_at' => '2026-02-01T00:00:00Z', 'updated_at' => '2026-02-02T00:00:00Z' ],
			'variables' => [ 'tagline' => 'Mine', 'phone' => '+1 555' ],
			'overrides' => [
				'bio'   => [ 'content' => '<p>I sell rockets.</p>', 'content_html' => '<p>ignored for text</p>' ],
				'logo'  => [ 'content' => 'not text-like' ],
				'legal' => [ 'content' => 'Locked: never applied' ],
				'gone'  => [ 'content' => 'block no longer exists' ],
			],
			'blocks'    => [ [ 'id' => 'old', 'type' => 'text', 'content' => 'stale design' ] ],
		];

		$out = TemplateLink::refresh( self::template(), $signature );

		$index = TemplateLink::index_blocks( $out['blocks'] );
		$this->assertArrayNotHasKey( 'old', $index, 'The design is the template\'s.' );
		$this->assertSame( '<p>I sell rockets.</p>', $index['bio']['block']['content'] );
		$this->assertArrayNotHasKey( 'content_html', $index['bio']['block'] );
		$this->assertSame( 'Confidential.', $index['legal']['block']['content'] );
		$this->assertSame( [ 'bio' => [ 'content' => '<p>I sell rockets.</p>' ] ], $out['overrides'] );
		$this->assertSame( [ 'tagline' => 'Mine', 'phone' => '+1 555' ], $out['variables'] );
		$this->assertSame( '2026-02-02T00:00:00Z', $out['meta']['updated_at'] );
		$this->assertSame( 'locked_design', $out['settings']['employee_mode'] );
	}

	public function test_refresh_uses_template_variable_defaults_and_stamps_meta(): void {
		$out = TemplateLink::refresh( self::template(), [ 'meta' => [ 'created_at' => 'c' ] ], '2026-11-05T10:00:00Z' );

		$this->assertSame( 'Default tagline', $out['variables']['tagline'] );
		$this->assertSame( 'c', $out['meta']['created_at'] );
		$this->assertSame( '2026-11-05T10:00:00Z', $out['meta']['updated_at'] );
	}

	public function test_fields_only_never_applies_overrides(): void {
		$out = TemplateLink::refresh(
			self::template( TemplateLink::MODE_FIELDS_ONLY ),
			[ 'overrides' => [ 'bio' => [ 'content' => '<p>Mine</p>' ] ] ]
		);

		$this->assertSame( [], $out['overrides'] );
		$this->assertSame( '<p>{{tagline}}</p>', TemplateLink::index_blocks( $out['blocks'] )['bio']['block']['content'] );
	}

	public function test_enforce_locked_design_keeps_unlocked_text_and_reverts_everything_else(): void {
		$incoming = TemplateLink::refresh( self::template(), [] );
		$incoming['canvas']['background_color'] = '#ff0000';
		$incoming['variables']['tagline']       = 'New tagline';
		// Unlocked text: content edit kept, style edit reverted.
		$incoming['blocks'][1]['columns'][0]['children'][1]['content']        = '<p>Edited bio</p>';
		$incoming['blocks'][1]['columns'][0]['children'][1]['style']['color'] = '#ff00ff';
		// Unlocked heading: rich text kept.
		$incoming['blocks'][1]['columns'][0]['children'][0]['content_html'] = '<p><strong>Ana</strong></p>';
		// Locked blocks: edits reverted.
		$incoming['blocks'][0]['src']     = 'https://evil.test/logo.png';
		$incoming['blocks'][2]['content'] = 'No disclaimer';
		// A new block: dropped.
		$incoming['blocks'][] = [ 'id' => 'extra', 'type' => 'text', 'content' => 'hi' ];

		$out   = TemplateLink::enforce( self::template(), $incoming, [] );
		$index = TemplateLink::index_blocks( $out['blocks'] );

		$this->assertSame( '#ffffff', $out['canvas']['background_color'] );
		$this->assertSame( 'New tagline', $out['variables']['tagline'] );
		$this->assertSame( '<p>Edited bio</p>', $index['bio']['block']['content'] );
		$this->assertSame( '#333333', $index['bio']['block']['style']['color'] );
		$this->assertSame( '<p><strong>Ana</strong></p>', $index['name']['block']['content_html'] );
		$this->assertSame( 'https://cdn.acme.test/logo.png', $index['logo']['block']['src'] );
		$this->assertSame( 'Confidential.', $index['legal']['block']['content'] );
		$this->assertArrayNotHasKey( 'extra', $index );
		$this->assertSame(
			[
				'name' => [ 'content_html' => '<p><strong>Ana</strong></p>' ],
				'bio'  => [ 'content' => '<p>Edited bio</p>' ],
			],
			$out['overrides']
		);
	}

	public function test_enforce_is_stable_for_a_compliant_save(): void {
		$stored   = TemplateLink::refresh( self::template(), [ 'overrides' => [ 'bio' => [ 'content' => '<p>Mine</p>' ] ] ] );
		$incoming = json_decode( (string) json_encode( $stored ), true );

		$this->assertTrue( TemplateLink::equivalent( TemplateLink::enforce( self::template(), $incoming, $stored ), $incoming ) );
	}

	public function test_enforce_keeps_listed_overrides_even_when_equal_to_the_template(): void {
		$incoming              = TemplateLink::refresh( self::template(), [] );
		$incoming['overrides'] = [ 'bio' => [ 'content' => '<p>{{tagline}}</p>' ] ];

		$out = TemplateLink::enforce( self::template(), $incoming, [] );

		$this->assertSame( [ 'bio' => [ 'content' => '<p>{{tagline}}</p>' ] ], $out['overrides'] );
	}

	public function test_enforce_fields_only_accepts_variables_only(): void {
		$incoming                     = TemplateLink::refresh( self::template( TemplateLink::MODE_FIELDS_ONLY ), [] );
		$incoming['variables']        = [ 'tagline' => 'Filled' ];
		$incoming['blocks'][2]['content'] = 'Edited';
		$incoming['overrides']        = [ 'bio' => [ 'content' => '<p>sneaky</p>' ] ];

		$out = TemplateLink::enforce( self::template( TemplateLink::MODE_FIELDS_ONLY ), $incoming, [] );

		$this->assertSame( [ 'tagline' => 'Filled' ], $out['variables'] );
		$this->assertSame( 'Confidential.', TemplateLink::index_blocks( $out['blocks'] )['legal']['block']['content'] );
		$this->assertSame( '<p>{{tagline}}</p>', TemplateLink::index_blocks( $out['blocks'] )['bio']['block']['content'] );
		$this->assertSame( [], $out['overrides'] );
	}

	public function test_a_locked_container_locks_its_children(): void {
		$template                       = self::template();
		$template['blocks'][1]['locked'] = true;
		$incoming                       = TemplateLink::refresh( $template, [] );
		$incoming['blocks'][1]['columns'][0]['children'][1]['content'] = '<p>Edited</p>';

		$out = TemplateLink::enforce( $template, $incoming, [] );

		$this->assertTrue( TemplateLink::index_blocks( $out['blocks'] )['bio']['locked'] );
		$this->assertSame( '<p>{{tagline}}</p>', TemplateLink::index_blocks( $out['blocks'] )['bio']['block']['content'] );
		$this->assertSame( [], $out['overrides'] );
	}

	public function test_detach_merges_overrides_and_drops_the_map(): void {
		$linked = TemplateLink::refresh( self::template(), [ 'overrides' => [ 'bio' => [ 'content' => '<p>Mine</p>' ] ] ] );

		$out = TemplateLink::detach( $linked );

		$this->assertArrayNotHasKey( 'overrides', $out );
		$this->assertSame( '<p>Mine</p>', TemplateLink::index_blocks( $out['blocks'] )['bio']['block']['content'] );
	}

	public function test_equivalent_ignores_key_order_and_empty_object_shape(): void {
		$this->assertTrue( TemplateLink::equivalent( [ 'a' => 1, 'b' => [] ], [ 'b' => new \stdClass(), 'a' => 1.0 ] ) );
		$this->assertFalse( TemplateLink::equivalent( [ 'a' => [ 1, 2 ] ], [ 'a' => [ 2, 1 ] ] ) );
		$this->assertTrue( TemplateLink::equivalent( [ 'meta' => [ 'x' => 1 ], 'a' => 1 ], [ 'meta' => [], 'a' => 1 ], true ) );
	}

	public function test_legacy_containers_migrate_deterministically(): void {
		$legacy = [
			'schema_version' => '1.0',
			'variables'      => [],
			'blocks'         => [
				[
					'id'             => 'c1',
					'type'           => 'container',
					'columns'        => 2,
					'left_width'     => 35,
					'children'       => [ [ 'id' => 'a', 'type' => 'text', 'content' => 'A' ] ],
					'right_children' => [ [ 'id' => 'b', 'type' => 'text', 'content' => 'B' ] ],
				],
				[
					'id'       => 'c2',
					'type'     => 'container',
					'columns'  => 2,
					'children' => [
						[ 'id' => 'x', 'type' => 'text' ],
						[ 'id' => 'y', 'type' => 'text' ],
						[ 'id' => 'z', 'type' => 'text' ],
					],
				],
			],
		];

		$once  = SchemaMigration::to_current( $legacy );
		$twice = SchemaMigration::to_current( $once );

		$this->assertSame( '1.1', $once['schema_version'] );
		$this->assertSame( $once, $twice, 'Idempotent.' );
		$this->assertSame( [ 'c1-col-0', 'c1-col-1' ], array_column( $once['blocks'][0]['columns'], 'id' ) );
		$this->assertSame( [ 35, 65 ], array_column( $once['blocks'][0]['columns'], 'width' ) );
		$this->assertSame( 'b', $once['blocks'][0]['columns'][1]['children'][0]['id'] );
		$this->assertArrayNotHasKey( 'right_children', $once['blocks'][0] );
		$this->assertSame( 0, $once['blocks'][0]['gap'] );
		// Pre-1.0.31 single list: split half-by-half (ceil on the left).
		$this->assertCount( 2, $once['blocks'][1]['columns'][0]['children'] );
		$this->assertCount( 1, $once['blocks'][1]['columns'][1]['children'] );
	}

	public function test_normalize_widths_matches_the_editor(): void {
		$this->assertSame( [ 33, 33, 34 ], SchemaMigration::normalize_widths( [ 1, 1, 1 ] ) );
		$this->assertSame( [ 10, 90 ], SchemaMigration::normalize_widths( [ 1, 99 ] ) );
		$this->assertSame( [ 50, 50 ], SchemaMigration::normalize_widths( [ 0, null ] ) );
	}
}
