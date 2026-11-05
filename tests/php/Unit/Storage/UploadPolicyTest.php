<?php
/**
 * Unit tests for UploadPolicy and ImageProcessor's metadata strip.
 *
 * @package ImaginaSignatures\Tests\Unit\Storage
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Storage;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Storage\ImageProcessor;
use ImaginaSignatures\Storage\UploadPolicy;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Storage\UploadPolicy
 * @covers \ImaginaSignatures\Storage\ImageProcessor
 */
final class UploadPolicyTest extends TestCase {

	/** @var array<int, array<string, mixed>> */
	private array $meta = [];

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->meta = [];

		Functions\when( 'get_user_meta' )->alias(
			function ( $user_id, $key ) {
				return $this->meta[ $user_id ][ $key ] ?? '';
			}
		);
		Functions\when( 'update_user_meta' )->alias(
			function ( $user_id, $key, $value ): bool {
				$this->meta[ $user_id ][ $key ] = $value;
				return true;
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_mime_allowlist_and_canonicalisation(): void {
		$this->assertSame( 'image/png', UploadPolicy::canonical_mime( 'IMAGE/PNG' ) );
		$this->assertSame( 'image/jpeg', UploadPolicy::canonical_mime( 'image/jpg' ) );
		$this->assertSame( 'text/vcard', UploadPolicy::canonical_mime( 'text/x-vcard' ) );
		$this->assertSame( 'text/vcard', UploadPolicy::canonical_mime( 'text/vcard; charset=utf-8' ) );

		foreach ( [ 'image/svg+xml', 'text/html', 'application/x-php', 'application/octet-stream', '' ] as $bad ) {
			$this->assertFalse( UploadPolicy::is_allowed( $bad ), $bad );
		}

		$this->assertSame( 'vcf', UploadPolicy::extension_for( 'text/x-vcard' ) );
		$this->assertSame( 'jpg', UploadPolicy::extension_for( 'image/jpeg' ) );
	}

	public function test_size_limits_per_type(): void {
		$this->assertSame( 65536, UploadPolicy::max_size_for( 'text/vcard' ) );
		$this->assertSame( 5 * MB_IN_BYTES, UploadPolicy::max_size_for( 'image/png' ) );
	}

	public function test_vcard_signature_detection(): void {
		$this->assertTrue( UploadPolicy::looks_like_vcard( "BEGIN:VCARD\r\nVERSION:3.0" ) );
		$this->assertTrue( UploadPolicy::looks_like_vcard( "\xEF\xBB\xBF  begin:vcard\n" ) );
		$this->assertFalse( UploadPolicy::looks_like_vcard( '<html><script>alert(1)</script>' ) );
		$this->assertFalse( UploadPolicy::looks_like_vcard( 'X BEGIN:VCARD' ) );
	}

	/**
	 * @return array<string, array{0: string, 1: bool}>
	 */
	public function keys(): array {
		return [
			'current format'  => [ 'u/0123456789abcdef/aa.png', true ],
			'legacy format'   => [ 'users/42/1700000000-logo.png', true ],
			'dot dot'         => [ 'u/0123456789abcdef/../../etc/passwd', false ],
			'leading slash'   => [ '/u/0123456789abcdef/a.png', false ],
			'double slash'    => [ 'u//a.png', false ],
			'space'           => [ 'u/0123456789abcdef/a b.png', false ],
			'percent'         => [ 'u/0123456789abcdef/%2e%2e/a.png', false ],
			'query'           => [ 'u/0123456789abcdef/a.png?x=1', false ],
			'backslash'       => [ 'u\\a.png', false ],
			'empty'           => [ '', false ],
		];
	}

	/**
	 * @dataProvider keys
	 */
	public function test_strict_key_pattern( string $key, bool $valid ): void {
		$this->assertSame( $valid, UploadPolicy::is_valid_key( $key ) );
	}

	public function test_keys_use_random_token_not_user_id_or_filename(): void {
		$key   = UploadPolicy::new_object_key( 42, 'image/png' );
		$token = UploadPolicy::user_token( 42 );

		$this->assertMatchesRegularExpression( '#^u/[a-f0-9]{16}/[a-f0-9]{32}\.png$#', $key );
		// No path segment is the user id. (A substring check was flaky: a
		// random hex token contains "42" in ~6% of runs.)
		$this->assertNotContains( '42', explode( '/', $key ) );
		$this->assertSame( 1, preg_match( '#^[a-f0-9]{16}$#', $token ) );
		$this->assertSame( $token, UploadPolicy::user_token( 42 ), 'Token is stable per user.' );
		$this->assertNotSame( $token, UploadPolicy::user_token( 43 ) );
		$this->assertTrue( UploadPolicy::key_belongs_to( $key, 42 ) );
		$this->assertFalse( UploadPolicy::key_belongs_to( $key, 43 ) );
		$this->assertTrue( UploadPolicy::key_belongs_to( 'users/42/1-a.png', 42 ) );
		$this->assertFalse( UploadPolicy::key_belongs_to( 'users/42/../43/a.png', 42 ) );

		$this->assertSame( str_repeat( 'ab', 16 ) . '.vcf', UploadPolicy::hashed_filename( str_repeat( 'ab', 32 ), 'text/vcard' ) );
	}

	public function test_quota_default_and_filter(): void {
		$this->assertSame( 104857600, UploadPolicy::user_quota_bytes( 1 ) );
		$this->assertFalse( UploadPolicy::exceeds_quota( 1, 104857600 - 10, 10 ) );
		$this->assertTrue( UploadPolicy::exceeds_quota( 1, 104857600 - 10, 11 ) );

		Functions\when( 'apply_filters' )->alias(
			static function ( string $hook, $value ) {
				return 'imgsig/storage/user_quota_bytes' === $hook ? 0 : $value;
			}
		);
		$this->assertFalse( UploadPolicy::exceeds_quota( 1, PHP_INT_MAX - 1, 1 ), '0 = unlimited.' );
	}

	public function test_hash_normalisation(): void {
		$this->assertSame( str_repeat( 'a', 64 ), UploadPolicy::normalise_hash( str_repeat( 'A', 64 ) ) );
		$this->assertSame( '', UploadPolicy::normalise_hash( 'not-a-hash' ) );
	}

	public function test_jpeg_metadata_strip_drops_exif_iptc_and_comments_only(): void {
		$segment = static function ( int $marker, string $payload ): string {
			return "\xFF" . chr( $marker ) . pack( 'n', strlen( $payload ) + 2 ) . $payload;
		};

		$jfif  = $segment( 0xE0, "JFIF\0\x01\x01\0\0\x01\0\x01\0\0" );
		$exif  = $segment( 0xE1, "Exif\0\0GPS-LAT-48.8584" );
		$icc   = $segment( 0xE2, "ICC_PROFILE\0profile" );
		$iptc  = $segment( 0xED, 'Photoshop 3.0 IPTC' );
		$com   = $segment( 0xFE, 'secret comment' );
		$dqt   = $segment( 0xDB, str_repeat( "\x01", 65 ) );
		$scan  = $segment( 0xDA, "\x01\x01\x00\x00\x3F\x00" ) . "\x12\x34\xFF\x00\x56";
		$input = "\xFF\xD8" . $jfif . $exif . $icc . $iptc . $com . $dqt . $scan . "\xFF\xD9";

		$output = ImageProcessor::strip_jpeg_metadata_bytes( $input );

		$this->assertSame( "\xFF\xD8" . $jfif . $icc . $dqt . $scan . "\xFF\xD9", $output );
		$this->assertStringNotContainsString( 'GPS', (string) $output );
		$this->assertNull( ImageProcessor::strip_jpeg_metadata_bytes( 'GIF89a' ) );
	}
}
