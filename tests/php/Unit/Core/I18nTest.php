<?php
/**
 * Unit tests for translation loading.
 *
 * @package ImaginaSignatures\Tests\Unit\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Core;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Core\I18n;
use PHPUnit\Framework\TestCase;

/**
 * Exercises the shipped catalogues in `languages/` — so it also fails
 * when `npm run i18n:build` output is missing or unreadable.
 *
 * @covers \ImaginaSignatures\Core\I18n
 */
final class I18nTest extends TestCase {

	private string $languages;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		if ( ! defined( 'IMGSIG_PATH' ) ) {
			define( 'IMGSIG_PATH', dirname( __DIR__, 4 ) . '/' );
		}
		$this->languages = rtrim( IMGSIG_PATH, '/' ) . '/languages';

		Functions\when( 'trailingslashit' )->alias(
			static function ( $value ): string {
				return rtrim( (string) $value, '/\\' ) . '/';
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_every_spanish_locale_falls_back_to_es_es(): void {
		foreach ( [ 'es_CO', 'es_MX', 'es_AR', 'es_CL', 'es_PE', 'es_VE', 'es_419', 'es' ] as $locale ) {
			$this->assertSame( 'es_ES', I18n::fallback_locale( $locale ), $locale );
		}
	}

	public function test_non_spanish_locales_and_es_es_have_no_fallback(): void {
		foreach ( [ 'es_ES', 'en_US', 'en_GB', 'pt_BR', 'fr_FR', 'eo', 'est' ] as $locale ) {
			$this->assertNull( I18n::fallback_locale( $locale ), $locale );
		}
	}

	public function test_resolves_the_bundled_catalogue_with_fallback(): void {
		$this->assertSame( $this->languages . '/imagina-signatures-es_ES.mo', I18n::resolve_catalogue( 'es_ES', 'mo' ) );
		$this->assertSame( $this->languages . '/imagina-signatures-es_ES.json', I18n::resolve_catalogue( 'es_CO', 'json' ) );
		$this->assertSame( $this->languages . '/imagina-signatures-es_ES.mo', I18n::resolve_catalogue( 'es_MX', 'mo' ) );
		$this->assertNull( I18n::resolve_catalogue( 'en_US', 'json' ) );
		$this->assertNull( I18n::resolve_catalogue( 'fr_FR', 'mo' ) );
	}

	public function test_rejects_locales_that_are_not_locale_codes(): void {
		$this->assertNull( I18n::resolve_catalogue( '../../wp-config', 'mo' ) );
		$this->assertNull( I18n::resolve_catalogue( '', 'json' ) );
		$this->assertNull( I18n::resolve_catalogue( 'es_ES/../x', 'json' ) );
	}

	public function test_js_translations_for_spanish_locales(): void {
		$map = (array) I18n::js_translations( 'es_CO' );

		$this->assertNotEmpty( $map );
		$this->assertSame( 'Mis firmas', $map['My Signatures'] ?? null );
		foreach ( $map as $msgid => $msgstr ) {
			$this->assertIsString( $msgid );
			$this->assertIsString( $msgstr );
			$this->assertNotSame( '', $msgstr );
		}
	}

	public function test_js_translations_are_an_empty_object_for_english(): void {
		$map = I18n::js_translations( 'en_US' );

		$this->assertInstanceOf( \stdClass::class, $map );
		$this->assertSame( '{}', json_encode( $map ) );
	}

	public function test_js_translations_default_to_the_user_locale(): void {
		Functions\when( 'get_user_locale' )->justReturn( 'es_MX' );

		$this->assertSame( 'Plantillas', ( (array) I18n::js_translations() )['Templates'] ?? null );
	}

	public function test_mofile_filter_falls_back_inside_the_bundled_folder_only(): void {
		$bundled_co = $this->languages . '/imagina-signatures-es_CO.mo';
		$this->assertSame( $this->languages . '/imagina-signatures-es_ES.mo', I18n::filter_mofile( $bundled_co, 'imagina-signatures' ) );

		// Other text domains, existing files, other folders and
		// non-Spanish locales pass through untouched.
		$this->assertSame( $bundled_co, I18n::filter_mofile( $bundled_co, 'other-plugin' ) );
		$es = $this->languages . '/imagina-signatures-es_ES.mo';
		$this->assertSame( $es, I18n::filter_mofile( $es, 'imagina-signatures' ) );
		$pack = sys_get_temp_dir() . '/imagina-signatures-es_CO.mo';
		$this->assertSame( $pack, I18n::filter_mofile( $pack, 'imagina-signatures' ) );
		$fr = $this->languages . '/imagina-signatures-fr_FR.mo';
		$this->assertSame( $fr, I18n::filter_mofile( $fr, 'imagina-signatures' ) );
	}

	public function test_bundled_mo_is_a_valid_catalogue(): void {
		$entries = self::read_mo( $this->languages . '/imagina-signatures-es_ES.mo' );

		$this->assertArrayHasKey( '', $entries, 'header entry' );
		$this->assertStringContainsString( 'Language: es_ES', $entries[''] );
		$this->assertStringContainsString( 'Plural-Forms: nplurals=2; plural=(n != 1);', $entries[''] );
		$this->assertSame( 'Mis firmas', $entries['My Signatures'] ?? null );
		$this->assertSame( 'Acceso denegado', $entries['Access denied'] ?? null );
	}

	public function test_rest_requests_in_our_namespace_switch_to_the_user_locale(): void {
		$switched = [];
		$restored = 0;
		Functions\when( 'is_user_logged_in' )->justReturn( true );
		Functions\when( 'get_user_locale' )->justReturn( 'es_CO' );
		Functions\when( 'determine_locale' )->justReturn( 'en_US' );
		Functions\when( 'switch_to_locale' )->alias(
			static function ( $locale ) use ( &$switched ): bool {
				$switched[] = $locale;
				return true;
			}
		);
		Functions\when( 'restore_previous_locale' )->alias(
			static function () use ( &$restored ): bool {
				++$restored;
				return true;
			}
		);

		$ours   = new \WP_REST_Request( [] );
		$theirs = new \WP_REST_Request( [] );
		$ours->set_route( '/imagina-signatures/v1/signatures' );
		$theirs->set_route( '/wp/v2/posts' );

		$this->assertSame( 'resp', I18n::switch_rest_locale( 'resp', [], $ours ) );
		$this->assertSame( [ 'es_CO' ], $switched );
		$this->assertSame( 'resp', I18n::restore_rest_locale( 'resp', [], $ours ) );
		$this->assertSame( 1, $restored );

		I18n::switch_rest_locale( null, [], $theirs );
		I18n::restore_rest_locale( null, [], $theirs );
		$this->assertSame( [ 'es_CO' ], $switched, 'core routes are left alone' );
		$this->assertSame( 1, $restored );
	}

	public function test_rest_requests_already_in_the_user_locale_do_not_switch(): void {
		Functions\when( 'is_user_logged_in' )->justReturn( true );
		Functions\when( 'get_user_locale' )->justReturn( 'es_ES' );
		Functions\when( 'determine_locale' )->justReturn( 'es_ES' );
		Functions\expect( 'switch_to_locale' )->never();
		Functions\expect( 'restore_previous_locale' )->never();

		$request = new \WP_REST_Request( [] );
		$request->set_route( '/imagina-signatures/v1/me' );

		I18n::switch_rest_locale( null, [], $request );
		I18n::restore_rest_locale( null, [], $request );
		$this->addToAssertionCount( 1 );
	}

	/**
	 * Minimal little-endian .mo reader (format revision 0).
	 *
	 * @param string $file Path.
	 *
	 * @return array<string, string>
	 */
	private static function read_mo( string $file ): array {
		$data = (string) file_get_contents( $file );
		$head = unpack( 'Vmagic/Vrevision/Vcount/Vorig/Vtrans', substr( $data, 0, 20 ) );
		self::assertSame( 0x950412de, $head['magic'] );
		self::assertSame( 0, $head['revision'] );

		$out = [];
		for ( $i = 0; $i < $head['count']; $i++ ) {
			$o = unpack( 'Vlen/Voff', substr( $data, $head['orig'] + $i * 8, 8 ) );
			$t = unpack( 'Vlen/Voff', substr( $data, $head['trans'] + $i * 8, 8 ) );

			$out[ substr( $data, $o['off'], $o['len'] ) ] = substr( $data, $t['off'], $t['len'] );
		}
		return $out;
	}
}
