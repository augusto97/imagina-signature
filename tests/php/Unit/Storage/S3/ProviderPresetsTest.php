<?php
/**
 * Unit tests for the S3 provider preset map.
 *
 * @package ImaginaSignatures\Tests\Unit\Storage\S3
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Storage\S3;

use ImaginaSignatures\Storage\S3\ProviderPresets;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Storage\S3\ProviderPresets
 */
final class ProviderPresetsTest extends TestCase {

	public function test_exists_returns_true_for_known_presets(): void {
		foreach ( [ 'cloudflare_r2', 'bunny', 's3', 'b2', 'do_spaces', 'wasabi', 'custom' ] as $id ) {
			$this->assertTrue( ProviderPresets::exists( $id ), "$id should be a known preset" );
		}
	}

	public function test_exists_returns_false_for_unknown(): void {
		$this->assertFalse( ProviderPresets::exists( 'not-a-preset' ) );
	}

	public function test_get_returns_null_for_unknown(): void {
		$this->assertNull( ProviderPresets::get( 'not-a-preset' ) );
	}

	public function test_resolve_endpoint_substitutes_region_for_amazon_s3(): void {
		$endpoint = ProviderPresets::resolve_endpoint( 's3', 'us-east-1' );
		$this->assertSame( 'https://s3.us-east-1.amazonaws.com', $endpoint );
	}

	public function test_resolve_endpoint_substitutes_account_id_for_r2(): void {
		$endpoint = ProviderPresets::resolve_endpoint(
			'cloudflare_r2',
			'auto',
			[ 'account_id' => 'abc123' ]
		);
		$this->assertSame( 'https://abc123.r2.cloudflarestorage.com', $endpoint );
	}

	public function test_resolve_endpoint_returns_custom_endpoint_verbatim(): void {
		$endpoint = ProviderPresets::resolve_endpoint(
			'custom',
			'',
			[ 'custom_endpoint' => 'https://my-storage.example.com' ]
		);
		$this->assertSame( 'https://my-storage.example.com', $endpoint );
	}

	public function test_resolve_endpoint_returns_empty_for_unknown_preset(): void {
		$this->assertSame( '', ProviderPresets::resolve_endpoint( 'not-a-preset', 'us-east-1' ) );
	}

	public function test_fixed_region_returns_auto_for_r2(): void {
		$this->assertSame( 'auto', ProviderPresets::fixed_region( 'cloudflare_r2' ) );
	}

	public function test_fixed_region_returns_null_for_user_region_providers(): void {
		$this->assertNull( ProviderPresets::fixed_region( 's3' ) );
		$this->assertNull( ProviderPresets::fixed_region( 'wasabi' ) );
	}
}
