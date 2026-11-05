<?php
/**
 * Read-only variables injected into the editor bootstrap.
 *
 * @package ImaginaSignatures\Settings
 */

declare(strict_types=1);

namespace ImaginaSignatures\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * Builds `IMGSIG_EDITOR_CONFIG.systemVariables` — the read-only
 * variables the compiler (and the canvas, when it shows live data)
 * substitutes alongside the signature's own `{{variables}}`.
 *
 * Shared by both editor bootstraps (wp-admin `EditorAssetEnqueuer` and
 * the public route's `FrontendPage`) so they can never drift apart.
 *
 *  - `wp_*`      — from the current WordPress user record;
 *  - `company_*` — from the site-wide brand kit ({@see BrandKit::company_variables()}),
 *                  always present (empty string when blank) so the
 *                  tokens resolve instead of shipping as `{{…}}`;
 *  - `imgsig_assets_url` — absolute URL of the plugin's `assets/`
 *                  folder, so shipped templates reference their
 *                  placeholder images as
 *                  `{{imgsig_assets_url}}/templates/avatar-1.png`
 *                  and never hard-code a host. Internal: the editor
 *                  hides `imgsig_*` keys from its field pickers.
 *
 * The `imgsig/editor/system_variables` filter runs AFTER the merge, so a
 * host plugin sees (and can override or remove) the company variables
 * too. Signature-defined variables still win on key conflict at
 * compile time.
 *
 * @since 1.2.0
 */
final class SystemVariables {

	/**
	 * System variables for `$user`.
	 *
	 * @since 1.2.0
	 *
	 * @param \WP_User                  $user The user the editor is bound to.
	 * @param array<string, mixed>|null $kit  Brand kit (null reads the stored one).
	 *
	 * @return array<string, string>
	 */
	public static function for_user( \WP_User $user, ?array $kit = null ): array {
		$base = array_merge(
			[
				'wp_display_name' => (string) $user->display_name,
				'wp_email'        => (string) $user->user_email,
				'wp_first_name'   => (string) $user->first_name,
				'wp_last_name'    => (string) $user->last_name,
				'wp_url'          => (string) $user->user_url,
			],
			BrandKit::company_variables( $kit ),
			[
				'imgsig_assets_url' => self::assets_url(),
			]
		);

		/**
		 * Filters the read-only system variables surfaced to the editor
		 * (`wp_*` user fields + `company_*` brand-kit fields). Add
		 * `wp_user_meta` keys here, or expose org-wide values pulled
		 * from a directory sync.
		 *
		 * @since 1.0.13
		 * @since 1.2.0 Receives the `company_*` brand-kit variables too.
		 *
		 * @param array<string, string> $base    Default variables.
		 * @param int                   $user_id The user the editor is bound to.
		 */
		$filtered = apply_filters( 'imgsig/editor/system_variables', $base, $user->ID );

		// The filter must not smuggle non-strings into the bag.
		$out = [];
		foreach ( (array) $filtered as $key => $value ) {
			if ( is_string( $key ) && ( is_string( $value ) || is_numeric( $value ) ) ) {
				$out[ $key ] = (string) $value;
			}
		}
		return $out;
	}

	/**
	 * Absolute URL of the plugin's `assets/` folder, without a trailing
	 * slash — the value of the `imgsig_assets_url` system variable.
	 *
	 * @since 1.2.0
	 *
	 * @return string
	 */
	public static function assets_url(): string {
		if ( ! defined( 'IMGSIG_FILE' ) ) {
			return '';
		}
		return untrailingslashit( esc_url_raw( plugins_url( 'assets', IMGSIG_FILE ) ) );
	}
}
