<?php
/**
 * Scheduled maintenance.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

use ImaginaSignatures\Security\RateLimitStore;

defined( 'ABSPATH' ) || exit;

/**
 * Owns the plugin's WP-Cron event(s).
 *
 * One daily event purges stale rate-limit buckets. Scheduled from
 * {@see Installer::install()} (activation + in-place upgrades),
 * cleared by {@see Deactivator}.
 *
 * @since 1.0.40
 */
final class Cron {

	/**
	 * Daily maintenance hook name.
	 */
	public const DAILY_HOOK = 'imgsig_daily_cleanup';

	/**
	 * Rate-limit rows older than this are purged (seconds). The longest
	 * window in use is one hour; a day keeps plenty of margin.
	 */
	private const RATE_LIMIT_RETENTION = DAY_IN_SECONDS;

	/**
	 * Registers the event handler. Called on every boot (cheap).
	 *
	 * @since 1.0.40
	 *
	 * @return void
	 */
	public static function boot(): void {
		add_action( self::DAILY_HOOK, [ self::class, 'run_daily' ] );
	}

	/**
	 * Schedules the daily event when it isn't scheduled yet.
	 *
	 * @since 1.0.40
	 *
	 * @return void
	 */
	public static function schedule(): void {
		if ( ! wp_next_scheduled( self::DAILY_HOOK ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', self::DAILY_HOOK );
		}
	}

	/**
	 * Removes every scheduled occurrence of the plugin's events.
	 *
	 * @since 1.0.40
	 *
	 * @return void
	 */
	public static function unschedule(): void {
		wp_clear_scheduled_hook( self::DAILY_HOOK );
		// Pending template propagation batches (1.3.0); a template saved
		// again after reactivation restarts its run.
		if ( function_exists( 'wp_unschedule_hook' ) ) {
			wp_unschedule_hook( \ImaginaSignatures\Services\TemplatePropagator::CRON_HOOK );
		}
	}

	/**
	 * Daily maintenance.
	 *
	 * @since 1.0.40
	 *
	 * @return void
	 */
	public static function run_daily(): void {
		( new RateLimitStore() )->purge_expired( time() - self::RATE_LIMIT_RETENTION );
	}
}
