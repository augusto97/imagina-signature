<?php
/**
 * Colour helper for brand-kit accents.
 *
 * @package ImaginaSignatures\Deployment\Install
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Install;

defined( 'ABSPATH' ) || exit;

/**
 * Picks readable text for buttons drawn in the brand-kit accent colour
 * (install page and invitation emails): an admin may pick a light
 * accent such as yellow, where white text would disappear.
 *
 * @since 1.3.0
 */
final class BrandColors {

	/**
	 * Readable text colour (#ffffff / #111827) on a `#rgb` / `#rrggbb`
	 * background, by WCAG contrast ratio. Invalid input → `#ffffff`.
	 *
	 * @since 1.3.0
	 *
	 * @param string $hex Background colour.
	 *
	 * @return string
	 */
	public static function text_on( string $hex ): string {
		$hex = ltrim( $hex, '#' );
		if ( 3 === strlen( $hex ) ) {
			$hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
		}
		if ( 1 !== preg_match( '/^[0-9a-f]{6}$/i', $hex ) ) {
			return '#ffffff';
		}

		$channel   = static function ( string $pair ): float {
			$c = hexdec( $pair ) / 255;
			return $c <= 0.03928 ? $c / 12.92 : ( ( $c + 0.055 ) / 1.055 ) ** 2.4;
		};
		$luminance = 0.2126 * $channel( substr( $hex, 0, 2 ) ) + 0.7152 * $channel( substr( $hex, 2, 2 ) ) + 0.0722 * $channel( substr( $hex, 4, 2 ) );

		// White wins while its contrast ratio beats #111827's (luminance ≈ 0.0092).
		return ( 1.05 / ( $luminance + 0.05 ) ) >= ( ( $luminance + 0.05 ) / 0.0592 ) ? '#ffffff' : '#111827';
	}
}
