<?php
/**
 * Gmail push automation (WP-Cron).
 *
 * @package ImaginaSignatures\Deployment\Gmail
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Gmail;

defined( 'ABSPATH' ) || exit;

/**
 * Owns every scheduled Gmail push:
 *
 *  - **Auto-push.** With `auto_push` on, `imgsig/deploy/primary_html_changed`
 *    schedules a single `imgsig_gmail_push_user` event for that user 60 s
 *    later. Debounced: while an event for the user is pending no other is
 *    added (the pending one reads the latest HTML when it runs), so a burst
 *    of saves costs one push per user per minute.
 *  - **Retries.** A temporary failure (429 / 5xx / network) re-schedules the
 *    same event with back-off (5, 10, 20 min, or Google's `Retry-After`),
 *    at most {@see MAX_RETRIES} times.
 *  - **Daily sync.** With `daily_sync` on, `imgsig_gmail_daily_sync` (daily)
 *    starts a pass over every signature owner in user-ID order; each
 *    `imgsig_gmail_sync_batch` run makes at most {@see BATCH_PUSHES} Gmail
 *    calls (users already up to date are skipped without one) and stores
 *    its cursor in the `imgsig_gmail_sync` option, then schedules the next
 *    batch a minute later until the pass is done.
 *
 * {@see unschedule_all()} runs on deactivation and uninstall.
 *
 * Not `final` so PHPUnit can double it.
 *
 * @since 1.3.0
 */
class GmailScheduler {

	/** Single event: push one user (args: [user_id]). */
	public const PUSH_HOOK = 'imgsig_gmail_push_user';

	/** Recurring daily event: start a sync pass. */
	public const DAILY_HOOK = 'imgsig_gmail_daily_sync';

	/** Single event: continue the current sync pass. */
	public const BATCH_HOOK = 'imgsig_gmail_sync_batch';

	/** Option holding the sync pass cursor and counters. */
	public const SYNC_OPTION = 'imgsig_gmail_sync';

	/** Auto-push delay / debounce window, in seconds. */
	public const DEBOUNCE_SECONDS = 60;

	/** Most Gmail calls per sync batch. */
	public const BATCH_PUSHES = 20;

	/** Most users examined per sync batch. */
	public const BATCH_SCAN = 200;

	/** Gap between sync batches, in seconds. */
	public const BATCH_GAP = 60;

	/** Most automatic retries of a temporary failure. */
	public const MAX_RETRIES = 3;

	/** First retry delay, in seconds (doubles each time). */
	public const RETRY_BASE_SECONDS = 300;

	/** Wall-clock budget of one sync batch, in seconds. */
	public const TIME_BUDGET = 20;

	/** A pass still "running" after this long is considered abandoned. */
	private const STALE_PASS_SECONDS = 6 * HOUR_IN_SECONDS;

	/**
	 * @var GmailSettings
	 */
	private GmailSettings $settings;

	/**
	 * @var GmailPusher
	 */
	private GmailPusher $pusher;

	/**
	 * @var GmailUserDirectory
	 */
	private GmailUserDirectory $users;

	/**
	 * @param GmailSettings      $settings Settings.
	 * @param GmailPusher        $pusher   Pusher.
	 * @param GmailUserDirectory $users    Signature owners.
	 */
	public function __construct( GmailSettings $settings, GmailPusher $pusher, GmailUserDirectory $users ) {
		$this->settings = $settings;
		$this->pusher   = $pusher;
		$this->users    = $users;
	}

	/**
	 * Registers the listeners and cron handlers. Called on every boot.
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public function boot(): void {
		add_action( 'imgsig/deploy/primary_html_changed', [ $this, 'on_primary_html_changed' ], 10, 2 );
		add_action( 'imgsig/gmail/push_completed', [ $this, 'maybe_schedule_retry' ] );
		add_action( self::PUSH_HOOK, [ $this, 'run_scheduled_push' ] );
		add_action( self::DAILY_HOOK, [ $this, 'run_daily_sync' ] );
		add_action( self::BATCH_HOOK, [ $this, 'run_sync_batch' ] );
		// Re-adds the daily event after a deactivate / activate cycle.
		add_action( 'admin_init', [ $this, 'ensure_daily_schedule' ] );
	}

	/**
	 * `imgsig/deploy/primary_html_changed` listener.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $user_id   Owner.
	 * @param mixed $signature Primary signature (unused: the push re-reads it).
	 *
	 * @return void
	 */
	public function on_primary_html_changed( $user_id, $signature = null ): void {
		unset( $signature );
		$user_id = (int) $user_id;
		if ( $user_id <= 0 || ! $this->settings->is_configured() || ! $this->settings->auto_push() ) {
			return;
		}
		$this->schedule_push( $user_id, self::DEBOUNCE_SECONDS );
	}

	/**
	 * Schedules a push for one user in `$delay` seconds unless one is
	 * already due sooner. A pending later one (a back-off retry) is
	 * moved forward.
	 *
	 * @since 1.3.0
	 *
	 * @param int $user_id User.
	 * @param int $delay   Seconds from now.
	 *
	 * @return bool True when an event was (re)scheduled.
	 */
	public function schedule_push( int $user_id, int $delay ): bool {
		$args = [ $user_id ];
		$at   = time() + max( 1, $delay );
		$next = wp_next_scheduled( self::PUSH_HOOK, $args );

		if ( false !== $next ) {
			if ( (int) $next <= $at ) {
				return false;
			}
			wp_unschedule_event( (int) $next, self::PUSH_HOOK, $args );
		}

		return true === wp_schedule_single_event( $at, self::PUSH_HOOK, $args );
	}

	/**
	 * `imgsig_gmail_push_user` handler.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $user_id User.
	 *
	 * @return void
	 */
	public function run_scheduled_push( $user_id ): void {
		$user_id = (int) $user_id;
		if ( $user_id > 0 ) {
			$this->pusher->push_user( $user_id );
		}
	}

	/**
	 * `imgsig/gmail/push_completed` listener: back-off retry of
	 * temporary failures.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $result Push outcome.
	 *
	 * @return void
	 */
	public function maybe_schedule_retry( $result ): void {
		if ( ! $result instanceof PushResult || ! $result->is_retryable() || $result->retries > self::MAX_RETRIES ) {
			return;
		}
		$backoff = self::RETRY_BASE_SECONDS * ( 2 ** max( 0, $result->retries - 1 ) );
		$asked   = null !== $result->exception ? $result->exception->retry_after() : 0;
		$this->schedule_push( $result->user_id, (int) min( DAY_IN_SECONDS, max( $backoff, $asked ) ) );
	}

	/**
	 * Makes the daily event match the settings (scheduled iff connected
	 * and `daily_sync` is on).
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public function ensure_daily_schedule(): void {
		$want = $this->settings->is_configured() && $this->settings->daily_sync();
		$next = wp_next_scheduled( self::DAILY_HOOK );

		if ( $want && false === $next ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', self::DAILY_HOOK );
		} elseif ( ! $want && false !== $next ) {
			wp_clear_scheduled_hook( self::DAILY_HOOK );
			wp_clear_scheduled_hook( self::BATCH_HOOK );
			$this->stop_pass();
		}
	}

	/**
	 * Applies a settings change: daily event on / off, and pending
	 * pushes dropped when the account was removed or auto-push turned off.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed> $before {@see GmailSettings::public_view()} before the change.
	 *
	 * @return void
	 */
	public function sync_with_settings( array $before ): void {
		$this->ensure_daily_schedule();

		$was_auto = ! empty( $before['configured'] ) && ! empty( $before['auto_push'] );
		$is_auto  = $this->settings->is_configured() && $this->settings->auto_push();
		if ( ( $was_auto && ! $is_auto ) || ! $this->settings->is_configured() ) {
			wp_unschedule_hook( self::PUSH_HOOK );
		}
	}

	/**
	 * `imgsig_gmail_daily_sync` handler: starts a pass (or resumes one
	 * still in progress).
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public function run_daily_sync(): void {
		if ( ! $this->settings->is_configured() || ! $this->settings->daily_sync() ) {
			return;
		}

		$state   = $this->sync_state();
		$started = strtotime( (string) $state['started_at'] . ' UTC' );
		if ( ! empty( $state['running'] ) && false !== $started && time() - $started < self::STALE_PASS_SECONDS ) {
			$this->schedule_next_batch();
			return;
		}

		update_option(
			self::SYNC_OPTION,
			[
				'running'     => true,
				'after'       => 0,
				'started_at'  => gmdate( 'Y-m-d H:i:s' ),
				'finished_at' => '',
				'scanned'     => 0,
				'pushed'      => 0,
				'failed'      => 0,
			],
			false
		);

		$this->run_sync_batch();
	}

	/**
	 * `imgsig_gmail_sync_batch` handler: one batch of the current pass.
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public function run_sync_batch(): void {
		$state = $this->sync_state();
		if ( empty( $state['running'] ) ) {
			return;
		}
		if ( ! $this->settings->is_configured() ) {
			$this->stop_pass();
			return;
		}

		$deadline  = microtime( true ) + self::TIME_BUDGET;
		$ids       = $this->users->owner_ids_after( (int) $state['after'], self::BATCH_SCAN );
		$processed = 0;
		$calls     = 0;

		foreach ( $ids as $user_id ) {
			if ( $calls >= self::BATCH_PUSHES || microtime( true ) >= $deadline ) {
				break;
			}
			$result = $this->pusher->push_user( $user_id );

			++$processed;
			$state['after'] = $user_id;
			++$state['scanned'];
			if ( PushResult::PUSHED === $result->status ) {
				++$state['pushed'];
			} elseif ( $result->attempted() ) {
				++$state['failed'];
			}
			if ( $result->attempted() ) {
				++$calls;
			}
		}

		$finished = count( $ids ) === $processed && count( $ids ) < self::BATCH_SCAN;
		if ( $finished ) {
			$state['running']     = false;
			$state['finished_at'] = gmdate( 'Y-m-d H:i:s' );
			update_option( self::SYNC_OPTION, $state, false );
			return;
		}

		update_option( self::SYNC_OPTION, $state, false );
		$this->schedule_next_batch();
	}

	/**
	 * Current sync pass state (cursor + counters of the last pass).
	 *
	 * @since 1.3.0
	 *
	 * @return array{running: bool, after: int, started_at: string, finished_at: string, scanned: int, pushed: int, failed: int}
	 */
	public function sync_state(): array {
		$raw = get_option( self::SYNC_OPTION, [] );
		$raw = is_array( $raw ) ? $raw : [];
		return [
			'running'     => ! empty( $raw['running'] ),
			'after'       => (int) ( $raw['after'] ?? 0 ),
			'started_at'  => (string) ( $raw['started_at'] ?? '' ),
			'finished_at' => (string) ( $raw['finished_at'] ?? '' ),
			'scanned'     => (int) ( $raw['scanned'] ?? 0 ),
			'pushed'      => (int) ( $raw['pushed'] ?? 0 ),
			'failed'      => (int) ( $raw['failed'] ?? 0 ),
		];
	}

	/**
	 * Removes every Gmail event (deactivation / uninstall).
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public static function unschedule_all(): void {
		wp_clear_scheduled_hook( self::DAILY_HOOK );
		wp_clear_scheduled_hook( self::BATCH_HOOK );
		wp_unschedule_hook( self::PUSH_HOOK );
	}

	/**
	 * Schedules the next batch unless one is pending.
	 *
	 * @return void
	 */
	private function schedule_next_batch(): void {
		if ( ! wp_next_scheduled( self::BATCH_HOOK ) ) {
			wp_schedule_single_event( time() + self::BATCH_GAP, self::BATCH_HOOK );
		}
	}

	/**
	 * Marks the current pass as stopped (keeps its counters).
	 *
	 * @return void
	 */
	private function stop_pass(): void {
		$state = $this->sync_state();
		if ( $state['running'] ) {
			$state['running']     = false;
			$state['finished_at'] = gmdate( 'Y-m-d H:i:s' );
			update_option( self::SYNC_OPTION, $state, false );
		}
	}
}
