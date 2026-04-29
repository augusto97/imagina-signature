<?php
/**
 * HTML sanitization for signature text content.
 *
 * @package ImaginaSignatures\Security
 */

declare(strict_types=1);

namespace ImaginaSignatures\Security;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Strict allow-list HTML sanitizer for signature text blocks.
 *
 * Only safe inline tags are kept. URLs are restricted to `http`, `https`,
 * `mailto`, and `tel` schemes. SVG and any executable content are stripped.
 *
 * @since 1.0.0
 */
final class HtmlSanitizer {

	/**
	 * Returns the wp_kses allow-list used for signature text.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	public function allowed_tags(): array {
		return [
			'a'      => [
				'href'   => true,
				'title'  => true,
				'target' => true,
				'rel'    => true,
				'style'  => true,
			],
			'b'      => [ 'style' => true ],
			'strong' => [ 'style' => true ],
			'i'      => [ 'style' => true ],
			'em'     => [ 'style' => true ],
			'u'      => [ 'style' => true ],
			'span'   => [ 'style' => true ],
			'br'     => [],
		];
	}

	/**
	 * Sanitizes a fragment of inline HTML.
	 *
	 * @param string $html Untrusted HTML.
	 *
	 * @return string Safe HTML.
	 */
	public function sanitize( string $html ): string {
		add_filter( 'kses_allowed_protocols', [ $this, 'filter_protocols' ], 10, 1 );
		$out = wp_kses( $html, $this->allowed_tags() );
		remove_filter( 'kses_allowed_protocols', [ $this, 'filter_protocols' ], 10 );
		return $out;
	}

	/**
	 * Restricts protocols accepted in URLs.
	 *
	 * @param array<int, string> $protocols Default WP protocols.
	 *
	 * @return array<int, string>
	 */
	public function filter_protocols( array $protocols ): array {
		return [ 'http', 'https', 'mailto', 'tel' ];
	}
}
