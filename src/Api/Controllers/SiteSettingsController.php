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
					// Accept POST / PUT / PATCH (`WP_REST_Server::EDITABLE`)
					// rather than just PATCH. Some shared-hosting WAFs
					// (LiteSpeed default profile, mod_security CRS,
					// certain Cloudflare configs) silently strip PATCH
					// at the proxy layer — the request never reaches
					// WordPress and "Save" silently noops, which is
					// what the user reported as "no guarda los colores
					// de branding". POST is universally accepted, so
					// the frontend can fall back when PATCH fails.
					'methods'             => \WP_REST_Server::EDITABLE,
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
		// Persist directly as PHP arrays — WordPress's `update_option`
		// runs `maybe_serialize` automatically. The previous code stored
		// `wp_json_encode($palette)` as a string, which roundtripped
		// through an extra encode/decode layer for no benefit and made
		// silent corruption hard to spot. Switching to native arrays
		// also matches how `compliance_footer` was always stored.
		//
		// `update_option` returns `false` in two distinct situations:
		//  (a) the new value is identical to the stored value (no-op),
		//  (b) the write actually failed.
		// Telling them apart matters for the diagnostic log below — we
		// compare the pre-write value against the post-sanitize value
		// to figure out which case we're in.
		if ( null !== $request->get_param( 'brand_palette' ) ) {
			$palette  = self::sanitize_palette( (array) $request->get_param( 'brand_palette' ) );
			$previous = self::current_palette();
			$updated  = update_option( self::OPT_BRAND_PALETTE, $palette, false );
			self::log_update( 'brand_palette', $previous, $palette, $updated );
		}

		if ( null !== $request->get_param( 'compliance_footer' ) ) {
			$raw    = (array) $request->get_param( 'compliance_footer' );
			$footer = [
				'enabled' => ! empty( $raw['enabled'] ),
				'html'    => isset( $raw['html'] ) ? self::sanitize_compliance_html( (string) $raw['html'] ) : '',
			];
			$previous = self::current_compliance_footer();
			$updated  = update_option( self::OPT_COMPLIANCE_FOOTER, $footer, false );
			self::log_update( 'compliance_footer', $previous, $footer, $updated );
		}

		if ( null !== $request->get_param( 'banner_campaigns' ) ) {
			$raw       = (array) $request->get_param( 'banner_campaigns' );
			$campaigns = self::sanitize_campaigns( $raw );
			$previous  = self::current_banner_campaigns();
			$updated   = update_option( self::OPT_BANNER_CAMPAIGNS, $campaigns, false );
			self::log_update( 'banner_campaigns', $previous, $campaigns, $updated );
		}

		// Round-trip verification: read each option back and compare
		// against what we just wrote. If anything diverges (silent
		// `update_option` failure, conflicting filter, broken cache),
		// surface a 500 instead of returning a misleading "Saved" toast.
		//
		// We force a cache miss before reading. Any object cache plugin
		// (Redis, Memcached) that the host runs would otherwise hand us
		// back the value our own `update_option` call just primed — a
		// useless tautology. Deleting the cache entry first makes the
		// readback an actual database round trip, which is the only
		// thing that proves persistence to disk.
		wp_cache_delete( self::OPT_BRAND_PALETTE, 'options' );
		wp_cache_delete( self::OPT_COMPLIANCE_FOOTER, 'options' );
		wp_cache_delete( self::OPT_BANNER_CAMPAIGNS, 'options' );
		wp_cache_delete( 'alloptions', 'options' );

		$current = self::current_settings();

		if ( null !== $request->get_param( 'brand_palette' ) ) {
			$expected = self::sanitize_palette( (array) $request->get_param( 'brand_palette' ) );
			// `array_values()` normalises the keys before comparison.
			// Some object-cache backends (Redis Object Cache with
			// igbinary, certain msgpack adapters) coerce numeric array
			// keys to strings during serialise / deserialise, so a
			// strict `!==` between `[0=>'#fff']` and `['0'=>'#fff']`
			// reports a spurious "persistence failed" even though the
			// data round-tripped correctly. Comparing values + length
			// gives us the same correctness guarantee without the
			// false negative.
			if ( array_values( $expected ) !== array_values( $current['brand_palette'] ) ) {
				return new \WP_Error(
					'imgsig_brand_palette_persist_failed',
					__( 'Brand palette did not persist on the server. Check the WordPress error log for details.', 'imagina-signatures' ),
					[
						'status'   => 500,
						'sent'     => $expected,
						'readback' => $current['brand_palette'],
					]
				);
			}
		}

		if ( null !== $request->get_param( 'banner_campaigns' ) ) {
			$expected_count = count( self::sanitize_campaigns( (array) $request->get_param( 'banner_campaigns' ) ) );
			if ( count( $current['banner_campaigns'] ) !== $expected_count ) {
				return new \WP_Error(
					'imgsig_banner_campaigns_persist_failed',
					__( 'Banner campaigns did not persist on the server.', 'imagina-signatures' ),
					[
						'status'   => 500,
						'expected' => $expected_count,
						'readback' => count( $current['banner_campaigns'] ),
					]
				);
			}
		}

		return rest_ensure_response( $current );
	}

	/**
	 * Diagnostic log for `update_option` calls. Only fires when
	 * `WP_DEBUG` is on — keeps production logs clean while giving us
	 * a paper trail when a user reports "the colours don't save".
	 *
	 * Logs every save with: option name, whether the value actually
	 * changed, and `update_option`'s raw return value. The combination
	 * tells us which of the three failure modes we're in:
	 *
	 *  - no-op (previous === next, update_option returned false): fine.
	 *  - write succeeded (previous !== next, returned true): fine.
	 *  - write failed (previous !== next, returned false): bug to find.
	 *
	 * @since 1.0.23
	 *
	 * @param string $name     Short option name for the log line.
	 * @param mixed  $previous Stored value before the write attempt.
	 * @param mixed  $next     Value we tried to write.
	 * @param bool   $updated  Return value of `update_option`.
	 *
	 * @return void
	 */
	private static function log_update( string $name, $previous, $next, bool $updated ): void {
		if ( ! ( defined( 'WP_DEBUG' ) && WP_DEBUG ) ) {
			return;
		}
		$changed = $previous !== $next;
		$status  = $updated ? 'WRITTEN' : ( $changed ? 'FAILED' : 'NOOP' );
		// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
		error_log( sprintf( '[imgsig] site-settings.%s %s', $name, $status ) );
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
		$raw = get_option( self::OPT_BRAND_PALETTE, [] );
		// Native array (current 1.0.20+ storage path).
		if ( is_array( $raw ) ) {
			return self::sanitize_palette( $raw );
		}
		// Legacy: a JSON-encoded string (1.0.13–1.0.19). Decode then
		// sanitize. The next write will normalise to a native array.
		if ( is_string( $raw ) && '' !== $raw ) {
			$decoded = json_decode( $raw, true );
			if ( is_array( $decoded ) ) {
				return self::sanitize_palette( $decoded );
			}
		}
		return [];
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
		$raw = get_option( self::OPT_BANNER_CAMPAIGNS, [] );
		// Native array (1.0.20+ storage path).
		if ( is_array( $raw ) ) {
			return self::sanitize_campaigns( $raw );
		}
		// Legacy: JSON-encoded string (1.0.15–1.0.19). The next write
		// will normalise.
		if ( is_string( $raw ) && '' !== $raw ) {
			$decoded = json_decode( $raw, true );
			if ( is_array( $decoded ) ) {
				return self::sanitize_campaigns( $decoded );
			}
		}
		return [];
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
