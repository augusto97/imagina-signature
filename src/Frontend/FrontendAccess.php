<?php
/**
 * Frontend access settings model.
 *
 * @package ImaginaSignatures\Frontend
 */

declare(strict_types=1);

namespace ImaginaSignatures\Frontend;

use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Holds the persisted configuration that controls the public-facing
 * `/<slug>/` route the plugin exposes for non-admin users.
 *
 * Three knobs live in a single option:
 *
 *  - `enabled`  — master switch. When off, the rewrite rule is still
 *                 registered (so flushing rewrite rules doesn't keep
 *                 cycling on every settings change) but the dispatcher
 *                 returns a 404 instead of serving the page. Lets the
 *                 admin pause the feature without losing other settings.
 *  - `slug`     — first URL segment under the site root. Sanitised to
 *                 a-z0-9 + dashes; default `signatures`.
 *  - `roles`    — WP role slugs that receive {@see CAP_USE} on save.
 *                 Persisting the role list (instead of recalculating
 *                 from "every role that has the cap") lets the admin
 *                 explicitly opt _in_ a role, save, opt _out_ — and
 *                 see the cap removed on the next save. Default
 *                 `['subscriber']`.
 *
 * Side effects of writing this option live in {@see update()}: it
 * synchronises caps on the affected roles AND flushes rewrite rules if
 * the slug or enabled flag changed. Both are expensive enough that we
 * only fire them on real transitions.
 *
 * @since 1.0.24
 */
final class FrontendAccess {

	public const OPT_NAME = 'imgsig_frontend_access';

	/** Same regex used by WP's sanitize_title for slug parts. */
	private const SLUG_PATTERN = '/[^a-z0-9-]/';

	private const DEFAULT_SLUG = 'signatures';

	/**
	 * Roles that get the capability by default the first time this
	 * option is written. Subscribers are the obvious target — they
	 * can log into the site, they have a `wp_user_id`, but they don't
	 * have `edit_posts` (which is what the original `imgsig_use_signatures`
	 * grant required). Listing them here makes the default a one-click
	 * toggle: enable + save = subscribers can use it.
	 *
	 * @var string[]
	 */
	private const DEFAULT_ROLES = [ 'subscriber' ];

	/**
	 * Returns the current settings, with defaults filled in.
	 *
	 * Pure read — no side effects, safe to call from anywhere.
	 *
	 * @since 1.0.24
	 *
	 * @return array{enabled: bool, slug: string, roles: array<int, string>}
	 */
	public static function current(): array {
		$raw = get_option( self::OPT_NAME, [] );
		if ( ! is_array( $raw ) ) {
			$raw = [];
		}

		$slug = isset( $raw['slug'] ) && is_string( $raw['slug'] ) ? self::sanitize_slug( $raw['slug'] ) : '';
		if ( '' === $slug ) {
			$slug = self::DEFAULT_SLUG;
		}

		$roles = isset( $raw['roles'] ) && is_array( $raw['roles'] ) ? self::sanitize_roles( $raw['roles'] ) : null;
		if ( null === $roles ) {
			$roles = self::DEFAULT_ROLES;
		}

		return [
			'enabled' => ! empty( $raw['enabled'] ),
			'slug'    => $slug,
			'roles'   => $roles,
		];
	}

	/**
	 * Writes new settings + applies side effects.
	 *
	 * Synchronises caps on the role list AND flushes rewrite rules if
	 * the slug or enabled flag transitioned. Returns the post-write
	 * snapshot so callers can echo it back without a second read.
	 *
	 * @since 1.0.24
	 *
	 * @param array<string, mixed> $next New (untrusted) settings.
	 *
	 * @return array{enabled: bool, slug: string, roles: array<int, string>}
	 */
	public static function update( array $next ): array {
		$previous = self::current();

		$slug = isset( $next['slug'] ) && is_string( $next['slug'] ) ? self::sanitize_slug( $next['slug'] ) : '';
		if ( '' === $slug ) {
			$slug = $previous['slug'];
		}

		$roles = isset( $next['roles'] ) && is_array( $next['roles'] )
			? self::sanitize_roles( $next['roles'] )
			: $previous['roles'];

		$settings = [
			'enabled' => ! empty( $next['enabled'] ),
			'slug'    => $slug,
			'roles'   => $roles,
		];

		update_option( self::OPT_NAME, $settings, false );

		// Sync the capability across the role registry so the role
		// list in the option is the source of truth.
		( new CapabilitiesInstaller() )->sync_use_roles( $roles );

		// A slug or enabled-flag change moves the rewrite rule, so
		// permalinks must be re-flushed. Role-only changes don't move
		// any rule — skip the flush in that case (it's expensive on
		// large sites).
		if ( $previous['slug'] !== $settings['slug'] || $previous['enabled'] !== $settings['enabled'] ) {
			// Ask the router to register its rules under the new slug
			// first, then flush. Without re-registering, `flush_rewrite_rules`
			// only commits whatever's currently registered against the
			// PREVIOUS slug — the new URL would 404 until the next page
			// load triggered `init`.
			FrontendRouter::register_rewrite_rules();
			flush_rewrite_rules( false );
		}

		return $settings;
	}

	/**
	 * Quick read helpers — used by the router + the asset enqueuer
	 * to avoid duplicating the array-shape access.
	 *
	 * @since 1.0.24
	 */
	public static function is_enabled(): bool {
		return self::current()['enabled'];
	}

	public static function slug(): string {
		return self::current()['slug'];
	}

	/**
	 * @return array<int, string>
	 */
	public static function roles(): array {
		return self::current()['roles'];
	}

	/**
	 * URL to the public dashboard (signature list).
	 *
	 * @since 1.0.24
	 */
	public static function dashboard_url(): string {
		return esc_url_raw( home_url( '/' . self::slug() . '/' ) );
	}

	/**
	 * URL to the public editor for a given signature id (use `{id}`
	 * as a placeholder for the React side to interpolate, or pass
	 * a real id for server-side rendering).
	 *
	 * @since 1.0.24
	 *
	 * @param int|string $signature_id Numeric id or `{id}` placeholder.
	 *
	 * @return string
	 */
	public static function editor_url( $signature_id ): string {
		return esc_url_raw( home_url( '/' . self::slug() . '/editor/' . (string) $signature_id . '/' ) );
	}

	/**
	 * Lowercase + restrict to a-z0-9 dash, collapse repeated dashes,
	 * trim leading/trailing dashes. Returns empty string for inputs
	 * that don't survive — the caller falls back to a default.
	 *
	 * @since 1.0.24
	 */
	private static function sanitize_slug( string $value ): string {
		$value = strtolower( trim( $value ) );
		$value = (string) preg_replace( self::SLUG_PATTERN, '-', $value );
		$value = (string) preg_replace( '/-+/', '-', $value );
		$value = trim( $value, '-' );
		return $value;
	}

	/**
	 * Keep only role slugs that actually exist in this WordPress
	 * install. Refusing unknown role slugs avoids silently writing
	 * orphan caps that no role can grant.
	 *
	 * @param array<int, mixed> $raw Untrusted role list.
	 *
	 * @return array<int, string>
	 */
	private static function sanitize_roles( array $raw ): array {
		$known = array_keys( wp_roles()->roles );
		$out   = [];
		$seen  = [];
		foreach ( $raw as $value ) {
			if ( ! is_string( $value ) ) {
				continue;
			}
			$slug = sanitize_key( $value );
			if ( '' === $slug || ! in_array( $slug, $known, true ) ) {
				continue;
			}
			if ( isset( $seen[ $slug ] ) ) {
				continue;
			}
			$seen[ $slug ] = true;
			$out[]         = $slug;
		}
		return $out;
	}
}
