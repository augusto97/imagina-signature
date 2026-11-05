<?php
/**
 * Unit tests for SchemaShape.
 *
 * @package ImaginaSignatures\Tests\Unit\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Services;

use ImaginaSignatures\Services\SchemaShape;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Services\SchemaShape
 */
final class SchemaShapeTest extends TestCase {

	public function test_empty_variables_round_trip_as_json_object(): void {
		$decoded = json_decode( '{"schema_version":"1.0","blocks":[],"variables":{}}', true );
		$this->assertSame( [], $decoded['variables'] );

		$restored = SchemaShape::restore_objects( $decoded );

		$this->assertSame( '{"schema_version":"1.0","blocks":[],"variables":{}}', json_encode( $restored ) );
	}

	public function test_non_empty_and_list_fields_are_untouched(): void {
		$schema = [
			'blocks'    => [],
			'variables' => [ 'name' => 'Ana' ],
		];

		$restored = SchemaShape::restore_objects( $schema );

		$this->assertSame( [], $restored['blocks'] );
		$this->assertSame( [ 'name' => 'Ana' ], $restored['variables'] );
	}
}
