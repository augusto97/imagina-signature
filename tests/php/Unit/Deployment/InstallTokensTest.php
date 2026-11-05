<?php
/**
 * Unit tests for the install-link tokens.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Deployment\Install\InstallTokens;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/DeploymentStubs.php';

/**
 * @covers \ImaginaSignatures\Deployment\Install\InstallTokens
 */
final class InstallTokensTest extends TestCase {

	use DeploymentStubs;

	/** @var array<int, array<string, mixed>> */
	private array $user_queries = [];

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_wordpress();
		$this->user_queries = [];

		// get_users( meta_key / meta_value ) over the in-memory meta. Like
		// MySQL's default collation, the comparison is case-insensitive.
		Functions\when( 'get_users' )->alias(
			function ( array $args ): array {
				$this->user_queries[] = $args;
				$out                  = [];
				foreach ( $this->meta as $id => $meta ) {
					if ( isset( $meta[ $args['meta_key'] ] ) && 0 === strcasecmp( (string) $meta[ $args['meta_key'] ], (string) $args['meta_value'] ) ) {
						$out[] = (string) $id;
					}
				}
				return $out;
			}
		);
		Functions\when( 'home_url' )->alias(
			static function ( $path = '' ): string {
				return 'https://example.com' . $path;
			}
		);
		Functions\when( 'esc_url_raw' )->returnArg( 1 );
		Functions\when( 'sanitize_key' )->returnArg( 1 );
		Functions\when( 'add_query_arg' )->alias(
			static function ( $key, $value, $url ): string {
				return $url . '?' . $key . '=' . $value;
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_generated_tokens_are_64_lowercase_hex_and_unique(): void {
		$seen = [];
		for ( $i = 0; $i < 20; $i++ ) {
			$token = InstallTokens::generate();
			$this->assertMatchesRegularExpression( '/^[a-f0-9]{64}$/', $token );
			$this->assertTrue( InstallTokens::is_well_formed( $token ) );
			$seen[ $token ] = true;
		}
		$this->assertCount( 20, $seen );
	}

	public function test_format_check_rejects_near_misses(): void {
		$valid = str_repeat( 'ab', 32 );
		$this->assertTrue( InstallTokens::is_well_formed( $valid ) );

		foreach ( [
			'',
			substr( $valid, 0, 63 ),
			$valid . 'a',
			strtoupper( $valid ),
			$valid . "\n",
			' ' . $valid,
			str_repeat( 'g', 64 ),
			substr( $valid, 0, 63 ) . '%',
		] as $bad ) {
			$this->assertFalse( InstallTokens::is_well_formed( $bad ), var_export( $bad, true ) );
		}
	}

	public function test_token_is_created_lazily_once_and_regenerate_replaces_it(): void {
		$this->assertSame( '', InstallTokens::get( 7 ) );

		$first = InstallTokens::ensure( 7 );
		$this->assertTrue( InstallTokens::is_well_formed( $first ) );
		$this->assertSame( $first, $this->meta[7][ InstallTokens::META_KEY ] );
		$this->assertSame( $first, InstallTokens::ensure( 7 ), 'ensure() must not rotate an existing token' );

		$second = InstallTokens::regenerate( 7 );
		$this->assertNotSame( $first, $second );
		$this->assertSame( $second, InstallTokens::get( 7 ) );
		$this->assertSame( 0, InstallTokens::resolve_user_id( $first ), 'the old link stops working' );
		$this->assertSame( 7, InstallTokens::resolve_user_id( $second ) );
	}

	public function test_corrupt_stored_value_is_treated_as_no_token(): void {
		$this->meta[3][ InstallTokens::META_KEY ] = 'not-a-token';
		$this->assertSame( '', InstallTokens::get( 3 ) );
		$this->assertTrue( InstallTokens::is_well_formed( InstallTokens::ensure( 3 ) ) );
	}

	public function test_malformed_tokens_never_reach_the_database(): void {
		$this->assertSame( 0, InstallTokens::resolve_user_id( 'abc' ) );
		$this->assertSame( 0, InstallTokens::resolve_user_id( str_repeat( 'a', 64 ) . "\n" ) );
		$this->assertSame( 0, InstallTokens::resolve_user_id( "' OR 1=1 -- " ) );
		$this->assertSame( [], $this->user_queries );
	}

	public function test_lookup_is_confirmed_with_a_constant_time_exact_compare(): void {
		$token                                    = str_repeat( 'c', 64 );
		$this->meta[5][ InstallTokens::META_KEY ] = strtoupper( $token ); // A collation-insensitive DB match…

		$this->assertSame( 0, InstallTokens::resolve_user_id( $token ), '…that is not byte-identical must be rejected' );
		$this->assertCount( 1, $this->user_queries );

		// The confirmation step is hash_equals(), not ==.
		$source = (string) file_get_contents( dirname( __DIR__, 4 ) . '/src/Deployment/Install/InstallTokens.php' );
		preg_match( '/function resolve_user_id\(.*?\n\t}\n/s', $source, $m );
		$this->assertStringContainsString( 'hash_equals( $stored, $token )', $m[0] ?? '' );
	}

	public function test_unknown_or_ambiguous_tokens_resolve_to_nobody(): void {
		$token = InstallTokens::generate();
		$this->assertSame( 0, InstallTokens::resolve_user_id( $token ) );

		$this->meta[1][ InstallTokens::META_KEY ] = $token;
		$this->meta[2][ InstallTokens::META_KEY ] = $token;
		$this->assertSame( 0, InstallTokens::resolve_user_id( $token ) );
	}

	public function test_url_uses_the_frontend_slug_or_a_query_var_without_pretty_permalinks(): void {
		$token = str_repeat( 'd', 64 );

		$this->options['permalink_structure']    = '/%postname%/';
		$this->options['imgsig_frontend_access'] = [ 'slug' => 'firmas' ];
		$this->assertSame( 'https://example.com/firmas/install/' . $token . '/', InstallTokens::url( $token ) );

		$this->options['permalink_structure'] = '';
		$this->assertSame( 'https://example.com/?imgsig_install=' . $token, InstallTokens::url( $token ) );
	}
}
