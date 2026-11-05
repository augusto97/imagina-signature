<?php
/**
 * Queued invitation / reminder emails sent in WP-Cron batches.
 *
 * @package ImaginaSignatures\Deployment\Install
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Install;

use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Sends install-link emails to many users without timing out a request.
 *
 * One job at a time lives in the option {@see OPTION} (not autoloaded):
 * the ids still to email (`pending`), counters and a capped report of
 * the users that were skipped or failed. {@see start()} stores it and
 * schedules the first single event {@see BATCH_HOOK}; every run of
 * {@see run_batch()} emails at most {@see BATCH_SIZE} users (filter
 * `imgsig/deploy/invitation_batch_size`) and, while users remain,
 * schedules the next single event — a chain, one batch per cron run.
 *
 * Safety:
 *  - a lock option (atomic `add_option`) keeps two cron runners from
 *    emailing the same batch; a lock older than {@see LOCK_TTL} is
 *    considered abandoned;
 *  - the job is re-read from the database before every email, so a
 *    cancel from the admin stops the run within one email, and progress
 *    is saved after every email;
 *  - when the chain broke (cron disabled for a while, a killed PHP
 *    process), {@see ensure_scheduled()} — called whenever the admin
 *    polls the progress — schedules it again.
 *
 * Users are skipped (and reported) when they no longer exist, lost
 * access to signatures, have no valid email, have no primary signature,
 * or its server-compiled HTML is missing / stale. Reminders also skip
 * users who installed in the meantime.
 *
 * Not `final` so PHPUnit 9 can double it in controller / reminder tests.
 *
 * @since 1.3.0
 */
class InvitationQueue {

	public const OPTION      = 'imgsig_install_invitations';
	public const LOCK_OPTION = 'imgsig_install_invitations_lock';
	public const BATCH_HOOK  = 'imgsig_install_invitations_batch';
	public const BATCH_SIZE  = 50;

	public const STATUS_RUNNING   = 'running';
	public const STATUS_DONE      = 'done';
	public const STATUS_CANCELLED = 'cancelled';

	public const REASON_NO_USER      = 'no_user';
	public const REASON_NO_ACCESS    = 'no_access';
	public const REASON_NO_EMAIL     = 'no_email';
	public const REASON_NO_SIGNATURE = 'no_signature';
	public const REASON_NOT_READY    = 'not_ready';
	public const REASON_INSTALLED    = 'already_installed';
	public const REASON_MAIL_FAILED  = 'mail_failed';

	/**
	 * Seconds after which a held lock is treated as abandoned.
	 */
	private const LOCK_TTL = 300;

	/**
	 * Skipped / failed users kept in the report.
	 */
	private const MAX_REPORTED = 500;

	/**
	 * @var InstallService
	 */
	private InstallService $service;

	/**
	 * @var InvitationMailer
	 */
	private InvitationMailer $mailer;

	/**
	 * Clock override for tests.
	 *
	 * @var callable|null
	 */
	private $clock;

	/**
	 * @param InstallService   $service Install status service.
	 * @param InvitationMailer $mailer  Email builder / sender.
	 * @param callable|null    $clock   `function (): int` returning "now"; defaults to `time()`.
	 */
	public function __construct( InstallService $service, InvitationMailer $mailer, ?callable $clock = null ) {
		$this->service = $service;
		$this->mailer  = $mailer;
		$this->clock   = $clock;
	}

	/**
	 * Current Unix time.
	 *
	 * @return int
	 */
	private function now(): int {
		return null !== $this->clock ? (int) ( $this->clock )() : time();
	}

	/**
	 * True while a job still has users to email.
	 *
	 * @since 1.3.0
	 *
	 * @return bool
	 */
	public function is_running(): bool {
		$job = $this->load();
		return null !== $job && self::STATUS_RUNNING === $job['status'];
	}

	/**
	 * Queues a job and schedules its first batch.
	 *
	 * @since 1.3.0
	 *
	 * @param int[]  $user_ids   Recipients (deduplicated here).
	 * @param string $kind       {@see InvitationMailer::KIND_INVITE} or `KIND_REMINDER`.
	 * @param string $message    Optional admin message (invitations only).
	 * @param int    $created_by Admin who started it (0 = the reminder cron).
	 *
	 * @return array<string, mixed>|null Progress of the new job; null when one is already running or nobody was given.
	 */
	public function start( array $user_ids, string $kind, string $message = '', int $created_by = 0 ): ?array {
		if ( $this->is_running() ) {
			return null;
		}

		$ids = [];
		foreach ( $user_ids as $id ) {
			$id = (int) $id;
			if ( $id > 0 ) {
				$ids[ $id ] = $id;
			}
		}
		if ( empty( $ids ) ) {
			return null;
		}

		$now = gmdate( 'Y-m-d H:i:s', $this->now() );
		$job = [
			'id'          => 'j' . bin2hex( random_bytes( 6 ) ),
			'kind'        => InvitationMailer::KIND_REMINDER === $kind ? InvitationMailer::KIND_REMINDER : InvitationMailer::KIND_INVITE,
			'status'      => self::STATUS_RUNNING,
			'message'     => InvitationMailer::KIND_REMINDER === $kind ? '' : InvitationMailer::clean_message( $message ),
			'created_by'  => $created_by,
			'created_at'  => $now,
			'updated_at'  => $now,
			'finished_at' => null,
			'total'       => count( $ids ),
			'pending'     => array_values( $ids ),
			'sent'        => 0,
			'failed'      => 0,
			'skipped'     => 0,
			'batches'     => 0,
			'report'      => [],
		];

		$this->save( $job );
		$this->schedule( $job['id'] );

		return self::project( $job );
	}

	/**
	 * Stops the current job (users already emailed stay emailed).
	 *
	 * @since 1.3.0
	 *
	 * @return array<string, mixed>|null Progress after cancelling, null when there is no job.
	 */
	public function cancel(): ?array {
		$job = $this->load( true );
		if ( null === $job ) {
			return null;
		}
		if ( self::STATUS_RUNNING === $job['status'] ) {
			$job['status']      = self::STATUS_CANCELLED;
			$job['pending']     = [];
			$job['finished_at'] = gmdate( 'Y-m-d H:i:s', $this->now() );
			$this->save( $job );
			self::unschedule();
		}
		return self::project( $job );
	}

	/**
	 * Progress of the current (or last) job.
	 *
	 * @since 1.3.0
	 *
	 * @return array<string, mixed>|null
	 */
	public function progress(): ?array {
		$job = $this->load( true );
		return null === $job ? null : self::project( $job );
	}

	/**
	 * Re-schedules a running job whose chain broke.
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public function ensure_scheduled(): void {
		$job = $this->load();
		if ( null === $job || self::STATUS_RUNNING !== $job['status'] ) {
			return;
		}
		if ( false === wp_next_scheduled( self::BATCH_HOOK, [ $job['id'] ] ) && ! $this->lock_is_held() ) {
			$this->schedule( $job['id'] );
		}
	}

	/**
	 * Cron handler: emails the next batch and chains the following one.
	 *
	 * @since 1.3.0
	 *
	 * @param string|mixed $job_id Job the event was scheduled for ('' = whichever runs).
	 *
	 * @return void
	 */
	public function run_batch( $job_id = '' ): void {
		$job_id = is_string( $job_id ) ? $job_id : '';
		if ( ! $this->acquire_lock() ) {
			return;
		}

		try {
			/**
			 * Filters how many users one cron run emails.
			 *
			 * @since 1.3.0
			 *
			 * @param int $size Default 50.
			 */
			$size = max( 1, (int) apply_filters( 'imgsig/deploy/invitation_batch_size', self::BATCH_SIZE ) );

			$job = null;
			for ( $done = 0; $done < $size; $done++ ) {
				$job = $this->load( true );
				if ( null === $job || self::STATUS_RUNNING !== $job['status'] || ( '' !== $job_id && $job_id !== $job['id'] ) || empty( $job['pending'] ) ) {
					break;
				}

				$user_id = (int) array_shift( $job['pending'] );
				$outcome = $this->process( $user_id, $job );
				$this->record( $job, $user_id, $outcome );
				$this->save( $job );
			}

			$job = $this->load( true );
			if ( null === $job || self::STATUS_RUNNING !== $job['status'] || ( '' !== $job_id && $job_id !== $job['id'] ) ) {
				return;
			}

			++$job['batches'];
			if ( empty( $job['pending'] ) ) {
				$job['status']      = self::STATUS_DONE;
				$job['finished_at'] = gmdate( 'Y-m-d H:i:s', $this->now() );
				$this->save( $job );

				/**
				 * Fires when an invitation / reminder run has emailed everyone.
				 *
				 * @since 1.3.0
				 *
				 * @param array<string, mixed> $progress Final progress.
				 */
				do_action( 'imgsig/install/invitations_finished', self::project( $job ) );
				return;
			}

			$this->save( $job );
			$this->schedule( $job['id'] );
		} finally {
			$this->release_lock();
		}
	}

	/**
	 * Emails one user.
	 *
	 * @param int                  $user_id Recipient.
	 * @param array<string, mixed> $job     Job (kind, message, created_by).
	 *
	 * @return array{status: string, reason?: string}
	 */
	private function process( int $user_id, array $job ): array {
		$user = get_userdata( $user_id );
		if ( ! $user ) {
			return self::skipped( self::REASON_NO_USER );
		}
		if ( ! user_can( $user, CapabilitiesInstaller::CAP_USE ) ) {
			return self::skipped( self::REASON_NO_ACCESS );
		}
		if ( empty( $user->user_email ) || ! is_email( $user->user_email ) ) {
			return self::skipped( self::REASON_NO_EMAIL );
		}

		$signature = $this->service->primary( $user_id );
		if ( null === $signature ) {
			return self::skipped( self::REASON_NO_SIGNATURE );
		}
		if ( ! InstallService::is_deployable( $signature ) ) {
			return self::skipped( self::REASON_NOT_READY );
		}

		$reminder = InvitationMailer::KIND_REMINDER === $job['kind'];
		if ( $reminder ) {
			$record = $this->service->record( $user_id );
			if ( ! empty( $record['installed_at'] ) ) {
				return self::skipped( self::REASON_INSTALLED );
			}
		}

		$reply_to = $job['created_by'] > 0 ? get_userdata( (int) $job['created_by'] ) : null;
		$sent     = $this->mailer->send( $user, InstallTokens::url_for_user( $user_id ), (string) $job['kind'], (string) $job['message'], $reply_to ?: null );
		if ( ! $sent ) {
			return [
				'status' => 'failed',
				'reason' => self::REASON_MAIL_FAILED,
			];
		}

		$this->service->mark_contacted( $user_id, $signature, $reminder );
		return [ 'status' => 'sent' ];
	}

	/**
	 * @param string $reason Skip reason.
	 *
	 * @return array{status: string, reason: string}
	 */
	private static function skipped( string $reason ): array {
		return [
			'status' => 'skipped',
			'reason' => $reason,
		];
	}

	/**
	 * Adds one outcome to the job's counters / report.
	 *
	 * @param array<string, mixed>                   $job     Job (by reference).
	 * @param int                                    $user_id User.
	 * @param array{status: string, reason?: string} $outcome Outcome.
	 *
	 * @return void
	 */
	private function record( array &$job, int $user_id, array $outcome ): void {
		$job['updated_at'] = gmdate( 'Y-m-d H:i:s', $this->now() );
		if ( 'sent' === $outcome['status'] ) {
			++$job['sent'];
			return;
		}

		if ( 'failed' === $outcome['status'] ) {
			++$job['failed'];
		} else {
			++$job['skipped'];
		}
		if ( count( $job['report'] ) < self::MAX_REPORTED ) {
			// Names are stored now (the user object is already cached by
			// process()), so polling the progress costs no user queries.
			$user            = get_userdata( $user_id );
			$job['report'][] = [
				'user_id' => $user_id,
				'name'    => $user ? (string) $user->display_name : '',
				'email'   => $user ? (string) $user->user_email : '',
				'status'  => $outcome['status'],
				'reason'  => $outcome['reason'] ?? '',
			];
		}
	}

	/**
	 * Public projection of a job (no pending id list, no message).
	 *
	 * @param array<string, mixed> $job Job.
	 *
	 * @return array<string, mixed>
	 */
	private static function project( array $job ): array {
		$processed = (int) $job['sent'] + (int) $job['failed'] + (int) $job['skipped'];
		$total     = (int) $job['total'];
		$pending   = count( (array) $job['pending'] );

		$report = [];
		foreach ( (array) $job['report'] as $row ) {
			$report[] = [
				'user_id' => (int) ( $row['user_id'] ?? 0 ),
				'name'    => (string) ( $row['name'] ?? '' ),
				'email'   => (string) ( $row['email'] ?? '' ),
				'status'  => (string) ( $row['status'] ?? '' ),
				'reason'  => (string) ( $row['reason'] ?? '' ),
			];
		}

		return [
			'id'          => (string) $job['id'],
			'kind'        => (string) $job['kind'],
			'status'      => (string) $job['status'],
			'running'     => self::STATUS_RUNNING === $job['status'],
			'total'       => $total,
			'processed'   => $processed,
			'pending'     => $pending,
			'sent'        => (int) $job['sent'],
			'failed'      => (int) $job['failed'],
			'skipped'     => (int) $job['skipped'],
			'percent'     => $total > 0 ? (int) floor( 100 * $processed / $total ) : 100,
			'created_at'  => (string) $job['created_at'],
			'updated_at'  => (string) $job['updated_at'],
			'finished_at' => $job['finished_at'],
			'report'      => $report,
		];
	}

	/**
	 * Reads the job option.
	 *
	 * @param bool $fresh Bypass the options cache (another request may have written it).
	 *
	 * @return array<string, mixed>|null
	 */
	private function load( bool $fresh = false ): ?array {
		if ( $fresh ) {
			wp_cache_delete( self::OPTION, 'options' );
		}
		$job = get_option( self::OPTION, null );
		if ( ! is_array( $job ) || ! isset( $job['id'], $job['status'], $job['pending'] ) || ! is_array( $job['pending'] ) ) {
			return null;
		}
		return $job + [
			'kind'       => InvitationMailer::KIND_INVITE,
			'message'    => '',
			'created_by' => 0,
			'total'      => 0,
			'sent'       => 0,
			'failed'     => 0,
			'skipped'    => 0,
			'batches'    => 0,
			'report'     => [],
			'created_at' => '',
			'updated_at' => '',
		];
	}

	/**
	 * Writes the job option (never autoloaded).
	 *
	 * @param array<string, mixed> $job Job.
	 *
	 * @return void
	 */
	private function save( array $job ): void {
		update_option( self::OPTION, $job, false );
	}

	/**
	 * Schedules the next batch right away.
	 *
	 * @param string $job_id Job.
	 *
	 * @return void
	 */
	private function schedule( string $job_id ): void {
		if ( false === wp_next_scheduled( self::BATCH_HOOK, [ $job_id ] ) ) {
			wp_schedule_single_event( $this->now(), self::BATCH_HOOK, [ $job_id ] );
		}
	}

	/**
	 * Removes every scheduled batch, whatever its job id.
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public static function unschedule(): void {
		wp_unschedule_hook( self::BATCH_HOOK );
	}

	/**
	 * Takes the batch lock (atomic on the unique option name).
	 *
	 * @return bool
	 */
	private function acquire_lock(): bool {
		if ( add_option( self::LOCK_OPTION, $this->now(), '', false ) ) {
			return true;
		}
		if ( $this->lock_is_held() ) {
			return false;
		}
		update_option( self::LOCK_OPTION, $this->now(), false );
		return true;
	}

	/**
	 * True when another runner holds a lock younger than {@see LOCK_TTL}.
	 *
	 * @return bool
	 */
	private function lock_is_held(): bool {
		wp_cache_delete( self::LOCK_OPTION, 'options' );
		$locked_at = (int) get_option( self::LOCK_OPTION, 0 );
		return $locked_at > 0 && $locked_at > $this->now() - self::LOCK_TTL;
	}

	/**
	 * @return void
	 */
	private function release_lock(): void {
		delete_option( self::LOCK_OPTION );
	}
}
