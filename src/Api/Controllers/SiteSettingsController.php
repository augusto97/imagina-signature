<?php
/**
 * Site-wide settings (branding + compliance).
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Api\Middleware\CapabilityCheck;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Site-wide settings endpoint at `/admin/site-settings`.
 *
 * Bundles two related but independent option groups so the admin
 * Settings page can render them as a single round-trip:
 *
 *  - **Brand palette** — array of up to 12 hex strings exposed in
 *    every editor's ColorInput as quick-pick swatches. Stored in
 *    the `imgsig_brand_palette` option as a JSON-encoded string
 *    array.
 *  - **Compliance footer** — toggle + HTML snippet appended at the
 *    very end of every compiled signature. Useful for GDPR /
 *    CAN-SPAM disclaimers an admin wants to enforce site-wide
 *    without trusting every user to add their own Disclaimer block.
 *    Stored in the `imgsig_compliance_footer` option as an array.
 *
 * Read access is gated on `imgsig_use_signatures` so the editor
 * (which runs as an end user, not an admin) can fetch the same
 * payload at boot — those endpoints only expose the read path,
 * never the write path. Write access is gated on
 * `imgsig_manage_storage` (the existing "site admin" cap).
 *
 * @since 1.0.13
 */
final class SiteSettingsController extends BaseController {

	public const OPT_BRAND_PALETTE     = 'imgsig_brand_palette';
	public const OPT_COMPLIANCE_FOOTER = 'imgsig_compliance_footer';

	public const MAX_PALETTE_SIZE = 12;

	/**
	 * @inheritDoc
	 */
	public function register_routes(): void {
		$require_use   = CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_USE );
		$require_admin = CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_MANAGE_STORAGE );

		register_rest_route(
			self::NAMESPACE,
			'/admin/site-settings',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'show' ],
					'permission_callback' => $require_use,
				],
				[
					'methods'             => 'PATCH',
					'callback'            => [ $this, 'update' ],
					'permission_callback' => $require_admin,
				],
			]
		);
	}

	/**
	 * `GET /admin/site-settings`.
	 *
	 * @since 1.0.13
	 *
	 * @return \WP_REST_Response
	 */
	public function show(): \WP_REST_Response {
		return rest_ensure_response( self::current_settings() );
	}

	/**
	 * `PATCH /admin/site-settings`.
	 *
	 * @since 1.0.13
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function update( \WP_REST_Request $request ) {
		if ( null !== $request->get_param( 'brand_palette' ) ) {
			$palette = (array) $request->get_param( 'brand_palette' );
			$palette = self::sanitize_palette( $palette );
			update_option( self::OPT_BRAND_PALETTE, wp_json_encode( $palette ), false );
		}

		if ( null !== $request->get_param( 'compliance_footer' ) ) {
			$raw = (array) $request->get_param( 'compliance_footer' );
			$footer = [
				'enabled' => ! empty( $raw['enabled'] ),
				'html'    => isset( $raw['html'] ) ? self::sanitize_compliance_html( (string) $raw['html'] ) : '',
			];
			update_option( self::OPT_COMPLIANCE_FOOTER, $footer, false );
		}

		return rest_ensure_response( self::current_settings() );
	}

	/**
	 * Reads + decodes the current option values. Public + static so
	 * the asset enqueuers can inject the same payload into the
	 * editor / admin bootstrap without round-tripping through REST.
	 *
	 * @since 1.0.13
	 *
	 * @return array<string, mixed>
	 */
	public static function current_settings(): array {
		return [
			'brand_palette'     => self::current_palette(),
			'compliance_footer' => self::current_compliance_footer(),
		];
	}

	/**
	 * @return array<int, string>
	 */
	public static function current_palette(): array {
		$raw = get_option( self::OPT_BRAND_PALETTE, '' );
		if ( ! is_string( $raw ) || '' === $raw ) {
			return [];
		}
		$decoded = json_decode( $raw, true );
		if ( ! is_array( $decoded ) ) {
			return [];
		}
		return self::sanitize_palette( $decoded );
	}

	/**
	 * @return array{enabled: bool, html: string}
	 */
	public static function current_compliance_footer(): array {
		$raw = get_option( self::OPT_COMPLIANCE_FOOTER, [] );
		if ( ! is_array( $raw ) ) {
			$raw = [];
		}
		return [
			'enabled' => ! empty( $raw['enabled'] ),
			'html'    => isset( $raw['html'] ) ? (string) $raw['html'] : '',
		];
	}

	/**
	 * Drop non-hex entries, dedupe, cap at MAX_PALETTE_SIZE.
	 *
	 * @since 1.0.13
	 *
	 * @param array<int, mixed> $palette Raw input.
	 *
	 * @return array<int, string>
	 */
	private static function sanitize_palette( array $palette ): array {
		$out  = [];
		$seen = [];
		foreach ( $palette as $value ) {
			if ( ! is_string( $value ) ) {
				continue;
			}
			$value = trim( $value );
			if ( ! preg_match( '/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/', $value ) ) {
				continue;
			}
			$normal = strtolower( $value );
			if ( isset( $seen[ $normal ] ) ) {
				continue;
			}
			$seen[ $normal ] = true;
			$out[]           = $normal;
			if ( count( $out ) >= self::MAX_PALETTE_SIZE ) {
				break;
			}
		}
		return $out;
	}

	/**
	 * Strict allowlist of HTML for the compliance footer.
	 *
	 * Reuses `wp_kses_post` because the footer is admin-authored
	 * site-wide content (capability `imgsig_manage_storage`); the
	 * post-content allowlist is the right level — block / paragraph
	 * tags + safe inline formatting + links, no scripts.
	 *
	 * @since 1.0.13
	 *
	 * @param string $html Raw HTML from the admin.
	 *
	 * @return string
	 */
	private static function sanitize_compliance_html( string $html ): string {
		return wp_kses_post( $html );
	}
}
