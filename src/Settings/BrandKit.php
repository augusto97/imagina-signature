<?php
/**
 * Company brand kit: shape, defaults, sanitisation and derived data.
 *
 * @package ImaginaSignatures\Settings
 */

declare(strict_types=1);

namespace ImaginaSignatures\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * Site-wide company brand kit, stored in the `imgsig_brand_kit` option.
 *
 * One admin fills it in once (Settings → Brand kit) and every
 * employee's signature can reuse it:
 *
 *  - `company`    — name, tagline, website, phone, email, address, logo
 *                   URL + logo width, exposed to the editor as read-only
 *                   `{{company_*}}` variables;
 *  - `social`     — company profile URLs (LinkedIn, X, …), exposed as
 *                   `{{company_linkedin}}` etc.;
 *  - `typography` — default font family and text / link / accent
 *                   colours, applied to the canvas of NEW signatures.
 *
 * Every field is public company information (it ends up in outgoing
 * email), so the whole kit is readable by any signature user. Writes are
 * admin-only and always go through {@see sanitize()}:
 *
 *  - URLs: http / https only (`esc_url_raw`), a bare domain gets
 *    `https://`, anything else (javascript:, data:, ftp:, relative
 *    paths) becomes an empty string;
 *  - text: `sanitize_text_field` + a length cap;
 *  - email: `sanitize_email`;
 *  - colours: `#rgb` / `#rrggbb` (lower-cased), invalid → default;
 *  - font: one of {@see FONT_FAMILIES} (the editor's web-safe list),
 *    invalid → default;
 *  - logo width: integer clamped to [{@see LOGO_WIDTH_MIN}, {@see LOGO_WIDTH_MAX}].
 *
 * Unknown keys are dropped, so the stored option always has exactly the
 * shape {@see defaults()} returns.
 *
 * @since 1.2.0
 */
final class BrandKit {

	/**
	 * Option name (autoloaded: read on every editor / admin boot).
	 */
	public const OPTION = 'imgsig_brand_kit';

	/**
	 * Web-safe font stacks, value => label. Mirrors the editor's
	 * `FontFamilyInput` (and `assets/shared/brandKit.ts`) so a kit font
	 * is always one the editor can show and the compiler accepts.
	 *
	 * @var array<string, string>
	 */
	public const FONT_FAMILIES = [
		'Arial, sans-serif'                 => 'Arial',
		'Helvetica, Arial, sans-serif'      => 'Helvetica',
		'Tahoma, Geneva, sans-serif'        => 'Tahoma',
		'Verdana, Geneva, sans-serif'       => 'Verdana',
		'"Trebuchet MS", sans-serif'        => 'Trebuchet MS',
		'Georgia, serif'                    => 'Georgia',
		'"Times New Roman", Times, serif'   => 'Times New Roman',
		'"Courier New", Courier, monospace' => 'Courier New',
	];

	/**
	 * Company profile networks, in display order.
	 *
	 * @var string[]
	 */
	public const SOCIAL_NETWORKS = [ 'linkedin', 'x', 'facebook', 'instagram', 'youtube', 'tiktok', 'github', 'whatsapp' ];

	/**
	 * Plain-text company fields and their maximum length (characters).
	 *
	 * @var array<string, int>
	 */
	private const TEXT_FIELDS = [
		'name'    => 120,
		'tagline' => 160,
		'phone'   => 40,
		'address' => 300,
	];

	/**
	 * URL-valued company fields.
	 *
	 * @var string[]
	 */
	private const URL_FIELDS = [ 'website', 'logo_url' ];

	/**
	 * Hard cap on any stored URL.
	 */
	private const MAX_URL_LENGTH = 2048;

	public const LOGO_WIDTH_MIN     = 16;
	public const LOGO_WIDTH_MAX     = 600;
	public const LOGO_WIDTH_DEFAULT = 160;

	/**
	 * Default typography — identical to a new signature's canvas
	 * (`createEmptySchema()` in the editor), so an empty kit changes
	 * nothing.
	 *
	 * @var array<string, string>
	 */
	public const DEFAULT_TYPOGRAPHY = [
		'font_family'  => 'Arial, sans-serif',
		'text_color'   => '#111827',
		'link_color'   => '#1d4ed8',
		'accent_color' => '#2563eb',
	];

	/**
	 * Empty kit — the exact stored shape.
	 *
	 * @since 1.2.0
	 *
	 * @return array{company: array<string, string|int>, social: array<string, string>, typography: array<string, string>}
	 */
	public static function defaults(): array {
		return [
			'company'    => [
				'name'       => '',
				'tagline'    => '',
				'website'    => '',
				'phone'      => '',
				'email'      => '',
				'address'    => '',
				'logo_url'   => '',
				'logo_width' => self::LOGO_WIDTH_DEFAULT,
			],
			'social'     => array_fill_keys( self::SOCIAL_NETWORKS, '' ),
			'typography' => self::DEFAULT_TYPOGRAPHY,
		];
	}

	/**
	 * The stored kit, sanitised (defaults when the option is missing or
	 * corrupt).
	 *
	 * @since 1.2.0
	 *
	 * @return array{company: array<string, string|int>, social: array<string, string>, typography: array<string, string>}
	 */
	public static function current(): array {
		$raw = get_option( self::OPTION, [] );
		return self::sanitize( is_array( $raw ) ? $raw : [] );
	}

	/**
	 * Normalises untrusted input into the stored shape. Missing fields
	 * take their default; unknown keys are dropped.
	 *
	 * @since 1.2.0
	 *
	 * @param mixed $raw Untrusted input (array expected).
	 *
	 * @return array{company: array<string, string|int>, social: array<string, string>, typography: array<string, string>}
	 */
	public static function sanitize( $raw ): array {
		$raw        = is_array( $raw ) ? $raw : [];
		$company    = isset( $raw['company'] ) && is_array( $raw['company'] ) ? $raw['company'] : [];
		$social     = isset( $raw['social'] ) && is_array( $raw['social'] ) ? $raw['social'] : [];
		$typography = isset( $raw['typography'] ) && is_array( $raw['typography'] ) ? $raw['typography'] : [];
		$out        = self::defaults();

		foreach ( self::TEXT_FIELDS as $field => $max ) {
			if ( isset( $company[ $field ] ) && is_scalar( $company[ $field ] ) ) {
				$out['company'][ $field ] = self::text( (string) $company[ $field ], $max );
			}
		}

		foreach ( self::URL_FIELDS as $field ) {
			if ( isset( $company[ $field ] ) && is_scalar( $company[ $field ] ) ) {
				$out['company'][ $field ] = self::url( (string) $company[ $field ] );
			}
		}

		if ( isset( $company['email'] ) && is_scalar( $company['email'] ) ) {
			$out['company']['email'] = self::email( (string) $company['email'] );
		}

		if ( isset( $company['logo_width'] ) && is_numeric( $company['logo_width'] ) ) {
			$out['company']['logo_width'] = max(
				self::LOGO_WIDTH_MIN,
				min( self::LOGO_WIDTH_MAX, (int) round( (float) $company['logo_width'] ) )
			);
		}

		foreach ( self::SOCIAL_NETWORKS as $network ) {
			if ( isset( $social[ $network ] ) && is_scalar( $social[ $network ] ) ) {
				$out['social'][ $network ] = self::url( (string) $social[ $network ] );
			}
		}

		if ( isset( $typography['font_family'] ) && is_string( $typography['font_family'] ) ) {
			$out['typography']['font_family'] = self::font( $typography['font_family'] );
		}

		foreach ( [ 'text_color', 'link_color', 'accent_color' ] as $field ) {
			if ( isset( $typography[ $field ] ) && is_string( $typography[ $field ] ) ) {
				$out['typography'][ $field ] = self::color( $typography[ $field ], self::DEFAULT_TYPOGRAPHY[ $field ] );
			}
		}

		return $out;
	}

	/**
	 * Applies a partial update: fields present in `$patch` replace the
	 * ones in `$current`, everything else is kept. The result is
	 * sanitised, so `$patch` may be untrusted.
	 *
	 * `PATCH { brand_kit: { social: { x: '' } } }` therefore clears the X
	 * profile without touching the rest of the kit.
	 *
	 * @since 1.2.0
	 *
	 * @param array<string, mixed> $current Stored (sanitised) kit.
	 * @param mixed                $patch   Untrusted partial kit.
	 *
	 * @return array{company: array<string, string|int>, social: array<string, string>, typography: array<string, string>}
	 */
	public static function merge( array $current, $patch ): array {
		$merged = self::sanitize( $current );
		if ( ! is_array( $patch ) ) {
			return $merged;
		}

		foreach ( array_keys( $merged ) as $group ) {
			if ( ! isset( $patch[ $group ] ) || ! is_array( $patch[ $group ] ) ) {
				continue;
			}
			foreach ( $patch[ $group ] as $field => $value ) {
				if ( is_string( $field ) && array_key_exists( $field, $merged[ $group ] ) ) {
					$merged[ $group ][ $field ] = $value;
				}
			}
		}

		return self::sanitize( $merged );
	}

	/**
	 * Read-only `company_*` variables derived from the kit. Every key is
	 * always present (empty string when the admin left it blank) so a
	 * `{{company_*}}` token resolves to '' instead of shipping raw.
	 *
	 * @since 1.2.0
	 *
	 * @param array<string, mixed>|null $kit Sanitised kit; null reads the stored one.
	 *
	 * @return array<string, string>
	 */
	public static function company_variables( ?array $kit = null ): array {
		$kit     = null === $kit ? self::current() : self::sanitize( $kit );
		$company = $kit['company'];

		$vars = [
			'company_name'    => (string) $company['name'],
			'company_tagline' => (string) $company['tagline'],
			'company_website' => (string) $company['website'],
			'company_phone'   => (string) $company['phone'],
			'company_email'   => (string) $company['email'],
			'company_address' => (string) $company['address'],
			'company_logo'    => (string) $company['logo_url'],
		];

		foreach ( self::SOCIAL_NETWORKS as $network ) {
			$vars[ 'company_' . $network ] = (string) $kit['social'][ $network ];
		}

		return $vars;
	}

	/**
	 * The kit as handed to the editor bootstrap (`IMGSIG_EDITOR_CONFIG.brandKit`).
	 *
	 * An explicit projection of the public fields, so anything internal
	 * added to the option later never leaks into page source by accident.
	 *
	 * @since 1.2.0
	 *
	 * @param array<string, mixed>|null $kit Sanitised kit; null reads the stored one.
	 *
	 * @return array{company: array<string, string|int>, social: array<string, string>, typography: array<string, string>}
	 */
	public static function public_payload( ?array $kit = null ): array {
		$kit = null === $kit ? self::current() : self::sanitize( $kit );

		return [
			'company'    => $kit['company'],
			'social'     => $kit['social'],
			'typography' => $kit['typography'],
		];
	}

	/**
	 * @param string $value Raw text.
	 * @param int    $max   Maximum length in characters.
	 *
	 * @return string
	 */
	private static function text( string $value, int $max ): string {
		$value = sanitize_text_field( $value );
		if ( function_exists( 'mb_substr' ) ) {
			return mb_substr( $value, 0, $max );
		}
		return substr( $value, 0, $max );
	}

	/**
	 * Absolute http(s) URL, or '' when the value is anything else.
	 *
	 * @param string $value Raw URL.
	 *
	 * @return string
	 */
	private static function url( string $value ): string {
		$value = trim( $value );
		if ( '' === $value || strlen( $value ) > self::MAX_URL_LENGTH ) {
			return '';
		}

		// A bare domain ("acme.com", "www.acme.com/about") is what admins
		// type most often — give it https:// rather than rejecting it.
		if ( false === strpos( $value, '://' ) && preg_match( '#^[a-z0-9\-]+(\.[a-z0-9\-]+)+(?::\d{1,5})?(?:[/?\#]|$)#i', $value ) ) {
			$value = 'https://' . $value;
		}

		$clean = esc_url_raw( $value, [ 'http', 'https' ] );
		if ( ! is_string( $clean ) || ! preg_match( '#^https?://[^/\s?\#]+#i', $clean ) ) {
			return '';
		}

		// The host must look like a host name ("just some words" would
		// otherwise survive as http://just%20some%20words).
		$parts = wp_parse_url( $clean );
		if (
			! is_array( $parts )
			|| empty( $parts['host'] )
			|| ! in_array( strtolower( (string) ( $parts['scheme'] ?? '' ) ), [ 'http', 'https' ], true )
			|| ! preg_match( '/^[a-z0-9\x80-\xff\-]+(?:\.[a-z0-9\x80-\xff\-]+)*$/i', (string) $parts['host'] )
		) {
			return '';
		}

		return $clean;
	}

	/**
	 * @param string $value Raw email.
	 *
	 * @return string Valid address or ''.
	 */
	private static function email( string $value ): string {
		$value = sanitize_email( trim( $value ) );
		return is_string( $value ) ? $value : '';
	}

	/**
	 * Font stack from the allowlist (matched by stack or by label).
	 *
	 * @param string $value Raw font.
	 *
	 * @return string
	 */
	private static function font( string $value ): string {
		$value = trim( $value );
		if ( isset( self::FONT_FAMILIES[ $value ] ) ) {
			return $value;
		}
		foreach ( self::FONT_FAMILIES as $stack => $label ) {
			if ( 0 === strcasecmp( $label, $value ) ) {
				return $stack;
			}
		}
		return self::DEFAULT_TYPOGRAPHY['font_family'];
	}

	/**
	 * `#rgb` / `#rrggbb`, lower-cased, or `$fallback`.
	 *
	 * @param string $value    Raw colour.
	 * @param string $fallback Default.
	 *
	 * @return string
	 */
	private static function color( string $value, string $fallback ): string {
		$value = strtolower( trim( $value ) );
		return preg_match( '/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/', $value ) ? $value : $fallback;
	}
}
