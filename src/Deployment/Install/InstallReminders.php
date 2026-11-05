<?php
/**
 * Reminder emails for invited users who have not installed yet.
 *
 * @package ImaginaSignatures\Deployment\Install
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Install;

use ImaginaSignatures\Deployment\DeploymentStatus;

defined( 'ABSPATH' ) || exit;

/**
 * Settings + daily selection of the install reminders.
 *
 * Settings live in the option {@see OPTION}:
 *
 *  - `enabled`    off by default — nobody gets automatic email until an
 *                 administrator turns it on;
 *  - `after_days` days to wait after the invitation (and between
 *                 reminders), 1–60, default 3;
 *  - `max`        reminders per invitation, 0–10, default 2.
 *
 * {@see run()} hangs off the plugin's existing daily cron event
 * (`imgsig_daily_cleanup`): it picks every user who was invited, has not
 * pressed "I've installed it", got fewer than `max` reminders and was
 * last contacted at least `after_days` ago, and queues them on the
 * {@see InvitationQueue} as a reminder job (sent in the same batches of
 * 50). When an invitation run is still in progress the reminders wait
 * for the next day.
 *
 * @since 1.3.0
 */
class InstallReminders {

	public const OPTION = 'imgsig_install_reminders';

	public const DEFAULTS = [
		'enabled'    => false,
		'after_days' => 3,
		'max'        => 2,
	];

	public const AFTER_DAYS_MIN = 1;
	public const AFTER_DAYS_MAX = 60;
	public const MAX_MAX        = 10;

	/**
	 * Tolerance on the waiting period (seconds), see {@see is_due()}.
	 */
	private const SLACK = 12 * HOUR_IN_SECONDS;

	/**
	 * @var InvitationQueue
	 */
	private InvitationQueue $queue;

	/**
	 * Clock override for tests.
	 *
	 * @var callable|null
	 */
	private $clock;

	/**
	 * @param InvitationQueue $queue Email queue.
	 * @param callable|null   $clock `function (): int` returning "now"; defaults to `time()`.
	 */
	public function __construct( InvitationQueue $queue, ?callable $clock = null ) {
		$this->queue = $queue;
		$this->clock = $clock;
	}

	/**
	 * Stored settings, sanitised (defaults when missing).
	 *
	 * @since 1.3.0
	 *
	 * @return array{enabled: bool, after_days: int, max: int}
	 */
	public static function settings(): array {
		$raw = get_option( self::OPTION, [] );
		return self::sanitize( is_array( $raw ) ? $raw : [], self::DEFAULTS );
	}

	/**
	 * Applies a partial update and stores the result.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed> $patch Untrusted partial settings.
	 *
	 * @return array{enabled: bool, after_days: int, max: int}
	 */
	public static function update( array $patch ): array {
		$next = self::sanitize( $patch, self::settings() );
		update_option( self::OPTION, $next, false );
		return $next;
	}

	/**
	 * Normalises untrusted input over `$base`.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed>                            $raw  Input.
	 * @param array{enabled: bool, after_days: int, max: int} $base Values for missing keys.
	 *
	 * @return array{enabled: bool, after_days: int, max: int}
	 */
	public static function sanitize( array $raw, array $base ): array {
		$out = [
			'enabled'    => (bool) $base['enabled'],
			'after_days' => (int) $base['after_days'],
			'max'        => (int) $base['max'],
		];

		if ( array_key_exists( 'enabled', $raw ) ) {
			$out['enabled'] = in_array( $raw['enabled'], [ true, 1, '1', 'true', 'on', 'yes' ], true );
		}
		if ( isset( $raw['after_days'] ) && is_numeric( $raw['after_days'] ) ) {
			$out['after_days'] = (int) $raw['after_days'];
		}
		if ( isset( $raw['max'] ) && is_numeric( $raw['max'] ) ) {
			$out['max'] = (int) $raw['max'];
		}

		$out['after_days'] = max( self::AFTER_DAYS_MIN, min( self::AFTER_DAYS_MAX, $out['after_days'] ) );
		$out['max']        = max( 0, min( self::MAX_MAX, $out['max'] ) );

		return $out;
	}

	/**
	 * Daily cron handler: queues today's reminders.
	 *
	 * @since 1.3.0
	 *
	 * @return int Users queued.
	 */
	public function run(): int {
		$settings = self::settings();
		if ( ! $settings['enabled'] || $settings['max'] <= 0 || $this->queue->is_running() ) {
			return 0;
		}

		$due = $this->due_user_ids( $settings );
		if ( empty( $due ) ) {
			return 0;
		}

		return null !== $this->queue->start( $due, InvitationMailer::KIND_REMINDER ) ? count( $due ) : 0;
	}

	/**
	 * Users due for a reminder now.
	 *
	 * @since 1.3.0
	 *
	 * @param array{enabled: bool, after_days: int, max: int} $settings Settings.
	 *
	 * @return int[]
	 */
	public function due_user_ids( array $settings ): array {
		$ids = get_users(
			[
				'meta_key'     => DeploymentStatus::META_KEY, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'meta_compare' => 'EXISTS',
				'fields'       => 'ID',
				'number'       => -1,
				'count_total'  => false,
			]
		);
		if ( ! is_array( $ids ) || empty( $ids ) ) {
			return [];
		}

		$ids = array_map( 'intval', $ids );
		update_meta_cache( 'user', $ids );

		$now = null !== $this->clock ? (int) ( $this->clock )() : time();
		$due = [];
		foreach ( $ids as $user_id ) {
			$all    = DeploymentStatus::get( $user_id );
			$record = isset( $all[ InstallService::CHANNEL ] ) ? $all[ InstallService::CHANNEL ] : [];
			if ( self::is_due( $record, $settings, $now ) ) {
				$due[] = $user_id;
			}
		}
		return $due;
	}

	/**
	 * True when an install record is due for a reminder at `$now`.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed>                            $record   Install channel record.
	 * @param array{enabled: bool, after_days: int, max: int} $settings Settings.
	 * @param int                                             $now      Unix time.
	 *
	 * @return bool
	 */
	public static function is_due( array $record, array $settings, int $now ): bool {
		if ( empty( $record['invited_at'] ) || ! empty( $record['installed_at'] ) ) {
			return false;
		}
		if ( (int) ( $record['reminders'] ?? 0 ) >= (int) $settings['max'] ) {
			return false;
		}

		$last = ! empty( $record['reminded_at'] ) ? (string) $record['reminded_at'] : (string) $record['invited_at'];
		$at   = strtotime( $last . ' UTC' );
		if ( false === $at ) {
			return false;
		}

		// The daily event fires at a fixed time of day: half a day of
		// slack sends the reminder on day N instead of N + 1.
		return $now - $at >= (int) $settings['after_days'] * DAY_IN_SECONDS - self::SLACK;
	}
}
