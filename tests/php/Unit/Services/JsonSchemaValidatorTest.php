<?php
/**
 * Unit tests for the (Sprint 3 minimal) JSON schema validator.
 *
 * @package ImaginaSignatures\Tests\Unit\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Services;

use ImaginaSignatures\Exceptions\ValidationException;
use ImaginaSignatures\Services\JsonSchemaValidator;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Services\JsonSchemaValidator
 */
final class JsonSchemaValidatorTest extends TestCase {

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
}
