<?php
/**
 * Email-safe HTML / URL sanitizer.
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

defined( 'ABSPATH' ) || exit;

/**
 * Server-side counterpart of the editor's `sanitizeEmailHtml()`.
 *
 * Three surfaces, all built on `wp_kses`. Inline `style` attributes
 * are NOT left to WordPress' `safecss_filter_attr()` (which allows
 * ~150 properties including `position`, yet lacks `display`, which
 * email layouts need): they are carried through kses under a private
 * attribute name and then rebuilt from an explicit, per-surface
 * property allowlist, with any value that could load or run code
 * (`url(`, `expression(`, escapes, comments) dropped.
 *
 *
 *  - {@see sanitize()}: rich-text fragments produced by Tiptap
 *    (text block `content`). Inline formatting only.
 *  - {@see sanitize_email_document()}: a full compiled signature
 *    (tables, images, links) — used by the test-send endpoint so it
 *    can't be abused as an arbitrary-HTML mail relay.
 *  - {@see sanitize_url()}: URL-ish JSON fields (href, src, link…).
 *    Validation only — an accepted value is returned byte-for-byte so
 *    the editor's save round-trip compare stays stable.
 *
 * URL protocols are restricted to `http`, `https`, `mailto`, `tel`
 * (CLAUDE.md §19.4), filterable via `imgsig/sanitizer/allowed_protocols`.
 *
 * @since 1.0.0
 */
final class HtmlSanitizer {

	/**
	 * Tags + attributes allowed in rich-text fragments.
	 *
	 * @var array<string, array<string, bool>>
	 */
	private const RICH_TEXT_TAGS = [
		'strong' => [],
		'b'      => [],
		'em'     => [],
		'i'      => [],
		'u'      => [],
		'br'     => [],
		'span'   => [ 'style' => true ],
		'p'      => [ 'style' => true ],
		'a'      => [
			'href'   => true,
			'title'  => true,
			'target' => true,
			'rel'    => true,
			'style'  => true,
		],
	];

	/**
	 * CSS properties allowed inside rich-text `style` attributes.
	 *
	 * @var string[]
	 */
	private const RICH_TEXT_STYLE_PROPERTIES = [
		'color',
		'background-color',
		'font-weight',
		'font-style',
		'font-size',
		'font-family',
		'text-decoration',
		'text-align',
		'line-height',
		'margin',
		'margin-top',
		'margin-right',
		'margin-bottom',
		'margin-left',
	];

	/**
	 * Presentational attributes allowed on every email-document tag.
	 *
	 * @var string[]
	 */
	private const EMAIL_ATTRIBUTES = [
		'width',
		'height',
		'align',
		'valign',
		'bgcolor',
		'border',
		'cellpadding',
		'cellspacing',
		'role',
		'style',
		'alt',
		'src',
		'href',
		'title',
		'target',
		'rel',
	];

	/**
	 * Tags allowed in a compiled email document.
	 *
	 * @var string[]
	 */
	private const EMAIL_TAGS = [
		'table',
		'tbody',
		'thead',
		'tr',
		'td',
		'th',
		'img',
		'a',
		'span',
		'p',
		'br',
		'strong',
		'b',
		'em',
		'i',
		'u',
		'div',
		'center',
	];

	/**
	 * CSS properties allowed inside email-document `style` attributes.
	 *
	 * @var string[]
	 */
	private const EMAIL_STYLE_PROPERTIES = [
		'background',
		'background-color',
		'border',
		'border-top',
		'border-right',
		'border-bottom',
		'border-left',
		'border-color',
		'border-style',
		'border-width',
		'border-radius',
		'border-collapse',
		'border-spacing',
		'color',
		'display',
		'font',
		'font-family',
		'font-size',
		'font-style',
		'font-weight',
		'height',
		'letter-spacing',
		'line-height',
		'margin',
		'margin-top',
		'margin-right',
		'margin-bottom',
		'margin-left',
		'max-width',
		'min-width',
		'padding',
		'padding-top',
		'padding-right',
		'padding-bottom',
		'padding-left',
		'table-layout',
		'text-align',
		'text-decoration',
		'text-transform',
		'vertical-align',
		'white-space',
		'width',
	];

	/**
	 * Elements removed together with their content before kses runs
	 * on an email document (kses would otherwise strip only the tags
	 * and leave e.g. inline JS / CSS behind as visible text).
	 *
	 * @var string[]
	 */
	private const STRIP_WITH_CONTENT = [
		'head',
		'title',
		'script',
		'style',
		'noscript',
		'template',
		'iframe',
		'frame',
		'frameset',
		'object',
		'embed',
		'applet',
		'form',
		'textarea',
		'select',
		'button',
		'svg',
		'math',
		'video',
		'audio',
	];

	/**
	 * Default allowed URL protocols (CLAUDE.md §19.4).
	 *
	 * @var string[]
	 */
	private const ALLOWED_PROTOCOLS = [ 'http', 'https', 'mailto', 'tel' ];

	/**
	 * Private attribute name `style` is carried under through kses.
	 */
	private const STYLE_CARRIER = 'data-imgsig-style';

	/**
	 * Matches a `{{variable}}` placeholder token.
	 */
	private const TOKEN_PATTERN = '/\{\{\s*[A-Za-z0-9_.\-]+\s*\}\}/';

	/**
	 * Sanitises a rich-text fragment (Tiptap output).
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

		return $this->kses( $html, self::RICH_TEXT_TAGS, self::RICH_TEXT_STYLE_PROPERTIES );
	}

	/**
	 * Sanitises a full compiled email document down to the email-safe
	 * table / image / link subset.
	 *
	 * The `<head>` (title, metas, styles) and every script-capable or
	 * interactive element are removed with their content; the `<body>`
	 * contents (or the whole input, for a fragment) go through kses
	 * with presentational attributes only. `on*` handlers, `javascript:`
	 * URLs, forms and iframes never survive.
	 *
	 * @since 1.0.40
	 *
	 * @param string $html Untrusted (client-compiled) HTML.
	 *
	 * @return string
	 */
	public function sanitize_email_document( string $html ): string {
		if ( '' === trim( $html ) ) {
			return '';
		}

		// Prefer the body contents when a full document was supplied.
		if ( preg_match( '#<body\b[^>]*>(.*)</body\s*>#is', $html, $match ) ) {
			$html = $match[1];
		}

		// Doctype / xml declarations / html + body wrappers.
		$html = (string) preg_replace( '#<!DOCTYPE[^>]*>#i', '', $html );
		$html = (string) preg_replace( '#<\?xml[^>]*>#i', '', $html );

		foreach ( self::STRIP_WITH_CONTENT as $tag ) {
			$html = (string) preg_replace( '#<' . $tag . '\b[^>]*>.*?</' . $tag . '\s*>#is', '', $html );
			// Unclosed / self-closed leftovers.
			$html = (string) preg_replace( '#<' . $tag . '\b[^>]*/?>#i', '', $html );
		}

		$allowed = [];
		$attrs   = array_fill_keys( self::EMAIL_ATTRIBUTES, true );
		foreach ( self::EMAIL_TAGS as $tag ) {
			$allowed[ $tag ] = $attrs;
		}

		return trim( $this->kses( $html, $allowed, self::EMAIL_STYLE_PROPERTIES ) );
	}

	/**
	 * Runs wp_kses with `style` routed around WordPress' CSS filter
	 * and rebuilt from `$style_properties` afterwards.
	 *
	 * @since 1.0.40
	 *
	 * @param string                             $html             Untrusted HTML.
	 * @param array<string, array<string, bool>> $allowed          Kses tag => attributes map (may list `style`).
	 * @param string[]                           $style_properties Allowed CSS properties.
	 *
	 * @return string
	 */
	private function kses( string $html, array $allowed, array $style_properties ): string {
		foreach ( $allowed as $tag => $attributes ) {
			if ( isset( $attributes['style'] ) ) {
				unset( $attributes['style'] );
				$attributes[ self::STYLE_CARRIER ] = true;
			}
			$allowed[ $tag ] = $attributes;
		}

		// Inside tags only: `style=` → carrier. Anything this misses
		// stays named `style`, which kses then drops (not allowed).
		$html = (string) preg_replace_callback(
			'/<[a-zA-Z][^>]*>/',
			static function ( array $m ): string {
				return (string) preg_replace( '/([\s\/"\'])style(\s*=)/i', '$1' . self::STYLE_CARRIER . '$2', $m[0] );
			},
			$html
		);

		$clean = wp_kses( $html, $allowed, $this->allowed_protocols() );

		return $this->filter_style_attributes( $clean, $style_properties );
	}

	/**
	 * Renders sanitised HTML as a readable plain-text alternative
	 * (used for the `text/plain` part of the test-send email).
	 *
	 * @since 1.0.40
	 *
	 * @param string $html Already-sanitised HTML.
	 *
	 * @return string
	 */
	public function to_plain_text( string $html ): string {
		// Keep link targets readable: "Label (https://…)".
		$html = (string) preg_replace_callback(
			'#<a\b[^>]*\bhref=(["\'])(.*?)\1[^>]*>(.*?)</a\s*>#is',
			static function ( array $m ): string {
				$label = trim( wp_strip_all_tags( $m[3] ) );
				$href  = html_entity_decode( $m[2], ENT_QUOTES, 'UTF-8' );
				if ( '' === $label || $label === $href ) {
					return ' ' . $href . ' ';
				}
				return $label . ' (' . $href . ')';
			},
			$html
		);

		$html = (string) preg_replace( '#<br\s*/?>#i', "\n", $html );
		$html = (string) preg_replace( '#</(p|div|tr|table|center|h[1-6])\s*>#i', "\n", $html );
		$html = (string) preg_replace( '#</t[dh]\s*>#i', ' ', $html );

		$text = html_entity_decode( wp_strip_all_tags( $html ), ENT_QUOTES, 'UTF-8' );
		$text = (string) preg_replace( "/[ \t\x{00A0}]+/u", ' ', $text );
		$text = (string) preg_replace( "/ *\n */", "\n", $text );
		$text = (string) preg_replace( "/\n{3,}/", "\n\n", $text );

		return trim( $text );
	}

	/**
	 * Validates a URL-ish field value.
	 *
	 * Returns the value untouched when it is acceptable and `null`
	 * when it must be dropped. Accepted:
	 *
	 *  - empty string;
	 *  - scheme-less values (relative paths, `www.example.com`,
	 *    `{{website}}`);
	 *  - an allowed scheme (`http`, `https`, `mailto`, `tel`, plus any
	 *    added through the filter), optionally with `{{tokens}}`.
	 *
	 * Rejected: any other scheme (`javascript:`, `data:`, `vbscript:`…,
	 * including entity / whitespace obfuscations such as
	 * `java&#x09;script:`), a scheme assembled from a `{{token}}`, and
	 * values carrying markup-breaking characters (`<`, `>`, `"`, `` ` ``)
	 * or control characters.
	 *
	 * @since 1.0.40
	 *
	 * @param string $url Untrusted URL.
	 *
	 * @return string|null The original value, or null when rejected.
	 */
	public function sanitize_url( string $url ): ?string {
		if ( '' === trim( $url ) ) {
			return $url;
		}

		if ( preg_match( '/[<>"`\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $url ) ) {
			return null;
		}

		$normalised = $this->normalise_for_scheme_check( $url );

		// A scheme built (wholly or partly) from a placeholder token —
		// `{{proto}}:alert(1)` — can't be validated until compile time,
		// so refuse it outright.
		if ( preg_match( '/^(?:\{\{[^}]*\}\}|[a-z0-9+.\-])*\{\{[^}]*\}\}(?:\{\{[^}]*\}\}|[a-z0-9+.\-])*:/', $normalised ) ) {
			return null;
		}

		$probe = (string) preg_replace( self::TOKEN_PATTERN, '', $normalised );

		if ( preg_match( '/^([a-z][a-z0-9+.\-]*):/', $probe, $scheme ) ) {
			if ( ! in_array( $scheme[1], $this->allowed_protocols(), true ) ) {
				return null;
			}
		}

		return $url;
	}

	/**
	 * True when free text would act as a script / data URL if it were
	 * ever substituted into an `href` or `src` (used for `{{variable}}`
	 * values, which are plain text but end up inside link targets).
	 *
	 * Deliberately narrower than {@see sanitize_url()} so ordinary text
	 * such as "Note: call me" isn't flagged.
	 *
	 * @since 1.0.40
	 *
	 * @param string $value Untrusted text.
	 *
	 * @return bool
	 */
	public function is_script_url( string $value ): bool {
		$normalised = $this->normalise_for_scheme_check( $value );

		if ( preg_match( '/^(?:javascript|vbscript|livescript|mocha):/', $normalised ) ) {
			return true;
		}

		// `data:` followed by a media type or a bare comma.
		return 1 === preg_match( '#^data:(?:,|[a-z0-9.+\-]+/[a-z0-9.+\-]+)#', $normalised );
	}

	/**
	 * Strips markup from a plain-text value — but only when it actually
	 * contains something tag-like, so ordinary text ("A & B", "x < y")
	 * passes through byte-for-byte (no entity re-encoding).
	 *
	 * @since 1.0.40
	 *
	 * @param string $text Untrusted plain text.
	 *
	 * @return string
	 */
	public function strip_markup( string $text ): string {
		if ( ! preg_match( '#<\s*[a-zA-Z/!?]#', $text ) ) {
			return $text;
		}

		return wp_strip_all_tags( $text );
	}

	/**
	 * Restricts every `style="…"` attribute in kses output to the given
	 * property allowlist and drops values that can carry code or remote
	 * loads (`url(`, `expression(`, `@import`, backslash escapes,
	 * comments). Removes the attribute entirely when nothing survives.
	 *
	 * @since 1.0.40
	 *
	 * @param string   $html       Kses-sanitised HTML.
	 * @param string[] $properties Allowed CSS property names.
	 *
	 * @return string
	 */
	private function filter_style_attributes( string $html, array $properties ): string {
		if ( false === strpos( $html, self::STYLE_CARRIER ) ) {
			return $html;
		}

		$rebuild = static function ( array $m ) use ( $properties ): string {
			$kept    = [];
			$dropped = false;
			foreach ( explode( ';', html_entity_decode( $m[2], ENT_QUOTES, 'UTF-8' ) ) as $declaration ) {
				$declaration = trim( $declaration );
				if ( '' === $declaration ) {
					continue;
				}
				if ( false === strpos( $declaration, ':' ) ) {
					$dropped = true;
					continue;
				}

				[ $property, $value ] = array_map( 'trim', explode( ':', $declaration, 2 ) );
				$property             = strtolower( $property );

				if ( ! in_array( $property, $properties, true ) || '' === $value
					|| preg_match( '/url\s*\(|expression\s*\(|@import|javascript:|behavior\s*:|\\\\|\/\*|[<>"]/i', $value ) ) {
					$dropped = true;
					continue;
				}

				$kept[] = $property . ': ' . $value;
			}

			if ( empty( $kept ) ) {
				return '';
			}

			// Untouched declarations keep their original bytes so
			// clean editor output round-trips unchanged.
			if ( ! $dropped ) {
				return ' style=' . $m[1] . $m[2] . $m[1];
			}

			return ' style="' . esc_attr( implode( '; ', $kept ) ) . '"';
		};

		return (string) preg_replace_callback(
			'/<[a-zA-Z][^>]*>/',
			static function ( array $tag ) use ( $rebuild ): string {
				return (string) preg_replace_callback(
					'/\s' . self::STYLE_CARRIER . '\s*=\s*(["\'])(.*?)\1/is',
					$rebuild,
					$tag[0]
				);
			},
			$html
		);
	}

	/**
	 * Lower-cases a URL candidate and removes everything browsers ignore
	 * while parsing a scheme (whitespace, control chars, HTML entities).
	 *
	 * @since 1.0.40
	 *
	 * @param string $value Raw value.
	 *
	 * @return string
	 */
	private function normalise_for_scheme_check( string $value ): string {
		$decoded = $value;
		// Twice: catches `&amp;#106;` style double encoding.
		for ( $i = 0; $i < 2; $i++ ) {
			$decoded = html_entity_decode( $decoded, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		}

		// Numeric entities without the trailing semicolon (`&#106avascript:`).
		$decoded = (string) preg_replace_callback(
			'/&#(x[0-9a-f]+|[0-9]+)/i',
			static function ( array $m ): string {
				$code = 'x' === strtolower( $m[1][0] ) ? hexdec( substr( $m[1], 1 ) ) : (int) $m[1];
				return $code > 0 && $code < 0x110000 ? (string) mb_chr( (int) $code, 'UTF-8' ) : '';
			},
			$decoded
		);

		return strtolower( (string) preg_replace( '/[\s\x00-\x1F\x7F]+/u', '', $decoded ) );
	}

	/**
	 * Returns the allowed URL protocols.
	 *
	 * @since 1.0.40
	 *
	 * @return string[]
	 */
	private function allowed_protocols(): array {
		/**
		 * Filters the URL protocols accepted in signature HTML and URL
		 * fields. Add e.g. `sms` or `skype` here if your signatures link
		 * to those apps.
		 *
		 * @since 1.0.40
		 *
		 * @param string[] $protocols Default `http`, `https`, `mailto`, `tel`.
		 */
		$protocols = apply_filters( 'imgsig/sanitizer/allowed_protocols', self::ALLOWED_PROTOCOLS );

		$out = [];
		foreach ( (array) $protocols as $protocol ) {
			$protocol = strtolower( (string) $protocol );
			// Never let a filter re-enable script-capable schemes.
			if ( preg_match( '/^[a-z][a-z0-9+.\-]*$/', $protocol ) && ! in_array( $protocol, [ 'javascript', 'vbscript', 'data', 'livescript', 'mocha' ], true ) ) {
				$out[] = $protocol;
			}
		}

		return empty( $out ) ? self::ALLOWED_PROTOCOLS : array_values( array_unique( $out ) );
	}
}
