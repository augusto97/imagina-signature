<?php
/**
 * Install-link status: what a user can install and what they did.
 *
 * @package ImaginaSignatures\Deployment\Install
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Install;

use ImaginaSignatures\Deployment\DeploymentStatus;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Services\SignatureService;

defined( 'ABSPATH' ) || exit;

/**
 * Domain logic of the `install` deployment channel.
 *
 * The channel record ({@see DeploymentStatus}, channel `install`) has
 * this shape — every key optional:
 *
 *  - `invited_at`   UTC time of the last invitation email;
 *  - `invited_hash` `html_hash` the last invitation was sent for;
 *  - `reminders`    reminders sent since the last invitation;
 *  - `reminded_at`  UTC time of the last reminder;
 *  - `opened_at`    UTC time the install page was last opened (throttled);
 *  - `installed_at` UTC time the user pressed "I've installed it";
 *  - `client`       email client they were on (`gmail`, `outlook-web`…);
 *  - `at`           same as `installed_at` (DeploymentStatus convention);
 *  - `hash`         `html_hash` installed — before the first install, the
 *                   one invited for. The team console compares it with the
 *                   primary signature's current `html_hash`;
 *  - `outdated_at`  UTC time the deployed HTML changed after the install.
 *
 * {@see state()} turns a record into `none` / `invited` / `installed` /
 * `outdated`.
 *
 * Not `final` so PHPUnit 9 can double it in controller / queue tests.
 *
 * @since 1.3.0
 */
class InstallService {

	public const CHANNEL = 'install';

	public const STATE_NONE      = 'none';
	public const STATE_INVITED   = 'invited';
	public const STATE_INSTALLED = 'installed';
	public const STATE_OUTDATED  = 'outdated';

	/**
	 * Email clients the "I've installed it" endpoint accepts.
	 *
	 * @var string[]
	 */
	public const CLIENTS = [ 'gmail', 'outlook-web', 'outlook-desktop', 'apple-mail', 'mobile', 'other' ];

	/**
	 * `opened_at` is rewritten at most this often (seconds).
	 */
	private const OPENED_THROTTLE = HOUR_IN_SECONDS;

	/**
	 * @var SignatureService
	 */
	private SignatureService $signatures;

	/**
	 * Clock override for tests.
	 *
	 * @var callable|null
	 */
	private $clock;

	/**
	 * @param SignatureService $signatures Signature service.
	 * @param callable|null    $clock      `function (): int` returning "now"; defaults to `time()`.
	 */
	public function __construct( SignatureService $signatures, ?callable $clock = null ) {
		$this->signatures = $signatures;
		$this->clock      = $clock;
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
	 * Current time as a UTC DB timestamp.
	 *
	 * @return string
	 */
	private function now_utc(): string {
		return gmdate( 'Y-m-d H:i:s', $this->now() );
	}

	/**
	 * The user's primary signature, whether or not it can be installed.
	 *
	 * @since 1.3.0
	 *
	 * @param int $user_id Owner.
	 *
	 * @return Signature|null
	 */
	public function primary( int $user_id ): ?Signature {
		return $this->signatures->primary_for_user( $user_id );
	}

	/**
	 * True when the signature has server-compiled HTML that is up to date
	 * with its last edit — the only HTML the install link may hand out.
	 *
	 * @since 1.3.0
	 *
	 * @param Signature|null $signature Candidate.
	 *
	 * @return bool
	 */
	public static function is_deployable( ?Signature $signature ): bool {
		return null !== $signature
			&& null !== $signature->html_cache
			&& '' !== trim( $signature->html_cache )
			&& ! $signature->is_html_stale();
	}

	/**
	 * The user's install channel record.
	 *
	 * @since 1.3.0
	 *
	 * @param int $user_id User.
	 *
	 * @return array<string, mixed>
	 */
	public function record( int $user_id ): array {
		$all = DeploymentStatus::get( $user_id );
		return isset( $all[ self::CHANNEL ] ) && is_array( $all[ self::CHANNEL ] ) ? $all[ self::CHANNEL ] : [];
	}

	/**
	 * Install state of a record against the HTML currently deployed.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed> $record       Channel record.
	 * @param string|null          $current_hash `html_hash` of the user's primary signature now.
	 *
	 * @return string One of the STATE_* constants.
	 */
	public static function state( array $record, ?string $current_hash ): string {
		if ( ! empty( $record['installed_at'] ) ) {
			$installed = isset( $record['hash'] ) ? (string) $record['hash'] : '';
			return null !== $current_hash && '' !== $installed && hash_equals( $installed, $current_hash )
				? self::STATE_INSTALLED
				: self::STATE_OUTDATED;
		}
		return ! empty( $record['invited_at'] ) ? self::STATE_INVITED : self::STATE_NONE;
	}

	/**
	 * Records that the user installed `$signature`.
	 *
	 * @since 1.3.0
	 *
	 * @param int       $user_id   User.
	 * @param Signature $signature The deployable primary signature they installed.
	 * @param string    $client    One of {@see CLIENTS} ('' / unknown → `other`).
	 *
	 * @return array<string, mixed> The updated channel record.
	 */
	public function mark_installed( int $user_id, Signature $signature, string $client = '' ): array {
		$now = $this->now_utc();
		DeploymentStatus::set(
			$user_id,
			self::CHANNEL,
			[
				'installed_at' => $now,
				'at'           => $now,
				'hash'         => (string) $signature->html_hash,
				'client'       => in_array( $client, self::CLIENTS, true ) ? $client : 'other',
				'outdated_at'  => null,
			]
		);

		/**
		 * Fires after a user confirmed their signature is installed.
		 *
		 * @since 1.3.0
		 *
		 * @param int       $user_id   User.
		 * @param Signature $signature Signature installed.
		 * @param string    $client    Email client.
		 */
		do_action( 'imgsig/install/installed', $user_id, $signature, $client );

		return $this->record( $user_id );
	}

	/**
	 * Records an invitation (`$reminder` false) or a reminder email.
	 *
	 * An invitation resets the reminder counter. `hash` is only written
	 * while the user has never installed, so it keeps meaning "the HTML
	 * they installed" once they have.
	 *
	 * @since 1.3.0
	 *
	 * @param int       $user_id   User.
	 * @param Signature $signature Signature the email was sent for.
	 * @param bool      $reminder  True for a reminder.
	 *
	 * @return void
	 */
	public function mark_contacted( int $user_id, Signature $signature, bool $reminder ): void {
		$record = $this->record( $user_id );
		$now    = $this->now_utc();

		if ( $reminder ) {
			$entry = [
				'reminded_at' => $now,
				'reminders'   => (int) ( $record['reminders'] ?? 0 ) + 1,
			];
		} else {
			$entry = [
				'invited_at'   => $now,
				'invited_hash' => (string) $signature->html_hash,
				'reminders'    => 0,
				'reminded_at'  => null,
			];
			if ( empty( $record['installed_at'] ) ) {
				$entry['hash'] = (string) $signature->html_hash;
			}
		}

		DeploymentStatus::set( $user_id, self::CHANNEL, $entry );
	}

	/**
	 * Notes that the install page was opened (at most once an hour).
	 *
	 * @since 1.3.0
	 *
	 * @param int $user_id User.
	 *
	 * @return void
	 */
	public function mark_opened( int $user_id ): void {
		$record = $this->record( $user_id );
		$last   = isset( $record['opened_at'] ) ? strtotime( (string) $record['opened_at'] . ' UTC' ) : false;
		if ( false !== $last && $this->now() - $last < self::OPENED_THROTTLE ) {
			return;
		}
		DeploymentStatus::set( $user_id, self::CHANNEL, [ 'opened_at' => $this->now_utc() ] );
	}

	/**
	 * `imgsig/deploy/primary_html_changed` listener: a user who had
	 * installed now deploys different HTML, so their install is outdated.
	 *
	 * The hash mismatch alone already makes {@see state()} report
	 * `outdated`; `outdated_at` records since when (and is cleared when the
	 * HTML goes back to the installed version).
	 *
	 * @since 1.3.0
	 *
	 * @param int|mixed       $user_id   Owner.
	 * @param Signature|mixed $signature New primary signature.
	 *
	 * @return void
	 */
	public function on_primary_html_changed( $user_id, $signature = null ): void {
		$user_id = (int) $user_id;
		if ( $user_id <= 0 || ! $signature instanceof Signature ) {
			return;
		}

		$record = $this->record( $user_id );
		if ( empty( $record['installed_at'] ) ) {
			return;
		}

		$state = self::state( $record, $signature->html_hash );
		if ( self::STATE_OUTDATED === $state && empty( $record['outdated_at'] ) ) {
			DeploymentStatus::set( $user_id, self::CHANNEL, [ 'outdated_at' => $this->now_utc() ] );
		} elseif ( self::STATE_INSTALLED === $state && ! empty( $record['outdated_at'] ) ) {
			DeploymentStatus::set( $user_id, self::CHANNEL, [ 'outdated_at' => null ] );
		}
	}

	/**
	 * Summary for REST responses: link state + the dates that matter.
	 *
	 * @since 1.3.0
	 *
	 * @param int $user_id User.
	 *
	 * @return array<string, mixed>
	 */
	public function summary( int $user_id ): array {
		$primary = $this->primary( $user_id );
		$record  = $this->record( $user_id );

		return [
			'state'        => self::state( $record, null !== $primary ? $primary->html_hash : null ),
			'ready'        => self::is_deployable( $primary ),
			'signature_id' => null !== $primary ? $primary->id : null,
			'invited_at'   => $record['invited_at'] ?? null,
			'reminders'    => (int) ( $record['reminders'] ?? 0 ),
			'opened_at'    => $record['opened_at'] ?? null,
			'installed_at' => $record['installed_at'] ?? null,
			'client'       => $record['client'] ?? null,
		];
	}
}
