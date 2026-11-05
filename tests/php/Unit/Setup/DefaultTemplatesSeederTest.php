<?php
/**
 * Unit tests for the seeded templates' translation at read time.
 *
 * @package ImaginaSignatures\Tests\Unit\Setup
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Setup;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Setup\DefaultTemplatesSeeder;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Setup\DefaultTemplatesSeeder::translated_meta
 * @covers \ImaginaSignatures\Setup\DefaultTemplatesSeeder::localize
 * @covers \ImaginaSignatures\Setup\DefaultTemplatesSeeder::delocalize
 */
final class DefaultTemplatesSeederTest extends TestCase {

	/**
	 * Fake catalogue: msgid => Spanish.
	 *
	 * @var array<string, string>
	 */
	private const ES = [
		'Minimal Modern'                                => 'Minimalista moderna',
		'Single column, generous spacing, sans-serif.'  => 'Una columna, espaciado amplio, sans serif.',
	];

	private bool $spanish = false;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->spanish = false;
		Functions\when( '__' )->alias(
			function ( $text ) {
				return $this->spanish && isset( self::ES[ $text ] ) ? self::ES[ $text ] : $text;
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_translated_meta_mirrors_the_seeded_source_strings(): void {
		$source     = DefaultTemplatesSeeder::source_meta();
		$translated = DefaultTemplatesSeeder::translated_meta();

		$this->assertSame( array_keys( $source ), array_keys( $translated ) );
		foreach ( $source as $slug => $meta ) {
			$this->assertSame( $meta['name'], $translated[ $slug ]['name'], $slug );
			$this->assertSame( $meta['description'], $translated[ $slug ]['description'], $slug );
		}
	}

	public function test_localize_translates_untouched_system_templates(): void {
		$this->spanish = true;

		$row = DefaultTemplatesSeeder::localize( $this->row( true, 'Minimal Modern', 'Single column, generous spacing, sans-serif.' ) );

		$this->assertSame( 'Minimalista moderna', $row['name'] );
		$this->assertSame( 'Una columna, espaciado amplio, sans serif.', $row['description'] );
		$this->assertSame( 'minimal', $row['category'], 'categories are filter keys and stay as stored' );
	}

	public function test_localize_keeps_renamed_and_user_templates(): void {
		$this->spanish = true;

		$renamed = DefaultTemplatesSeeder::localize( $this->row( true, 'Our house style', 'Single column, generous spacing, sans-serif.' ) );
		$this->assertSame( 'Our house style', $renamed['name'] );
		$this->assertSame( 'Una columna, espaciado amplio, sans serif.', $renamed['description'] );

		$user = DefaultTemplatesSeeder::localize( $this->row( false, 'Minimal Modern', null ) );
		$this->assertSame( 'Minimal Modern', $user['name'] );
		$this->assertNull( $user['description'] );

		$unknown = $this->row( true, 'Minimal Modern', null );
		$unknown['slug'] = 'not-seeded';
		$this->assertSame( 'Minimal Modern', DefaultTemplatesSeeder::localize( $unknown )['name'] );
	}

	public function test_delocalize_stores_the_source_text_when_the_translation_is_saved_back(): void {
		$this->spanish = true;

		$payload = DefaultTemplatesSeeder::delocalize(
			'minimal-modern',
			true,
			[
				'name'        => 'Minimalista moderna',
				'description' => 'A new description',
				'category'    => 'minimal',
			]
		);

		$this->assertSame( 'Minimal Modern', $payload['name'] );
		$this->assertSame( 'A new description', $payload['description'] );

		$user = DefaultTemplatesSeeder::delocalize( 'minimal-modern', false, [ 'name' => 'Minimalista moderna' ] );
		$this->assertSame( 'Minimalista moderna', $user['name'], 'non-system rows are stored verbatim' );
	}

	/**
	 * @return array<string, mixed>
	 */
	private function row( bool $is_system, string $name, ?string $description ): array {
		return [
			'id'          => 1,
			'slug'        => 'minimal-modern',
			'name'        => $name,
			'category'    => 'minimal',
			'description' => $description,
			'is_system'   => $is_system,
		];
	}
}
