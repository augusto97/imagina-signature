<?php
/**
 * Atomic fixed-window rate-limit counter store.
 *
 * @package ImaginaSignatures\Security
 */

declare(strict_types=1);

namespace ImaginaSignatures\Security;

defined( 'ABSPATH' ) || exit;

/**
 * Per-bucket hit counters for {@see \ImaginaSignatures\Api\Middleware\RateLimiter}.
 *
 * Fixed windows: a bucket's window starts at
 * `floor( now / window ) * window`, so the counter resets on a fixed
 * boundary regardless of how often the caller retries (the previous
 * transient implementation slid the TTL forward on every hit, so a
 * client polling just under the limit was never released — and its
 * read-then-write let parallel requests all observe the same count).
 *
 * Increments are atomic:
 *
 *  - With a persistent object cache (Redis, Memcached…) the counter
 *    lives at `"{key}:{window_start}"` and is bumped with
 *    `wp_cache_add()` + `wp_cache_incr()`, both atomic in those
 *    backends.
 *  - Otherwise one `INSERT … ON DUPLICATE KEY UPDATE` against
 *    `{prefix}imgsig_rate_limits` increments the row (resetting it when
 *    the stored `window_start` is older) and returns the post-increment
 *    value through `LAST_INSERT_ID(expr)` — no read-modify-write.
 *  - If the table is missing (migration not applied yet) the store
 *    degrades to a best-effort transient counter rather than failing
 *    open or erroring.
 *
 * Old rows are purged by {@see purge_expired()} on the daily cron.
 *
 * Not `final` so PHPUnit can double it; the public surface is the contract.
 *
 * @since 1.0.0
 */
class RateLimitStore {

	/**
	 * Key prefix for every bucket (also the transient-fallback prefix
	 * removed by the uninstaller's transient sweep).
	 */
	private const KEY_PREFIX = 'imgsig_rl_';

	/**
	 * Object-cache group.
	 */
	private const CACHE_GROUP = 'imgsig_rl';

	/**
	 * Table name without the WP prefix.
	 */
	public const TABLE = 'imgsig_rate_limits';

	/**
	 * DB handle (resolved lazily from the `$wpdb` global when null).
	 *
	 * @var \wpdb|null
	 */
	private $wpdb;

	/**
	 * Clock override for tests.
	 *
	 * @var callable|null
	 */
	private $clock;

	/**
	 * @param \wpdb|null    $wpdb  DB handle; defaults to the `$wpdb` global.
	 * @param callable|null $clock `function (): int` returning "now"; defaults to `time()`.
	 */
	public function __construct( $wpdb = null, ?callable $clock = null ) {
		$this->wpdb  = $wpdb;
		$this->clock = $clock;
	}

	/**
	 * Builds the canonical bucket key for an action / user pair.
	 *
	 * @since 1.0.0
	 *
	 * @param string $action  Logical action name (`upload`, `signatures_create`, ...).
	 * @param int    $user_id Owner of the rate window.
	 *
	 * @return string
	 */
	public function key( string $action, int $user_id ): string {
		// Action names go through sanitize_key so caller mistakes can't
		// poison the key column with arbitrary characters.
		return self::KEY_PREFIX . sanitize_key( $action ) . '_' . $user_id;
	}

	/**
	 * Builds the bucket key for a site-wide (all users) limit.
	 *
	 * @since 1.0.40
	 *
	 * @param string $action Logical action name.
	 *
	 * @return string
	 */
	public function site_key( string $action ): string {
		return self::KEY_PREFIX . sanitize_key( $action ) . '_site';
	}

	/**
	 * Records one hit and returns the bucket state after it.
	 *
	 * @since 1.0.40
	 *
	 * @param string $key            Bucket key ({@see key()} / {@see site_key()}).
	 * @param int    $window_seconds Window length in seconds.
	 *
	 * @return array{hits: int, reset_at: int, retry_after: int} `hits` includes this one.
	 */
	public function hit( string $key, int $window_seconds ): array {
		$window_seconds = max( 1, $window_seconds );
		$now            = $this->now();
		$window_start   = (int) ( floor( $now / $window_seconds ) * $window_seconds );
		$reset_at       = $window_start + $window_seconds;

		$hits = null;

		if ( function_exists( 'wp_using_ext_object_cache' ) && wp_using_ext_object_cache() ) {
			$hits = $this->hit_object_cache( $key, $window_start, $window_seconds );
		}

		if ( null === $hits ) {
			$hits = $this->hit_database( $key, $window_start );
		}

		if ( null === $hits ) {
			$hits = $this->hit_transient( $key, $window_start, $window_seconds );
		}

		return [
			'hits'        => $hits,
			'reset_at'    => $reset_at,
			'retry_after' => max( 1, $reset_at - $now ),
		];
	}

	/**
	 * Returns the current count for a key without recording a hit.
	 *
	 * @since 1.0.0
	 *
	 * @param string $key            Bucket key.
	 * @param int    $window_seconds Window length in seconds.
	 *
	 * @return int
	 */
	public function get( string $key, int $window_seconds = HOUR_IN_SECONDS ): int {
		$window_seconds = max( 1, $window_seconds );
		$window_start   = (int) ( floor( $this->now() / $window_seconds ) * $window_seconds );

		if ( function_exists( 'wp_using_ext_object_cache' ) && wp_using_ext_object_cache() ) {
			$value = wp_cache_get( $key . ':' . $window_start, self::CACHE_GROUP );
			if ( false !== $value ) {
				return (int) $value;
			}
		}

		$db = $this->db();
		if ( null !== $db && $this->table_ready() ) {
			$hits = $db->get_var(
				$db->prepare(
					"SELECT hits FROM {$this->table()} WHERE rl_key = %s AND window_start = %d", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
					$key,
					$window_start
				)
			);
			if ( null !== $hits ) {
				return (int) $hits;
			}
		}

		$transient = get_transient( $key );
		return is_array( $transient ) && (int) ( $transient['w'] ?? -1 ) === $window_start ? (int) $transient['h'] : 0;
	}

	/**
	 * Removes the counter for a key.
	 *
	 * @since 1.0.0
	 *
	 * @param string $key Bucket key.
	 *
	 * @return void
	 */
	public function reset( string $key ): void {
		delete_transient( $key );

		$db = $this->db();
		if ( null !== $db && $this->table_ready() ) {
			$db->delete( $this->table(), [ 'rl_key' => $key ], [ '%s' ] );
		}
	}

	/**
	 * Deletes DB buckets whose window started before `$before`.
	 *
	 * @since 1.0.40
	 *
	 * @param int $before Unix timestamp.
	 *
	 * @return int Rows deleted.
	 */
	public function purge_expired( int $before ): int {
		$db = $this->db();
		if ( null === $db || ! $this->table_ready() ) {
			return 0;
		}

		$deleted = $db->query(
			$db->prepare(
				"DELETE FROM {$this->table()} WHERE window_start < %d", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$before
			)
		);

		return is_int( $deleted ) ? $deleted : 0;
	}

	/**
	 * Fully-qualified table name.
	 *
	 * @since 1.0.40
	 *
	 * @return string
	 */
	public function table(): string {
		$db = $this->db();
		return ( null !== $db ? (string) $db->prefix : '' ) . self::TABLE;
	}

	/**
	 * Object-cache path.
	 *
	 * @param string $key            Bucket key.
	 * @param int    $window_start   Window start timestamp.
	 * @param int    $window_seconds Window length.
	 *
	 * @return int|null Null when the backend refused the increment.
	 */
	private function hit_object_cache( string $key, int $window_start, int $window_seconds ): ?int {
		$cache_key = $key . ':' . $window_start;

		// Atomic "create if missing" — a no-op when another request won.
		wp_cache_add( $cache_key, 0, self::CACHE_GROUP, $window_seconds + MINUTE_IN_SECONDS );
		$hits = wp_cache_incr( $cache_key, 1, self::CACHE_GROUP );

		return false === $hits ? null : (int) $hits;
	}

	/**
	 * Database path: one atomic upsert.
	 *
	 * @param string $key          Bucket key.
	 * @param int    $window_start Window start timestamp.
	 *
	 * @return int|null Null when the table is unusable.
	 */
	private function hit_database( string $key, int $window_start ): ?int {
		$db = $this->db();
		if ( null === $db || ! $this->table_ready() ) {
			return null;
		}

		$table = $this->table();

		// Never let a DB error print into a REST/JSON response.
		$suppressed = $db->suppress_errors( true );

		// `hits` is assigned before `window_start`, so the IF() compares
		// against the stored (old) window. LAST_INSERT_ID(expr) hands
		// the post-increment value back through $wpdb->insert_id without
		// a second read — a fresh INSERT leaves it at 0.
		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
		$result = $db->query(
			$db->prepare(
				"INSERT INTO {$table} (rl_key, window_start, hits) VALUES (%s, %d, 1)
				ON DUPLICATE KEY UPDATE
					hits = LAST_INSERT_ID( IF( window_start = VALUES(window_start), hits + 1, 1 ) ),
					window_start = VALUES(window_start)",
				$key,
				$window_start
			)
		);
		// phpcs:enable

		if ( false === $result ) {
			$db->suppress_errors( $suppressed );
			return null;
		}

		$hits = (int) $db->insert_id;
		if ( $hits > 0 ) {
			$db->suppress_errors( $suppressed );
			return $hits;
		}

		// Fresh row (or a DB layer that doesn't surface LAST_INSERT_ID):
		// read it back. The increment itself was atomic, so this can only
		// over-count under concurrency, never under-count.
		$stored = $db->get_var(
			$db->prepare(
				"SELECT hits FROM {$table} WHERE rl_key = %s", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$key
			)
		);
		$db->suppress_errors( $suppressed );

		return null === $stored ? 1 : max( 1, (int) $stored );
	}

	/**
	 * True once the 1.2.0 migration (which creates the table) has run.
	 * Reads the autoloaded schema-version option — no query.
	 *
	 * @return bool
	 */
	private function table_ready(): bool {
		return version_compare( (string) get_option( 'imgsig_schema_version', '0.0.0' ), '1.2.0', '>=' );
	}

	/**
	 * Best-effort fallback when neither an object cache nor the table
	 * is available (e.g. the 1.2.0 migration hasn't run yet).
	 *
	 * @param string $key            Bucket key.
	 * @param int    $window_start   Window start timestamp.
	 * @param int    $window_seconds Window length.
	 *
	 * @return int
	 */
	private function hit_transient( string $key, int $window_start, int $window_seconds ): int {
		$state = get_transient( $key );
		$hits  = is_array( $state ) && (int) ( $state['w'] ?? -1 ) === $window_start ? (int) $state['h'] + 1 : 1;

		set_transient(
			$key,
			[
				'w' => $window_start,
				'h' => $hits,
			],
			max( 1, $window_start + $window_seconds - $this->now() )
		);

		return $hits;
	}

	/**
	 * Resolves the DB handle.
	 *
	 * @return \wpdb|null
	 */
	private function db() {
		if ( null !== $this->wpdb ) {
			return $this->wpdb;
		}
		return isset( $GLOBALS['wpdb'] ) && is_object( $GLOBALS['wpdb'] ) ? $GLOBALS['wpdb'] : null;
	}

	/**
	 * Current Unix time.
	 *
	 * @return int
	 */
	private function now(): int {
		return null !== $this->clock ? (int) ( $this->clock )() : time();
	}
}
