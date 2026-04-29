<?php
/**
 * Unit tests for the SigV4 signer.
 *
 * @package ImaginaSignatures\Tests\Unit\Storage\S3
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Storage\S3;

use ImaginaSignatures\Exceptions\StorageException;
use ImaginaSignatures\Storage\S3\SigV4Signer;
use PHPUnit\Framework\TestCase;

/**
 * Tests use the public test vectors from the AWS Signature Version 4
 * documentation so a regression in the canonicalisation, key derivation,
 * or signing logic shows up as a bit-for-bit signature mismatch.
 *
 * Reference vectors:
 *  - GET object with Range header
 *    (AWS S3 SigV4 example).
 *  - GET presigned URL (X-Amz-Algorithm query auth example).
 *
 * @covers \ImaginaSignatures\Storage\S3\SigV4Signer
 */
final class SigV4SignerTest extends TestCase {

	/**
	 * AWS public example access key id.
	 */
	private const TEST_ACCESS_KEY = 'AKIAIOSFODNN7EXAMPLE';

	/**
	 * AWS public example secret key.
	 */
	private const TEST_SECRET_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

	/**
	 * Region used in AWS examples.
	 */
	private const TEST_REGION = 'us-east-1';

	/**
	 * `2013-05-24 00:00:00 UTC` — the timestamp baked into AWS's published
	 * test vectors.
	 */
	private const TEST_TIMESTAMP = 1369353600;

	/**
	 * SigV4-signed GET with a Range header should reproduce AWS's
	 * documented signature exactly.
	 */
	public function test_signs_get_request_with_aws_published_vector(): void {
		$signer = new SigV4Signer(
			self::TEST_ACCESS_KEY,
			self::TEST_SECRET_KEY,
			self::TEST_REGION
		);

		$headers = $signer->sign_request(
			'GET',
			'https://examplebucket.s3.amazonaws.com/test.txt',
			[ 'range' => 'bytes=0-9' ],
			'',
			self::TEST_TIMESTAMP
		);

		$this->assertArrayHasKey( 'authorization', $headers );

		$expected_signature = 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41';
		$expected_credential = 'Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request';
		$expected_signed     = 'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date';

		$this->assertStringContainsString( 'AWS4-HMAC-SHA256', $headers['authorization'] );
		$this->assertStringContainsString( $expected_credential, $headers['authorization'] );
		$this->assertStringContainsString( $expected_signed, $headers['authorization'] );
		$this->assertStringContainsString( 'Signature=' . $expected_signature, $headers['authorization'] );
	}

	/**
	 * Required headers (host, x-amz-date, x-amz-content-sha256) must be
	 * present in the returned header map even if the caller didn't pass
	 * them in.
	 */
	public function test_sign_request_injects_required_headers(): void {
		$signer = new SigV4Signer( 'AKID', 'SECRET', 'us-east-1' );

		$headers = $signer->sign_request(
			'GET',
			'https://example.com/path',
			[],
			'',
			self::TEST_TIMESTAMP
		);

		$this->assertArrayHasKey( 'host', $headers );
		$this->assertSame( 'example.com', $headers['host'] );

		$this->assertArrayHasKey( 'x-amz-date', $headers );
		$this->assertSame( '20130524T000000Z', $headers['x-amz-date'] );

		$this->assertArrayHasKey( 'x-amz-content-sha256', $headers );
		$this->assertSame(
			'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
			$headers['x-amz-content-sha256']
		);

		$this->assertArrayHasKey( 'authorization', $headers );
	}

	/**
	 * Non-empty payloads must hash into x-amz-content-sha256.
	 */
	public function test_sign_request_hashes_non_empty_payload(): void {
		$signer = new SigV4Signer( 'AKID', 'SECRET', 'us-east-1' );

		$payload = 'hello world';
		$headers = $signer->sign_request(
			'PUT',
			'https://example.com/x',
			[ 'content-type' => 'text/plain' ],
			$payload,
			self::TEST_TIMESTAMP
		);

		$this->assertSame(
			hash( 'sha256', $payload ),
			$headers['x-amz-content-sha256']
		);
	}

	/**
	 * Different bodies must produce different signatures (sanity check
	 * that the body hash actually participates in signing).
	 */
	public function test_different_bodies_produce_different_signatures(): void {
		$signer = new SigV4Signer( 'AKID', 'SECRET', 'us-east-1' );

		$a = $signer->sign_request( 'PUT', 'https://example.com/x', [], 'A', self::TEST_TIMESTAMP );
		$b = $signer->sign_request( 'PUT', 'https://example.com/x', [], 'B', self::TEST_TIMESTAMP );

		$this->assertNotSame( $a['authorization'], $b['authorization'] );
	}

	/**
	 * Presigned URL generation should reproduce AWS's documented
	 * signature for the canonical example.
	 */
	public function test_presigns_get_request_with_aws_published_vector(): void {
		$signer = new SigV4Signer(
			self::TEST_ACCESS_KEY,
			self::TEST_SECRET_KEY,
			self::TEST_REGION
		);

		$url = $signer->presign_url(
			'GET',
			'https://examplebucket.s3.amazonaws.com/test.txt',
			86400,
			[],
			self::TEST_TIMESTAMP
		);

		$this->assertStringContainsString( 'X-Amz-Algorithm=AWS4-HMAC-SHA256', $url );
		$this->assertStringContainsString(
			'X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request',
			$url
		);
		$this->assertStringContainsString( 'X-Amz-Date=20130524T000000Z', $url );
		$this->assertStringContainsString( 'X-Amz-Expires=86400', $url );
		$this->assertStringContainsString( 'X-Amz-SignedHeaders=host', $url );

		$expected_signature = 'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404';
		$this->assertStringContainsString( 'X-Amz-Signature=' . $expected_signature, $url );
	}

	/**
	 * The presigned URL preserves the host, scheme, and path of the
	 * input URL — query parameters are appended, not replaced.
	 */
	public function test_presigned_url_preserves_scheme_host_path(): void {
		$signer = new SigV4Signer( 'AKID', 'SECRET', 'us-east-1' );

		$url = $signer->presign_url(
			'PUT',
			'https://my-bucket.s3.example.com/path/to/object.png',
			300,
			[],
			self::TEST_TIMESTAMP
		);

		$this->assertStringStartsWith( 'https://my-bucket.s3.example.com/path/to/object.png?', $url );
	}

	/**
	 * Special characters in the URL path must be percent-encoded once
	 * (S3 rule), with `/` preserved as the separator.
	 */
	public function test_path_segments_are_url_encoded_once(): void {
		$signer = new SigV4Signer( 'AKID', 'SECRET', 'us-east-1' );

		$url = $signer->presign_url(
			'PUT',
			'https://example.com/folder/with spaces/file (1).png',
			300,
			[],
			self::TEST_TIMESTAMP
		);

		// Spaces and parens must be percent-encoded; slashes preserved.
		$this->assertStringContainsString(
			'/folder/with%20spaces/file%20%281%29.png',
			$url
		);
	}

	/**
	 * Same inputs at the same timestamp must produce the same URL —
	 * signing must be a pure function of (key, secret, region, time, request).
	 */
	public function test_presign_url_is_deterministic_for_fixed_timestamp(): void {
		$signer = new SigV4Signer( 'AKID', 'SECRET', 'us-east-1' );

		$first = $signer->presign_url(
			'PUT',
			'https://example.com/k',
			300,
			[],
			self::TEST_TIMESTAMP
		);
		$second = $signer->presign_url(
			'PUT',
			'https://example.com/k',
			300,
			[],
			self::TEST_TIMESTAMP
		);

		$this->assertSame( $first, $second );
	}

	/**
	 * Different timestamps must produce different signatures.
	 */
	public function test_presign_url_changes_with_timestamp(): void {
		$signer = new SigV4Signer( 'AKID', 'SECRET', 'us-east-1' );

		$a = $signer->presign_url( 'PUT', 'https://example.com/k', 300, [], self::TEST_TIMESTAMP );
		$b = $signer->presign_url( 'PUT', 'https://example.com/k', 300, [], self::TEST_TIMESTAMP + 1 );

		$this->assertNotSame( $a, $b );
	}

	/**
	 * Different regions must produce different signing keys, hence
	 * different signatures.
	 */
	public function test_signature_depends_on_region(): void {
		$a_signer = new SigV4Signer( 'AKID', 'SECRET', 'us-east-1' );
		$b_signer = new SigV4Signer( 'AKID', 'SECRET', 'eu-west-2' );

		$a = $a_signer->presign_url( 'PUT', 'https://example.com/k', 300, [], self::TEST_TIMESTAMP );
		$b = $b_signer->presign_url( 'PUT', 'https://example.com/k', 300, [], self::TEST_TIMESTAMP );

		$this->assertNotSame( $a, $b );
	}

	/**
	 * Header case-folding must not matter — `Range` and `range` must
	 * produce the same canonical headers and hence the same signature.
	 */
	public function test_header_case_does_not_affect_signature(): void {
		$signer = new SigV4Signer( 'AKID', 'SECRET', 'us-east-1' );

		$lower = $signer->sign_request(
			'GET',
			'https://example.com/x',
			[ 'range' => 'bytes=0-9' ],
			'',
			self::TEST_TIMESTAMP
		);

		$upper = $signer->sign_request(
			'GET',
			'https://example.com/x',
			[ 'Range' => 'bytes=0-9' ],
			'',
			self::TEST_TIMESTAMP
		);

		$this->assertSame( $lower['authorization'], $upper['authorization'] );
	}

	/**
	 * Header value whitespace must be collapsed during canonicalisation.
	 */
	public function test_header_whitespace_is_collapsed(): void {
		$signer = new SigV4Signer( 'AKID', 'SECRET', 'us-east-1' );

		$single = $signer->sign_request(
			'GET',
			'https://example.com/x',
			[ 'x-custom' => 'foo bar' ],
			'',
			self::TEST_TIMESTAMP
		);

		$multi = $signer->sign_request(
			'GET',
			'https://example.com/x',
			[ 'x-custom' => "foo   bar" ],
			'',
			self::TEST_TIMESTAMP
		);

		$this->assertSame( $single['authorization'], $multi['authorization'] );
	}

	/**
	 * Reordering identical query params must not change the canonical
	 * query string and therefore the signature.
	 */
	public function test_query_param_order_is_canonicalised(): void {
		$signer = new SigV4Signer( 'AKID', 'SECRET', 'us-east-1' );

		$a = $signer->sign_request(
			'GET',
			'https://example.com/x?b=2&a=1',
			[],
			'',
			self::TEST_TIMESTAMP
		);

		$b = $signer->sign_request(
			'GET',
			'https://example.com/x?a=1&b=2',
			[],
			'',
			self::TEST_TIMESTAMP
		);

		$this->assertSame( $a['authorization'], $b['authorization'] );
	}

	/**
	 * Bad URLs must surface as a typed StorageException, not a silent
	 * empty signature. A relative URL with no host triggers the check
	 * deterministically across PHP versions.
	 */
	public function test_invalid_url_throws_storage_exception(): void {
		$signer = new SigV4Signer( 'AKID', 'SECRET', 'us-east-1' );

		$this->expectException( StorageException::class );
		$signer->sign_request( 'GET', '/relative-no-host', [], '', self::TEST_TIMESTAMP );
	}
}
