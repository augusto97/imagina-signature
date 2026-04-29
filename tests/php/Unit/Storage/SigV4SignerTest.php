<?php
/**
 * Smoke tests for the SigV4 signer.
 *
 * @package ImaginaSignatures\Tests\Unit\Storage
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Storage;

use ImaginaSignatures\Storage\S3\SigV4Signer;
use PHPUnit\Framework\TestCase;

final class SigV4SignerTest extends TestCase {

	public function test_presigned_url_is_deterministic_for_fixed_clock(): void {
		$signer = new SigV4Signer( 'AKIAIOSFODNN7EXAMPLE', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', 'us-east-1' );
		$now    = 1714000000;

		$url_a = $signer->presign( 'PUT', 'examplebucket.s3.amazonaws.com', '/path/to/key.txt', 600, [], $now );
		$url_b = $signer->presign( 'PUT', 'examplebucket.s3.amazonaws.com', '/path/to/key.txt', 600, [], $now );

		$this->assertSame( $url_a, $url_b );
		$this->assertStringContainsString( 'X-Amz-Algorithm=AWS4-HMAC-SHA256', $url_a );
		$this->assertStringContainsString( 'X-Amz-Credential=AKIAIOSFODNN7EXAMPLE', $url_a );
		$this->assertStringContainsString( 'X-Amz-Signature=', $url_a );
	}

	public function test_signed_request_includes_required_headers(): void {
		$signer = new SigV4Signer( 'AKIA', 'secret', 'us-east-1' );
		$headers = $signer->sign_request( 'PUT', 'host.example', '/k', 'payload', [ 'content-type' => 'image/png' ] );

		$this->assertArrayHasKey( 'Authorization', $headers );
		$this->assertArrayHasKey( 'x-amz-content-sha256', $headers );
		$this->assertArrayHasKey( 'x-amz-date', $headers );
		$this->assertSame( 'image/png', $headers['content-type'] );
	}
}
