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
	public const OPT_BANNER_CAMPAIGNS  = 'imgsig_banner_campaigns';

	public const MAX_PALETTE_SIZE   = 12;
	public const MAX_CAMPAIGNS      = 50;
	public const MAX_CAMPAIGN_WIDTH = 800;

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

		if ( null !== $request->get_param( 'banner_campaigns' ) ) {
			$raw = (array) $request->get_param( 'banner_campaigns' );
			$campaigns = self::sanitize_campaigns( $raw );
			update_option( self::OPT_BANNER_CAMPAIGNS, wp_json_encode( $campaigns ), false );
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
			'banner_campaigns'  => self::current_banner_campaigns(),
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

	/**
	 * Returns the full stored campaign list (admin view — includes
	 * disabled and out-of-window entries).
	 *
	 * @since 1.0.15
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public static function current_banner_campaigns(): array {
		$raw = get_option( self::OPT_BANNER_CAMPAIGNS, '' );
		if ( ! is_string( $raw ) || '' === $raw ) {
			return [];
		}
		$decoded = json_decode( $raw, true );
		if ( ! is_array( $decoded ) ) {
			return [];
		}
		return self::sanitize_campaigns( $decoded );
	}

	/**
	 * Returns only campaigns that are enabled AND inside their date
	 * window (or have no window). Used by the editor bootstrap so the
	 * compile pipeline doesn't have to know about scheduling.
	 *
	 * @since 1.0.15
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public static function active_banner_campaigns(): array {
		$today = current_time( 'Y-m-d' );

		return array_values(
			array_filter(
				self::current_banner_campaigns(),
				static function ( array $c ) use ( $today ): bool {
					if ( empty( $c['enabled'] ) ) {
						return false;
					}
					if ( ! empty( $c['start_date'] ) && (string) $c['start_date'] > $today ) {
						return false;
					}
					if ( ! empty( $c['end_date'] ) && (string) $c['end_date'] < $today ) {
						return false;
					}
					if ( empty( $c['image_url'] ) ) {
						return false;
					}
					return true;
				}
			)
		);
	}

	/**
	 * Normalise the campaign list — drops invalid entries, fills in
	 * defaults, caps total length at MAX_CAMPAIGNS.
	 *
	 * Each output campaign is a strict shape:
	 *   { id, name, enabled, image_url, link_url, alt, width,
	 *     start_date, end_date }
	 *
	 * @since 1.0.15
	 *
	 * @param array<int, mixed> $raw Untrusted input.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	private static function sanitize_campaigns( array $raw ): array {
		$out = [];
		foreach ( $raw as $entry ) {
			if ( ! is_array( $entry ) ) {
				continue;
			}

			$image_url = isset( $entry['image_url'] ) ? esc_url_raw( (string) $entry['image_url'] ) : '';
			if ( '' === $image_url ) {
				// A campaign without an image has nothing to render.
				continue;
			}

			$width = isset( $entry['width'] ) ? (int) $entry['width'] : 600;
			$width = max( 100, min( self::MAX_CAMPAIGN_WIDTH, $width ) );

			$out[] = [
				'id'         => isset( $entry['id'] ) ? sanitize_key( (string) $entry['id'] ) : self::generate_campaign_id(),
				'name'       => isset( $entry['name'] ) ? sanitize_text_field( (string) $entry['name'] ) : '',
				'enabled'    => ! empty( $entry['enabled'] ),
				'image_url'  => $image_url,
				'link_url'   => isset( $entry['link_url'] ) ? esc_url_raw( (string) $entry['link_url'] ) : '',
				'alt'        => isset( $entry['alt'] ) ? sanitize_text_field( (string) $entry['alt'] ) : '',
				'width'      => $width,
				'start_date' => self::sanitize_date( $entry['start_date'] ?? null ),
				'end_date'   => self::sanitize_date( $entry['end_date'] ?? null ),
			];

			if ( count( $out ) >= self::MAX_CAMPAIGNS ) {
				break;
			}
		}
		return $out;
	}

	/**
	 * @param mixed $value Raw input.
	 *
	 * @return string Empty string when invalid.
	 */
	private static function sanitize_date( $value ): string {
		if ( ! is_string( $value ) || '' === $value ) {
			return '';
		}
		// Accept YYYY-MM-DD only — keeps date arithmetic simple.
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $value ) ) {
			return '';
		}
		return $value;
	}

	private static function generate_campaign_id(): string {
		return 'camp_' . substr( md5( uniqid( '', true ) ), 0, 12 );
	}
}
