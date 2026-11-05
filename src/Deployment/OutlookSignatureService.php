<?php
/**
 * Resolves the signature the Outlook add-in inserts for a mailbox.
 *
 * @package ImaginaSignatures\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment;

use ImaginaSignatures\Services\SignatureService;

defined( 'ABSPATH' ) || exit;

/**
 * Maps the add-in's `userProfile.emailAddress` to a WordPress user and
 * returns that user's deployable HTML: the primary signature
 * ({@see SignatureService::primary_for_user()}) when its server-held
 * compiled HTML (`html_cache`) exists. Outdated HTML (compiled before
 * the last edit or before the owner's profile / a site-wide input
 * changed) is still served — the last compiled copy beats inserting
 * nothing — and is replaced as soon as a browser recompiles it.
 *
 * Anything else — unknown email, no signature, never-compiled, empty or
 * oversized HTML —
 * resolves to null, which the controller turns into the same 404, so
 * the endpoint never tells a caller more than "there is a signature for
 * this address" or not.
 *
 * Also records the delivery in {@see DeploymentStatus} (`outlook`
 * channel, `{at, hash}`), throttled: the row is written when the
 * delivered hash changes, or at most once per {@see STATUS_THROTTLE}
 * seconds otherwise — every compose window calls the endpoint (modulo
 * the add-in's one-hour cache) and user meta writes aren't free.
 *
 * Not `final` so PHPUnit can double it.
 *
 * @since 1.3.0
 */
class OutlookSignatureService {

	/** `setSignatureAsync()` rejects signatures longer than this (UTF-16 code units). */
	public const MAX_SIGNATURE_CHARS = 30000;

	/** Minimum seconds between two status writes for the same HTML. */
	public const STATUS_THROTTLE = 3600;

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
	 * The WordPress user whose `user_email` matches `$email`
	 * case-insensitively, or null.
	 *
	 * @since 1.3.0
	 *
	 * @param string $email Address reported by Outlook.
	 *
	 * @return \WP_User|null
	 */
	public function find_user( string $email ): ?\WP_User {
		$email = trim( $email );
		if ( '' === $email || strlen( $email ) > 254 || ! is_email( $email ) ) {
			return null;
		}

		$lower = strtolower( $email );
		$user  = get_user_by( 'email', $lower );
		if ( ! $user instanceof \WP_User && $lower !== $email ) {
			// Case-sensitive collations: try the address as Outlook sent it.
			$user = get_user_by( 'email', $email );
		}
		if ( $user instanceof \WP_User && 0 !== strcasecmp( (string) $user->user_email, $email ) ) {
			$user = null;
		}

		/**
		 * Filters the user the Outlook add-in resolves for a mailbox
		 * address — map aliases / proxy addresses to the right account,
		 * or return null to refuse one.
		 *
		 * @since 1.3.0
		 *
		 * @param \WP_User|null $user  Matched user (null when none).
		 * @param string        $email Lower-cased address from Outlook.
		 */
		$user = apply_filters( 'imgsig/outlook/user_for_email', $user instanceof \WP_User ? $user : null, $lower );

		return $user instanceof \WP_User ? $user : null;
	}

	/**
	 * The deployable signature for `$email`.
	 *
	 * @since 1.3.0
	 *
	 * @param string $email Address reported by Outlook.
	 *
	 * @return array{user_id: int, html: string, hash: string}|null
	 */
	public function resolve( string $email ): ?array {
		$user = $this->find_user( $email );
		if ( null === $user ) {
			return null;
		}

		$signature = $this->signatures->primary_for_user( (int) $user->ID );
		if ( null === $signature || null === $signature->html_cache ) {
			return null;
		}

		$html = (string) $signature->html_cache;
		if ( '' === trim( $html ) || self::utf16_length( $html ) > self::MAX_SIGNATURE_CHARS ) {
			return null;
		}

		$hash = null !== $signature->html_hash && '' !== $signature->html_hash
			? (string) $signature->html_hash
			: hash( 'sha256', $html );

		return [
			'user_id' => (int) $user->ID,
			'html'    => $html,
			'hash'    => $hash,
		];
	}

	/**
	 * Records that `$hash` was served to the user's Outlook, unless the
	 * same hash was already recorded less than {@see STATUS_THROTTLE}
	 * seconds ago.
	 *
	 * @since 1.3.0
	 *
	 * @param int    $user_id User.
	 * @param string $hash    Delivered `html_hash`.
	 *
	 * @return bool True when the status row was written.
	 */
	public function record_delivery( int $user_id, string $hash ): bool {
		$now      = $this->now();
		$status   = DeploymentStatus::get( $user_id );
		$previous = $status['outlook'] ?? [];

		$prev_hash = isset( $previous['hash'] ) ? (string) $previous['hash'] : '';
		$prev_at   = isset( $previous['at'] ) ? strtotime( (string) $previous['at'] . ' UTC' ) : false;

		if ( $prev_hash === $hash && false !== $prev_at && ( $now - $prev_at ) < self::STATUS_THROTTLE ) {
			return false;
		}

		DeploymentStatus::set(
			$user_id,
			'outlook',
			[
				'at'    => gmdate( 'Y-m-d H:i:s', $now ),
				'hash'  => $hash,
				'error' => '',
			]
		);
		return true;
	}

	/**
	 * Length of `$text` as JavaScript counts it (UTF-16 code units).
	 *
	 * @param string $text UTF-8 text.
	 *
	 * @return int
	 */
	public static function utf16_length( string $text ): int {
		if ( function_exists( 'mb_convert_encoding' ) ) {
			$utf16 = mb_convert_encoding( $text, 'UTF-16LE', 'UTF-8' );
			if ( is_string( $utf16 ) ) {
				return (int) ( strlen( $utf16 ) / 2 );
			}
		}
		// Byte length never under-counts.
		return strlen( $text );
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
