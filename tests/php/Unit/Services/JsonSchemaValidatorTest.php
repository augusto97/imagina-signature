<?php
/**
 * JsonSchemaValidator tests.
 *
 * @package ImaginaSignatures\Tests\Unit\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Services;

use ImaginaSignatures\Exceptions\ValidationException;
use ImaginaSignatures\Services\JsonSchemaValidator;
use PHPUnit\Framework\TestCase;

if ( ! function_exists( 'wp_parse_url' ) ) {
	function wp_parse_url( $url, $component = -1 ) {
		return PHP_URL_SCHEME === $component ? parse_url( $url, $component ) : parse_url( $url );
	}
}

if ( ! function_exists( '__' ) ) {
	function __( $text, $domain = '' ) { // phpcs:ignore Generic.NamingConventions.CamelCapsFunctionName
		return $text;
	}
}

final class JsonSchemaValidatorTest extends TestCase {

	public function test_accepts_minimal_valid_schema(): void {
		$validator = new JsonSchemaValidator();
		$validator->validate(
			[
				'schema_version' => '1.0',
				'canvas'         => [
					'width'            => 600,
					'background_color' => '#ffffff',
					'text_color'       => '#000000',
					'link_color'       => '#1a73e8',
				],
				'blocks'         => [],
			]
		);

		$this->expectNotToPerformAssertions();
	}

	public function test_rejects_unknown_schema_version(): void {
		$validator = new JsonSchemaValidator();
		$this->expectException( ValidationException::class );
		$validator->validate( [ 'schema_version' => '0.9', 'canvas' => [ 'width' => 600 ], 'blocks' => [] ] );
	}

	public function test_rejects_unsafe_image_src(): void {
		$validator = new JsonSchemaValidator();
		try {
			$validator->validate(
				[
					'schema_version' => '1.0',
					'canvas'         => [ 'width' => 600 ],
					'blocks'         => [
						[
							'id'   => 'a',
							'type' => 'image',
							'grid' => [ 'col' => 1, 'row' => 1 ],
							'src'  => 'javascript:alert(1)',
							'alt'  => 'x',
						],
					],
				]
			);
			$this->fail( 'Expected validation to fail.' );
		} catch ( ValidationException $e ) {
			$paths = array_column( $e->get_errors(), 'path' );
			$this->assertContains( 'blocks[0].src', $paths );
		}
	}
}
