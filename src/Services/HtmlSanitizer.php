<?php
/**
 * Email-safe HTML sanitizer.
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

defined( 'ABSPATH' ) || exit;

/**
 * Whitelists the limited HTML tag / attribute set allowed in text blocks.
 *
 * Tiptap's email-safe configuration in the editor only emits
 * `<strong>`, `<em>`, `<u>`, `<a>`, `<br>`, and `<span>` (CLAUDE.md
 * §19.4). This class enforces the same whitelist server-side so a
 * tampered request payload can't slip arbitrary HTML into a stored
 * signature.
 *
 * Implementation defers to `wp_kses` with a tightly-scoped allowed-tags
 * map. URL protocols are restricted to `http`, `https`, `mailto`, `tel`.
 *
 * @since 1.0.0
 */
final class HtmlSanitizer {

	/**
	 * Allowed HTML tags and attributes.
	 *
	 * @var array<string, array<string, bool>>
	 */
	private const ALLOWED_TAGS = [
		'strong' => [],
		'em'     => [],
		'u'      => [],
		'br'     => [],
		'a'      => [
			'href'   => true,
			'title'  => true,
			'rel'    => true,
			'target' => true,
		],
		'span'   => [
			'style' => true,
		],
	];

	/**
	 * Allowed URL protocols (CLAUDE.md §19.4).
	 *
	 * @var string[]
	 */
	private const ALLOWED_PROTOCOLS = [ 'http', 'https', 'mailto', 'tel' ];

	/**
	 * Returns a sanitised version of the input.
	 *
	 * @since 1.0.0
	 *
	 * @param string $html Untrusted HTML fragment.
	 *
	 * @return string
	 */
	public function sanitize( string $html ): string {
		if ( '' === $html ) {
			return '';
		}

		return wp_kses( $html, self::ALLOWED_TAGS, self::ALLOWED_PROTOCOLS );
	}
}
