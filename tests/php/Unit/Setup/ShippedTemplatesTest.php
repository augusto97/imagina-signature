<?php
/**
 * Every shipped template survives the server-side save pipeline as-is.
 *
 * @package ImaginaSignatures\Tests\Unit\Setup
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Setup;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Services\HtmlSanitizer;
use ImaginaSignatures\Services\JsonSchemaValidator;
use ImaginaSignatures\Services\SchemaSanitizer;
use PHPUnit\Framework\TestCase;

/**
 * Applying a template and saving the signature runs it through
 * {@see JsonSchemaValidator} and {@see SchemaSanitizer}. A template
 * that the sanitizer rewrites (a dropped colour, a stripped URL…) would
 * look different after the first save — so every shipped file must
 * validate and come back from the sanitizer unchanged, without notes.
 *
 * @coversNothing
 */
final class ShippedTemplatesTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		Functions\when( '__' )->returnArg( 1 );
		imgsig_tests_load_kses();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * @return array<string, array{0: string}>
	 */
	public function templates(): array {
		$out = [];
		foreach ( glob( dirname( __DIR__, 4 ) . '/templates/*.json' ) as $file ) {
			$out[ basename( $file, '.json' ) ] = [ $file ];
		}
		return $out;
	}

	/**
	 * @dataProvider templates
	 *
	 * @param string $file Template file.
	 */
	public function test_template_validates_and_sanitizes_unchanged( string $file ): void {
		$schema = json_decode( (string) file_get_contents( $file ), true );
		$this->assertIsArray( $schema );

		( new JsonSchemaValidator() )->validate( $schema );

		$sanitizer = new SchemaSanitizer( new HtmlSanitizer() );
		$clean     = $sanitizer->sanitize( $schema );

		$this->assertSame( [], $sanitizer->notes() );
		$this->assertSame( $schema, $clean );
	}
}
