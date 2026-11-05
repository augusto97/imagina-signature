<?php
/**
 * Everything outside a signature that its compiled HTML depends on.
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

use ImaginaSignatures\Api\Controllers\SiteSettingsController;
use ImaginaSignatures\Directory\Groups;
use ImaginaSignatures\Directory\ProfileFields;
use ImaginaSignatures\Settings\SystemVariables;

defined( 'ABSPATH' ) || exit;

/**
 * The compile inputs of ONE signature owner, exactly as their own
 * editor receives them in `IMGSIG_EDITOR_CONFIG` (1.3.0):
 *
 *  - `systemVariables`  `wp_*` user fields, profile fields, `company_*`
 *                       ({@see SystemVariables::for_user()});
 *  - `complianceFooter` the footer of their first group with an override,
 *                       else the site-wide one;
 *  - `bannerCampaigns`  campaigns active today and targeted at them;
 *  - `profileFields`    the profile field definitions (which keys a
 *                       non-empty profile value wins for);
 *  - `locale`           their locale (`lang` / `dir` of the output).
 *
 * Shared by the editor bootstrap (own signature or "edit on behalf") and
 * the team console's render context, so a signature recompiled by an
 * administrator matches what its owner's editor would produce.
 * {@see fingerprint()} lets a store request detect inputs that changed
 * while the browser was compiling.
 *
 * @since 1.3.0
 */
final class RenderInputs {

	/**
	 * The owner's compile inputs.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_User                  $owner Signature owner.
	 * @param array<string, mixed>|null $site  {@see SiteSettingsController::current_settings()} (null reads it).
	 *
	 * @return array{systemVariables: array<string, string>, complianceFooter: array{enabled: bool, html: string}, bannerCampaigns: array<int, array<string, mixed>>, profileFields: array<int, array<string, mixed>>, locale: string}
	 */
	public static function for_user( \WP_User $owner, ?array $site = null ): array {
		$site    = null === $site ? SiteSettingsController::current_settings() : $site;
		$user_id = (int) $owner->ID;

		return [
			'systemVariables'  => SystemVariables::for_user( $owner, $site['brand_kit'] ?? null ),
			'complianceFooter' => Groups::effective_compliance_footer( $user_id, $site['compliance_footer'] ?? null ),
			'bannerCampaigns'  => SiteSettingsController::active_banner_campaigns( $user_id ),
			'profileFields'    => ProfileFields::public_definitions(),
			'locale'           => (string) get_user_locale( $user_id ),
		];
	}

	/**
	 * Stable fingerprint of the parts of `$inputs` that reach the output
	 * (labels of profile fields don't).
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed> $inputs {@see for_user()}.
	 *
	 * @return string SHA-256 hex.
	 */
	public static function fingerprint( array $inputs ): string {
		$variables = is_array( $inputs['systemVariables'] ?? null ) ? $inputs['systemVariables'] : [];
		ksort( $variables );

		$profile_keys = [];
		foreach ( is_array( $inputs['profileFields'] ?? null ) ? $inputs['profileFields'] : [] as $field ) {
			if ( is_array( $field ) && isset( $field['key'] ) ) {
				$profile_keys[] = (string) $field['key'];
			}
		}

		$campaigns = [];
		foreach ( is_array( $inputs['bannerCampaigns'] ?? null ) ? $inputs['bannerCampaigns'] : [] as $campaign ) {
			if ( is_array( $campaign ) ) {
				$campaigns[] = [
					(string) ( $campaign['id'] ?? '' ),
					(string) ( $campaign['image_url'] ?? '' ),
					(string) ( $campaign['link_url'] ?? '' ),
					(string) ( $campaign['alt'] ?? '' ),
					(int) ( $campaign['width'] ?? 0 ),
				];
			}
		}

		$footer = is_array( $inputs['complianceFooter'] ?? null ) ? $inputs['complianceFooter'] : [];

		$canonical = wp_json_encode(
			[
				'v' => $variables,
				'p' => $profile_keys,
				'c' => $campaigns,
				'f' => [ ! empty( $footer['enabled'] ), (string) ( $footer['html'] ?? '' ) ],
				'l' => (string) ( $inputs['locale'] ?? '' ),
			]
		);

		return hash( 'sha256', is_string( $canonical ) ? $canonical : '' );
	}
}
