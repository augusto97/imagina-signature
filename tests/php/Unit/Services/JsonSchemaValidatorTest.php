<?php
/**
 * Unit tests for the (Sprint 3 minimal) JSON schema validator.
 *
 * @package ImaginaSignatures\Tests\Unit\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Services;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Exceptions\ValidationException;
use ImaginaSignatures\Services\JsonSchemaValidator;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Services\JsonSchemaValidator
 */
final class JsonSchemaValidatorTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		// JsonSchemaValidator surfaces error messages through __() —
		// passthrough is plenty for a test that asserts on the
		// structured `errors` payload, not the human message.
		Functions\when( '__' )->returnArg( 1 );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * @return array<string, mixed>
	 */
	private function valid_payload(): array {
		return [
			'schema_version' => '1.0',
			'meta'           => [
				'created_at'     => '2026-01-01T00:00:00Z',
				'updated_at'     => '2026-01-01T00:00:00Z',
				'editor_version' => '1.0.0',
			],
			'canvas'         => [
				'width'            => 600,
				'background_color' => '#ffffff',
				'font_family'      => 'Arial, sans-serif',
				'font_size'        => 14,
				'text_color'       => '#000000',
				'link_color'       => '#1d4ed8',
			],
			'blocks'         => [
				[ 'id' => 'b1', 'type' => 'text' ],
				[ 'id' => 'b2', 'type' => 'image' ],
			],
			'variables'      => [],
		];
	}

	public function test_accepts_minimum_valid_payload(): void {
		$validator = new JsonSchemaValidator();
		$validator->validate( $this->valid_payload() );

		$this->addToAssertionCount( 1 ); // No exception thrown.
	}

	public function test_rejects_missing_top_level_keys(): void {
		$validator = new JsonSchemaValidator();
		$payload   = $this->valid_payload();
		unset( $payload['canvas'] );

		try {
			$validator->validate( $payload );
			$this->fail( 'Expected ValidationException.' );
		} catch ( ValidationException $e ) {
			$paths = array_map(
				static function ( array $error ): string {
					return $error['path'];
				},
				$e->get_errors()
			);
			$this->assertContains( 'canvas', $paths );
		}
	}

	public function test_rejects_unsupported_schema_version(): void {
		$validator = new JsonSchemaValidator();
		$payload   = $this->valid_payload();
		$payload['schema_version'] = '99.0';

		try {
			$validator->validate( $payload );
			$this->fail( 'Expected ValidationException.' );
		} catch ( ValidationException $e ) {
			$paths = array_map(
				static function ( array $error ): string {
					return $error['path'];
				},
				$e->get_errors()
			);
			$this->assertContains( 'schema_version', $paths );
		}
	}

	public function test_rejects_block_without_id_or_type(): void {
		$validator = new JsonSchemaValidator();
		$payload   = $this->valid_payload();
		$payload['blocks'] = [
			[ 'type' => 'text' ],            // missing id
			[ 'id' => 'b2' ],                // missing type
			[ 'id' => '', 'type' => 'text' ], // empty id
			'not-an-object',                  // wrong type entirely
		];

		try {
			$validator->validate( $payload );
			$this->fail( 'Expected ValidationException.' );
		} catch ( ValidationException $e ) {
			$paths = array_map(
				static function ( array $error ): string {
					return $error['path'];
				},
				$e->get_errors()
			);

			$this->assertContains( 'blocks[0].id', $paths );
			$this->assertContains( 'blocks[1].type', $paths );
			$this->assertContains( 'blocks[2].id', $paths );
			$this->assertContains( 'blocks[3]', $paths );
		}
	}

	public function test_rejects_blocks_when_not_array(): void {
		$validator = new JsonSchemaValidator();
		$payload   = $this->valid_payload();
		$payload['blocks'] = 'whatever';

		try {
			$validator->validate( $payload );
			$this->fail( 'Expected ValidationException.' );
		} catch ( ValidationException $e ) {
			$paths = array_map(
				static function ( array $error ): string {
					return $error['path'];
				},
				$e->get_errors()
			);
			$this->assertContains( 'blocks', $paths );
		}
	}

	public function test_collects_multiple_errors_in_single_throw(): void {
		$validator = new JsonSchemaValidator();
		$payload   = [
			'schema_version' => '99.0',
			// No meta, canvas, blocks, variables.
		];

		try {
			$validator->validate( $payload );
			$this->fail( 'Expected ValidationException.' );
		} catch ( ValidationException $e ) {
			// All four required keys missing + bad version = at least 5 errors.
			$this->assertGreaterThanOrEqual( 4, count( $e->get_errors() ) );
		}
	}

	/**
	 * Builds a chain of containers `$levels` deep (the innermost holds a
	 * text block, so total depth is `$levels + 1`).
	 *
	 * @return array<string, mixed>
	 */
	private function nested_container( int $levels ): array {
		$block = [
			'id'   => 'leaf',
			'type' => 'text',
		];
		for ( $i = $levels; $i >= 1; $i-- ) {
			$block = [
				'id'       => 'c' . $i,
				'type'     => 'container',
				'children' => [ $block ],
			];
		}
		return $block;
	}

	/**
	 * @return array<int, string>
	 */
	private function error_paths( ValidationException $e ): array {
		return array_column( $e->get_errors(), 'path' );
	}

	public function test_validates_nested_children_and_right_children(): void {
		$validator         = new JsonSchemaValidator();
		$payload           = $this->valid_payload();
		$payload['blocks'] = [
			[
				'id'             => 'row',
				'type'           => 'container',
				'children'       => [
					[ 'type' => 'text' ],
				],
				'right_children' => [
					[
						'id'   => 'r1',
						'type' => 'system_command',
					],
					'not-a-block',
				],
			],
		];

		try {
			$validator->validate( $payload );
			$this->fail( 'Expected ValidationException.' );
		} catch ( ValidationException $e ) {
			$paths = $this->error_paths( $e );
			$this->assertContains( 'blocks[0].children[0].id', $paths );
			$this->assertContains( 'blocks[0].right_children[0].type', $paths );
			$this->assertContains( 'blocks[0].right_children[1]', $paths );
		}
	}

	public function test_rejects_non_array_children(): void {
		$validator         = new JsonSchemaValidator();
		$payload           = $this->valid_payload();
		$payload['blocks'] = [
			[
				'id'       => 'row',
				'type'     => 'container',
				'children' => 'nope',
			],
		];

		$this->expectException( ValidationException::class );
		$validator->validate( $payload );
	}

	public function test_accepts_depth_four(): void {
		$validator         = new JsonSchemaValidator();
		$payload           = $this->valid_payload();
		$payload['blocks'] = [ $this->nested_container( 3 ) ]; // 3 containers + leaf = depth 4.

		$validator->validate( $payload );
		$this->addToAssertionCount( 1 );
	}

	public function test_rejects_depth_five_with_clear_message(): void {
		$validator         = new JsonSchemaValidator();
		$payload           = $this->valid_payload();
		$payload['blocks'] = [ $this->nested_container( 4 ) ]; // depth 5.

		try {
			$validator->validate( $payload );
			$this->fail( 'Expected ValidationException.' );
		} catch ( ValidationException $e ) {
			$this->assertStringContainsString( 'nested too deeply', $e->getMessage() );
			$this->assertContains( 'blocks[0].children[0].children[0].children[0].children[0]', $this->error_paths( $e ) );
		}
	}

	public function test_rejects_more_than_two_hundred_blocks_counted_recursively(): void {
		$validator = new JsonSchemaValidator();
		$payload   = $this->valid_payload();
		$children  = [];
		for ( $i = 0; $i < 150; $i++ ) {
			$children[] = [
				'id'   => 'c' . $i,
				'type' => 'spacer',
			];
		}
		$top = [];
		for ( $i = 0; $i < 50; $i++ ) {
			$top[] = [
				'id'   => 't' . $i,
				'type' => 'divider',
			];
		}
		$top[]             = [
			'id'       => 'row',
			'type'     => 'container',
			'children' => $children,
		];
		$payload['blocks'] = $top; // 50 + 1 + 150 = 201.

		try {
			$validator->validate( $payload );
			$this->fail( 'Expected ValidationException.' );
		} catch ( ValidationException $e ) {
			$this->assertStringContainsString( 'maximum is 200', $e->getMessage() );
			$this->assertContains( 'blocks', $this->error_paths( $e ) );
		}
	}

	public function test_rejects_payload_over_256_kb(): void {
		$validator         = new JsonSchemaValidator();
		$payload           = $this->valid_payload();
		$payload['blocks'] = [
			[
				'id'      => 'big',
				'type'    => 'text',
				'content' => str_repeat( 'a', 262145 ),
			],
		];

		try {
			$validator->validate( $payload );
			$this->fail( 'Expected ValidationException.' );
		} catch ( ValidationException $e ) {
			$this->assertStringContainsString( 'too large', $e->getMessage() );
			$this->assertSame( [ 'json_content' ], $this->error_paths( $e ) );
		}
	}

	public function test_limits_are_filterable(): void {
		Functions\when( 'apply_filters' )->alias(
			static function ( string $hook, $value ) {
				if ( 'imgsig/schema/limits' === $hook ) {
					$value['max_blocks'] = 2;
				}
				return $value;
			}
		);

		$validator = new JsonSchemaValidator();
		$payload   = $this->valid_payload();
		$payload['blocks'][] = [
			'id'   => 'b3',
			'type' => 'spacer',
		];

		$this->expectException( ValidationException::class );
		$validator->validate( $payload );
	}
}
