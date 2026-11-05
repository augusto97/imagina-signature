<?php
/**
 * Per-user install-link tokens.
 *
 * @package ImaginaSignatures\Deployment\Install
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Install;

use ImaginaSignatures\Frontend\FrontendAccess;
use ImaginaSignatures\Frontend\FrontendRouter;

defined( 'ABSPATH' ) || exit;

/**
 * Owns the secret behind each user's personal install link
 * (`/<frontend slug>/install/<token>/`).
 *
 * The token IS the credential of the public install page and of the
 * "I've installed it" endpoint — no login is required there — so:
 *
 *  - it is 32 random bytes from `random_bytes()`, hex-encoded (64
 *    lowercase hex characters, {@see PATTERN});
 *  - it is created lazily (first invitation, first "Install" click) and
 *    stored in the user meta {@see META_KEY};
 *  - any malformed value is rejected before touching the database;
 *  - the database lookup only finds the candidate row: the match is
 *    confirmed with `hash_equals()` (constant-time) against the stored
 *    value;
 *  - regenerating it (by the user, or by a team manager) immediately
 *    invalidates every link sent before.
 *
 * @since 1.3.0
 */
final class InstallTokens {

	/**
	 * User meta key holding the token.
	 */
	public const META_KEY = 'imgsig_install_token';

	/**
	 * Exact token format.
	 */
	public const PATTERN = '/^[a-f0-9]{64}\z/';

	/**
	 * Random bytes per token.
	 */
	private const BYTES = 32;

	/**
	 * True when `$token` has the exact token format.
	 *
	 * @since 1.3.0
	 *
	 * @param string $token Candidate.
	 *
	 * @return bool
	 */
	public static function is_well_formed( string $token ): bool {
		return 1 === preg_match( self::PATTERN, $token );
	}

	/**
	 * A fresh random token.
	 *
	 * @since 1.3.0
	 *
	 * @return string
	 */
	public static function generate(): string {
		return bin2hex( random_bytes( self::BYTES ) );
	}

	/**
	 * The user's current token, or '' when none (or a corrupt value) is stored.
	 *
	 * @since 1.3.0
	 *
	 * @param int $user_id User.
	 *
	 * @return string
	 */
	public static function get( int $user_id ): string {
		if ( $user_id <= 0 ) {
			return '';
		}
		$token = get_user_meta( $user_id, self::META_KEY, true );
		return is_string( $token ) && self::is_well_formed( $token ) ? $token : '';
	}

	/**
	 * The user's token, created on first use.
	 *
	 * @since 1.3.0
	 *
	 * @param int $user_id User.
	 *
	 * @return string
	 */
	public static function ensure( int $user_id ): string {
		$token = self::get( $user_id );
		return '' !== $token ? $token : self::regenerate( $user_id );
	}

	/**
	 * Replaces the user's token; every previously sent link stops working.
	 *
	 * @since 1.3.0
	 *
	 * @param int $user_id User.
	 *
	 * @return string The new token.
	 */
	public static function regenerate( int $user_id ): string {
		$token = self::generate();
		update_user_meta( $user_id, self::META_KEY, $token );

		/**
		 * Fires after a user's install-link token was (re)created.
		 *
		 * @since 1.3.0
		 *
		 * @param int $user_id User.
		 */
		do_action( 'imgsig/install/token_regenerated', $user_id );

		return $token;
	}

	/**
	 * The user a token belongs to (0 when it is malformed or unknown).
	 *
	 * @since 1.3.0
	 *
	 * @param string $token Untrusted token from the URL.
	 *
	 * @return int
	 */
	public static function resolve_user_id( string $token ): int {
		if ( ! self::is_well_formed( $token ) ) {
			return 0;
		}

		$ids = get_users(
			[
				'meta_key'    => self::META_KEY, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'meta_value'  => $token, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
				'number'      => 2,
				'fields'      => 'ID',
				'count_total' => false,
			]
		);

		// 256 random bits never collide; if two rows ever match, trust neither.
		if ( ! is_array( $ids ) || 1 !== count( $ids ) ) {
			return 0;
		}

		$user_id = (int) reset( $ids );
		$stored  = self::get( $user_id );

		return '' !== $stored && hash_equals( $stored, $token ) ? $user_id : 0;
	}

	/**
	 * Public URL of the install page for a token.
	 *
	 * Pretty permalinks get `/<slug>/install/<token>/`; sites on plain
	 * permalinks (no rewrite rules) get `/?imgsig_install=<token>`, which
	 * WordPress maps to the same query var.
	 *
	 * @since 1.3.0
	 *
	 * @param string $token Token.
	 *
	 * @return string
	 */
	public static function url( string $token ): string {
		if ( '' === (string) get_option( 'permalink_structure', '' ) ) {
			return esc_url_raw( add_query_arg( FrontendRouter::QV_INSTALL, $token, home_url( '/' ) ) );
		}
		return esc_url_raw( home_url( '/' . FrontendAccess::slug() . '/install/' . $token . '/' ) );
	}

	/**
	 * The user's install URL, creating the token when needed.
	 *
	 * @since 1.3.0
	 *
	 * @param int $user_id User.
	 *
	 * @return string
	 */
	public static function url_for_user( int $user_id ): string {
		return self::url( self::ensure( $user_id ) );
	}
}
