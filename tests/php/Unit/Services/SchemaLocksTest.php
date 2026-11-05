<?php
/**
 * Unit tests for `locked`, `settings.employee_mode` and `overrides` in
 * the schema validator and sanitizer.
 *
 * @package ImaginaSignatures\Tests\Unit\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Services;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Exceptions\ValidationException;
use ImaginaSignatures\Services\HtmlSanitizer;
use ImaginaSignatures\Services\JsonSchemaValidator;
use ImaginaSignatures\Services\SchemaSanitizer;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Services\JsonSchemaValidator
 * @covers \ImaginaSignatures\Services\SchemaSanitizer
 */
final class SchemaLocksTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		Functions\when( '__' )->returnArg();
		imgsig_tests_load_kses();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * @param array<string, mixed> $extra Top-level additions.
	 *
	 * @return array<string, mixed>
	 */
	private function schema( array $extra = [] ): array {
		return $extra + [
			'schema_version' => '1.1',
			'meta'           => [],
			'canvas'         => [ 'width' => 600 ],
			'blocks'         => [
				[
					'id'      => 't1',
					'type'    => 'text',
					'content' => '<p>Hi</p>',
					'locked'  => true,
				],
				[
					'id'      => 'h1',
					'type'    => 'heading',
					'content' => 'Ana & Co',
				],
			],
			'variables'      => [],
		];
	}

	/**
	 * @param array<string, mixed> $schema Schema.
	 *
	 * @return array<int, array{path: string, message: string}>
	 */
	private function errors( array $schema ): array {
		try {
			( new JsonSchemaValidator() )->validate( $schema );
		} catch ( ValidationException $e ) {
			return $e->get_errors();
		}
		return [];
	}

	public function test_valid_locks_modes_and_overrides_pass(): void {
		$this->assertSame(
			[],
			$this->errors(
				$this->schema(
					[
						'settings'  => [ 'employee_mode' => 'locked_design' ],
						'overrides' => [ 'h1' => [ 'content' => 'Ana' ] ],
					]
				)
			)
		);
	}

	public function test_invalid_lock_mode_and_override_shapes_are_rejected(): void {
		$schema                         = $this->schema(
			[
				'settings'  => [ 'employee_mode' => 'anything' ],
				'overrides' => [ 'h1' => 'not an object' ],
			]
		);
		$schema['blocks'][0]['locked'] = 'yes';

		$paths = array_column( $this->errors( $schema ), 'path' );

		$this->assertContains( 'blocks[0].locked', $paths );
		$this->assertContains( 'settings.employee_mode', $paths );
		$this->assertContains( 'overrides.h1', $paths );
		$this->assertContains( 'settings', array_column( $this->errors( $this->schema( [ 'settings' => 'x' ] ) ), 'path' ) );
	}

	public function test_sanitizer_keeps_locks_and_cleans_overrides_by_block_type(): void {
		$sanitizer = new SchemaSanitizer( new HtmlSanitizer() );

		$clean = $sanitizer->sanitize(
			$this->schema(
				[
					'settings'  => [ 'employee_mode' => 'fields_only' ],
					'overrides' => [
						't1'      => [ 'content' => '<p>Hi<script>alert(1)</script></p>', 'style' => 'dropped' ],
						'h1'      => [
							'content'      => 'Ana & <b>Co</b>',
							'content_html' => '<p>Ana <img src=x onerror=alert(1)></p>',
						],
						'missing' => 'junk',
					],
				]
			)
		);

		$this->assertTrue( $clean['blocks'][0]['locked'] );
		$this->assertSame( 'fields_only', $clean['settings']['employee_mode'] );
		$this->assertSame( [ 'content' ], array_keys( $clean['overrides']['t1'] ) );
		$this->assertStringNotContainsString( '<script', $clean['overrides']['t1']['content'] );
		// Heading `content` is plain text: markup stripped, `&` kept.
		$this->assertSame( 'Ana & Co', $clean['overrides']['h1']['content'] );
		$this->assertStringNotContainsString( 'onerror', $clean['overrides']['h1']['content_html'] );
		$this->assertArrayNotHasKey( 'missing', $clean['overrides'] );
	}

	public function test_sanitizer_drops_invalid_lock_flags_and_modes(): void {
		$sanitizer                     = new SchemaSanitizer( new HtmlSanitizer() );
		$schema                        = $this->schema( [ 'settings' => [ 'employee_mode' => 'root' ] ] );
		$schema['blocks'][0]['locked'] = 1;

		$clean = $sanitizer->sanitize( $schema );

		$this->assertArrayNotHasKey( 'locked', $clean['blocks'][0] );
		$this->assertArrayNotHasKey( 'employee_mode', (array) $clean['settings'] );
		$this->assertNotEmpty( $sanitizer->notes() );
	}

	public function test_empty_settings_and_overrides_serialise_as_objects(): void {
		$clean = ( new SchemaSanitizer( new HtmlSanitizer() ) )->sanitize(
			$this->schema(
				[
					'settings'  => [],
					'overrides' => [],
				]
			)
		);

		$json = (string) json_encode( $clean );
		$this->assertStringContainsString( '"settings":{}', $json );
		$this->assertStringContainsString( '"overrides":{}', $json );
	}
}
