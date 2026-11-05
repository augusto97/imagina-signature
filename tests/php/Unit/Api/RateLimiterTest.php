<?php
/**
 * Unit tests for the fixed-window, atomic rate limiter.
 *
 * @package ImaginaSignatures\Tests\Unit\Api
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Api;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Api\RestRouter;
use ImaginaSignatures\Exceptions\RateLimitException;
use ImaginaSignatures\Security\RateLimitStore;
use Imgsig_Fake_Wpdb;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Api\Middleware\RateLimiter
 * @covers \ImaginaSignatures\Security\RateLimitStore
 */
final class RateLimiterTest extends TestCase {

	private Imgsig_Fake_Wpdb $db;

	private int $now = 1700000000;

	/** @var array<string, mixed> */
	private array $transients = [];

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		$this->db         = new Imgsig_Fake_Wpdb();
		$this->transients = [];

		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'sanitize_key' )->alias(
			static function ( $key ): string {
				return (string) preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $key ) );
			}
		);
		Functions\when( 'wp_using_ext_object_cache' )->justReturn( false );
		Functions\when( 'get_option' )->alias(
			static function ( $name, $default = false ) {
				return 'imgsig_schema_version' === $name ? '1.2.0' : $default;
			}
		);
		Functions\when( 'get_transient' )->alias(
			function ( $key ) {
				return $this->transients[ $key ] ?? false;
			}
		);
		Functions\when( 'set_transient' )->alias(
			function ( $key, $value ): bool {
				$this->transients[ $key ] = $value;
				return true;
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	private function limiter(): RateLimiter {
		return new RateLimiter(
			new RateLimitStore(
				$this->db,
				function (): int {
					return $this->now;
				}
			)
		);
	}

	public function test_allows_max_hits_then_throws_with_retry_after_until_window_end(): void {
		$limiter = $this->limiter();
		$this->now = 1700000000 + 600; // Somewhere mid-window.

		for ( $i = 1; $i <= 3; $i++ ) {
			$limiter->check( 'upload', 42, 3, HOUR_IN_SECONDS );
		}

		try {
			$limiter->check( 'upload', 42, 3, HOUR_IN_SECONDS );
			$this->fail( 'Expected RateLimitException.' );
		} catch ( RateLimitException $e ) {
			$window_end = (int) ( floor( $this->now / HOUR_IN_SECONDS ) * HOUR_IN_SECONDS ) + HOUR_IN_SECONDS;
			$this->assertSame( $window_end - $this->now, $e->get_retry_after_seconds() );
			$this->assertStringContainsString( (string) ( $window_end - $this->now ), $e->getMessage() );
		}
	}

	public function test_uses_single_atomic_upsert_per_hit(): void {
		$this->limiter()->check( 'signatures_update', 7, 240, HOUR_IN_SECONDS );
		$this->limiter()->check( 'signatures_update', 7, 240, HOUR_IN_SECONDS );

		$upserts = array_values(
			array_filter(
				$this->db->queries,
				static function ( string $q ): bool {
					return false !== stripos( $q, 'INSERT INTO' );
				}
			)
		);

		$this->assertCount( 2, $upserts );
		$this->assertStringContainsString( 'wp_imgsig_rate_limits', $upserts[0] );
		$this->assertStringContainsString( 'ON DUPLICATE KEY UPDATE', $upserts[0] );
		$this->assertStringContainsString( 'LAST_INSERT_ID', $upserts[0] );
		$this->assertSame( 2, $this->db->rows['imgsig_rl_signatures_update_7']['h'] );
	}

	public function test_fixed_window_resets_and_retrying_does_not_extend_it(): void {
		$limiter = $this->limiter();
		$start   = (int) ( floor( $this->now / 60 ) * 60 );

		$this->now = $start + 1;
		$limiter->check( 'upload', 1, 2, 60 );
		$limiter->check( 'upload', 1, 2, 60 );

		// Hammering inside the window keeps failing…
		for ( $i = 0; $i < 5; $i++ ) {
			$this->now = $start + 10 + $i * 10;
			try {
				$limiter->check( 'upload', 1, 2, 60 );
				$this->fail( 'Expected RateLimitException.' );
			} catch ( RateLimitException $e ) {
				$this->assertSame( $start + 60 - $this->now, $e->get_retry_after_seconds() );
			}
		}

		// …but the window still ends on its fixed boundary.
		$this->now = $start + 60;
		$limiter->check( 'upload', 1, 2, 60 );
		$this->assertSame( 1, $this->db->rows['imgsig_rl_upload_1']['h'] );
	}

	public function test_buckets_are_per_user_and_site_wide_is_separate(): void {
		$limiter = $this->limiter();

		$limiter->check( 'signatures_test_send', 1, 1, HOUR_IN_SECONDS );
		$limiter->check( 'signatures_test_send', 2, 1, HOUR_IN_SECONDS );
		$limiter->check_site( 'signatures_test_send', 2, HOUR_IN_SECONDS );
		$limiter->check_site( 'signatures_test_send', 2, HOUR_IN_SECONDS );

		$this->expectException( RateLimitException::class );
		$limiter->check_site( 'signatures_test_send', 2, HOUR_IN_SECONDS );
	}

	public function test_falls_back_to_select_when_insert_id_is_unavailable(): void {
		$this->db->no_last_insert_id = true;
		$limiter                     = $this->limiter();

		$limiter->check( 'x', 1, 2, HOUR_IN_SECONDS );
		$limiter->check( 'x', 1, 2, HOUR_IN_SECONDS );

		$this->expectException( RateLimitException::class );
		$limiter->check( 'x', 1, 2, HOUR_IN_SECONDS );
	}

	public function test_degrades_to_transients_when_the_table_is_unusable(): void {
		$this->db->fail = true;
		$limiter        = $this->limiter();

		$limiter->check( 'x', 1, 1, HOUR_IN_SECONDS );
		$this->assertSame( 1, $this->transients['imgsig_rl_x_1']['h'] );

		$this->expectException( RateLimitException::class );
		$limiter->check( 'x', 1, 1, HOUR_IN_SECONDS );
	}

	public function test_uses_atomic_object_cache_increment_when_available(): void {
		$cache = [];
		Functions\when( 'wp_using_ext_object_cache' )->justReturn( true );
		Functions\when( 'wp_cache_add' )->alias(
			static function ( $key, $value ) use ( &$cache ): bool {
				if ( isset( $cache[ $key ] ) ) {
					return false;
				}
				$cache[ $key ] = $value;
				return true;
			}
		);
		Functions\when( 'wp_cache_incr' )->alias(
			static function ( $key, $offset = 1 ) use ( &$cache ) {
				$cache[ $key ] = ( $cache[ $key ] ?? 0 ) + $offset;
				return $cache[ $key ];
			}
		);

		$limiter = $this->limiter();
		$limiter->check( 'x', 9, 1, HOUR_IN_SECONDS );

		$this->assertSame( [], $this->db->queries, 'Object cache path must not touch the DB.' );
		$this->expectException( RateLimitException::class );
		$limiter->check( 'x', 9, 1, HOUR_IN_SECONDS );
	}

	public function test_filter_can_disable_a_limit(): void {
		Functions\when( 'apply_filters' )->alias(
			static function ( string $hook, $value ) {
				return 'imgsig/rate_limit/max' === $hook ? 0 : $value;
			}
		);

		$limiter = $this->limiter();
		for ( $i = 0; $i < 5; $i++ ) {
			$limiter->check( 'x', 1, 1, HOUR_IN_SECONDS );
		}
		$this->assertSame( [], $this->db->queries );
	}

	public function test_purge_deletes_old_windows_only(): void {
		$this->db->rows = [
			'old' => [
				'w' => 100,
				'h' => 3,
			],
			'new' => [
				'w' => 5000,
				'h' => 1,
			],
		];

		$store = new RateLimitStore( $this->db );
		$this->assertSame( 1, $store->purge_expired( 1000 ) );
		$this->assertArrayHasKey( 'new', $this->db->rows );
		$this->assertArrayNotHasKey( 'old', $this->db->rows );
	}

	public function test_rest_router_stamps_retry_after_on_rate_limited_responses(): void {
		$response = new \WP_REST_Response(
			[
				'code'    => 'imgsig_rate_limited',
				'message' => 'Too many requests.',
				'data'    => [
					'status'      => 429,
					'retry_after' => 37,
				],
			],
			429
		);

		$out = RestRouter::add_retry_after_header( $response );
		$this->assertSame( '37', $out->headers['Retry-After'] );

		$ok = new \WP_REST_Response( [ 'ok' => true ], 200 );
		$this->assertArrayNotHasKey( 'Retry-After', RestRouter::add_retry_after_header( $ok )->headers );
	}
}
