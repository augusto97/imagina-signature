<?php
/**
 * Read-only variables injected into the editor bootstrap.
 *
 * @package ImaginaSignatures\Settings
 */

declare(strict_types=1);

namespace ImaginaSignatures\Settings;

use ImaginaSignatures\Directory\ProfileFields;

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
 *  - profile keys (1.3.0) — `job_title`, `phone`, … and the admin's
 *                  custom fields, unprefixed, '' when missing
 *                  ({@see ProfileFields::values_for()}). In the editor a
 *                  NON-EMPTY profile value wins over the signature's own
 *                  variable of the same name (templates ship examples);
 *  - `company_*` — from the site-wide brand kit ({@see BrandKit::company_variables()}),
 *                  always present (empty string when blank) so the
 *                  tokens resolve instead of shipping as `{{…}}`.
 *
 * The `imgsig/editor/system_variables` filter runs AFTER the merge, so a
 * host plugin sees (and can override or remove) the company and profile
 * variables too. Signature-defined variables still win on key conflict
 * at compile time, except for non-empty profile values (see above).
 *
 * @since 1.2.0
 */
final class SystemVariables {

	/**
	 * System variables for `$user`.
	 *
	 * @since 1.2.0
	 * @since 1.3.0 Adds the user's profile fields ({@see ProfileFields::values_for()}).
	 *
	 * @param \WP_User                   $user    The user the editor is bound to.
	 * @param array<string, mixed>|null  $kit     Brand kit (null reads the stored one).
	 * @param array<string, string>|null $profile Resolved profile values (null resolves them).
	 *
	 * @return array<string, string>
	 */
	public static function for_user( \WP_User $user, ?array $kit = null, ?array $profile = null ): array {
		$base = array_merge(
			[
				'wp_display_name' => (string) $user->display_name,
				'wp_email'        => (string) $user->user_email,
				'wp_first_name'   => (string) $user->first_name,
				'wp_last_name'    => (string) $user->last_name,
				'wp_url'          => (string) $user->user_url,
			],
			// 1.3.0: profile fields under their own keys (job_title, phone,
			// custom fields…), '' when missing — see ProfileFields.
			null === $profile ? ProfileFields::values_for( (int) $user->ID ) : $profile,
			BrandKit::company_variables( $kit )
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
}
