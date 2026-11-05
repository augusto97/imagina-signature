<?php
/**
 * Pushes a user's primary signature to Gmail.
 *
 * @package ImaginaSignatures\Deployment\Gmail
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Gmail;

use ImaginaSignatures\Deployment\DeploymentStatus;
use ImaginaSignatures\Services\SignatureService;

defined( 'ABSPATH' ) || exit;

/**
 * Writes one user's primary signature (`html_cache`, compiled and
 * sanitised by the server) into their Gmail send-as settings.
 *
 * Skip rules, in order:
 *  1. no service account stored              → `not_configured`
 *  2. no such user / no valid email          → `user_not_found` / `no_email`
 *  3. address outside the allowed domains    → `domain_not_allowed`
 *  4. no signature                           → `no_signature`
 *  5. no HTML, or it predates the last edit  → `needs_recompile`
 *  6. same `html_hash` already pushed OK     → `up_to_date` (unless forced)
 *
 * Then the HTML is PATCHed onto the user's own address (the primary
 * send-as) and, with the "aliases" toggle, onto every verified alias in
 * an allowed domain. The outcome is recorded in
 * {@see DeploymentStatus} channel `gmail`:
 * `{at, hash, error|null, error_code, status, message, checked_at, send_as, signature_id, retries}`
 * — `at` / `hash` only move on success, so the team console can always
 * compare the deployed hash with the current one.
 *
 * Every outcome fires `imgsig/gmail/push_completed` (the scheduler uses
 * it to retry temporary failures).
 *
 * Not `final` so PHPUnit can double it.
 *
 * @since 1.3.0
 */
class GmailPusher {

	/** DeploymentStatus channel. */
	public const CHANNEL = 'gmail';

	/** Gmail's signature limit (characters, HTML included). */
	public const MAX_SIGNATURE_LENGTH = 10000;

	/**
	 * @var GmailSettings
	 */
	private GmailSettings $settings;

	/**
	 * @var GmailApi
	 */
	private GmailApi $api;

	/**
	 * @var SignatureService
	 */
	private SignatureService $signatures;

	/**
	 * @param GmailSettings    $settings   Settings.
	 * @param GmailApi         $api        Gmail API client.
	 * @param SignatureService $signatures Resolves each user's primary signature.
	 */
	public function __construct( GmailSettings $settings, GmailApi $api, SignatureService $signatures ) {
		$this->settings   = $settings;
		$this->api        = $api;
		$this->signatures = $signatures;
	}

	/**
	 * Pushes one user's primary signature.
	 *
	 * @since 1.3.0
	 *
	 * @param int  $user_id User.
	 * @param bool $force   Push even when the same HTML was already pushed.
	 *
	 * @return PushResult
	 */
	public function push_user( int $user_id, bool $force = false ): PushResult {
		$result = $this->run( $user_id, $force );

		/**
		 * Fires after every Gmail push attempt (including skips).
		 *
		 * @since 1.3.0
		 *
		 * @param PushResult $result Outcome.
		 */
		do_action( 'imgsig/gmail/push_completed', $result );

		return $result;
	}

	/**
	 * Push implementation.
	 *
	 * @param int  $user_id User.
	 * @param bool $force   Ignore the same-hash rule.
	 *
	 * @return PushResult
	 */
	private function run( int $user_id, bool $force ): PushResult {
		if ( ! $this->settings->is_configured() ) {
			return new PushResult( $user_id, PushResult::NOT_CONFIGURED, __( 'Google Workspace is not connected.', 'imagina-signatures' ) );
		}

		$user = $user_id > 0 ? get_userdata( $user_id ) : false;
		if ( ! $user ) {
			return new PushResult( $user_id, PushResult::USER_NOT_FOUND, __( 'This user no longer exists.', 'imagina-signatures' ) );
		}

		$email = $this->email_for( $user );
		$name  = (string) $user->display_name;

		if ( '' === $email ) {
			return $this->skip( $user_id, $email, $name, PushResult::NO_EMAIL, __( 'This user has no valid email address.', 'imagina-signatures' ) );
		}

		if ( ! $this->settings->is_domain_allowed( $email ) ) {
			return $this->skip(
				$user_id,
				$email,
				$name,
				PushResult::DOMAIN_NOT_ALLOWED,
				sprintf(
					/* translators: %s: email domain. */
					__( '%s is not one of the allowed Google Workspace domains.', 'imagina-signatures' ),
					GmailSettings::domain_of( $email )
				)
			);
		}

		$signature = $this->signatures->primary_for_user( $user_id );
		if ( null === $signature ) {
			return $this->skip( $user_id, $email, $name, PushResult::NO_SIGNATURE, __( 'This user has no signature yet.', 'imagina-signatures' ) );
		}

		$html = (string) $signature->html_cache;
		if ( ! $signature->has_html || '' === trim( $html ) || $signature->is_html_stale() ) {
			return $this->skip(
				$user_id,
				$email,
				$name,
				PushResult::NEEDS_RECOMPILE,
				__( 'Needs recompile: the signature changed after its HTML was last generated. Open and save it in the editor.', 'imagina-signatures' )
			);
		}

		$hash    = null !== $signature->html_hash && '' !== $signature->html_hash ? $signature->html_hash : hash( 'sha256', $html );
		$current = DeploymentStatus::get( $user_id )[ self::CHANNEL ] ?? [];

		if ( ! $force && is_string( $current['hash'] ?? null ) && hash_equals( $current['hash'], $hash ) && empty( $current['error'] ) ) {
			$result        = new PushResult( $user_id, PushResult::UP_TO_DATE, __( 'Already up to date in Gmail.', 'imagina-signatures' ) );
			$result->email = $email;
			$result->name  = $name;
			return $result;
		}

		/**
		 * Filters the HTML written to a user's Gmail signature.
		 *
		 * @since 1.3.0
		 *
		 * @param string                                $html      Compiled signature fragment.
		 * @param int                                   $user_id   User.
		 * @param \ImaginaSignatures\Models\Signature $signature Primary signature.
		 */
		$html = (string) apply_filters( 'imgsig/gmail/signature_html', $html, $user_id, $signature );

		try {
			$this->assert_length( $html );

			$targets = [ $email ];
			if ( $this->settings->push_aliases() ) {
				foreach ( $this->api->list_send_as( $email ) as $address ) {
					$verified = $address['is_primary'] || 'accepted' === strtolower( $address['verification_status'] );
					if ( $verified && $this->settings->is_domain_allowed( $address['email'] ) ) {
						$targets[] = $address['email'];
					}
				}
			}
			$targets = array_values( array_unique( array_map( 'strtolower', $targets ) ) );

			foreach ( $targets as $target ) {
				$this->api->update_signature( $email, $target, $html );
			}
		} catch ( GmailException $e ) {
			$result          = PushResult::failed( $user_id, $e );
			$result->email   = $email;
			$result->name    = $name;
			$result->retries = $e->is_retryable() ? (int) ( $current['retries'] ?? 0 ) + 1 : 0;

			DeploymentStatus::set(
				$user_id,
				self::CHANNEL,
				[
					'status'     => $result->status,
					'error'      => $e->getMessage(),
					'error_code' => $e->reason(),
					'message'    => '',
					'checked_at' => gmdate( 'Y-m-d H:i:s' ),
					'retries'    => $result->retries,
				]
			);
			return $result;
		}

		$now = gmdate( 'Y-m-d H:i:s' );
		DeploymentStatus::set(
			$user_id,
			self::CHANNEL,
			[
				'at'           => $now,
				'hash'         => $hash,
				'error'        => null,
				'error_code'   => null,
				'status'       => PushResult::PUSHED,
				'message'      => '',
				'checked_at'   => $now,
				'signature_id' => $signature->id,
				'send_as'      => $targets,
				'retries'      => 0,
			]
		);

		$result          = new PushResult( $user_id, PushResult::PUSHED );
		$result->email   = $email;
		$result->name    = $name;
		$result->send_as = $targets;
		return $result;
	}

	/**
	 * Records a skip (only when it differs from what is recorded, so a
	 * daily sync doesn't rewrite the same status every day) and returns
	 * the result.
	 *
	 * @param int    $user_id User.
	 * @param string $email   Address.
	 * @param string $name    Display name.
	 * @param string $status  Skip status.
	 * @param string $message Explanation.
	 *
	 * @return PushResult
	 */
	private function skip( int $user_id, string $email, string $name, string $status, string $message ): PushResult {
		$current = DeploymentStatus::get( $user_id )[ self::CHANNEL ] ?? [];
		if ( ( $current['status'] ?? '' ) !== $status || ( $current['message'] ?? '' ) !== $message || ! empty( $current['error'] ) ) {
			DeploymentStatus::set(
				$user_id,
				self::CHANNEL,
				[
					'status'     => $status,
					'message'    => $message,
					'error'      => null,
					'error_code' => null,
					'checked_at' => gmdate( 'Y-m-d H:i:s' ),
				]
			);
		}

		$result        = new PushResult( $user_id, $status, $message );
		$result->email = $email;
		$result->name  = $name;
		return $result;
	}

	/**
	 * Address used for Gmail ('' when invalid).
	 *
	 * @param \WP_User $user User.
	 *
	 * @return string
	 */
	private function email_for( $user ): string {
		/**
		 * Filters the Google Workspace address a user's signature is
		 * pushed to (default: their WordPress email). Useful when
		 * WordPress emails differ from Workspace primary addresses.
		 *
		 * @since 1.3.0
		 *
		 * @param string   $email   Address.
		 * @param \WP_User $user    User.
		 */
		$email = strtolower( trim( (string) apply_filters( 'imgsig/gmail/user_email', (string) $user->user_email, $user ) ) );
		return '' !== $email && is_email( $email ) ? $email : '';
	}

	/**
	 * Refuses HTML longer than Gmail accepts.
	 *
	 * @param string $html Signature HTML.
	 *
	 * @return void
	 *
	 * @throws GmailException When too long.
	 */
	private function assert_length( string $html ): void {
		/**
		 * Filters the longest signature (characters, HTML included) the
		 * plugin sends to Gmail. Return 0 to disable the check.
		 *
		 * @since 1.3.0
		 *
		 * @param int $max Default 10000 (Gmail's limit).
		 */
		$max    = (int) apply_filters( 'imgsig/gmail/max_signature_length', self::MAX_SIGNATURE_LENGTH );
		$length = function_exists( 'mb_strlen' ) ? mb_strlen( $html, 'UTF-8' ) : strlen( $html );

		if ( $max > 0 && $length > $max ) {
			throw new GmailException(
				GmailException::TOO_LONG,
				sprintf(
					/* translators: 1: signature length, 2: Gmail's maximum. */
					__( 'The signature HTML is %1$d characters long; Gmail accepts at most %2$d. Simplify the signature (fewer blocks or shorter texts) and save it again.', 'imagina-signatures' ),
					$length,
					$max
				)
			);
		}
	}
}
