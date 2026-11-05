<?php
/**
 * Translation loading for PHP and the React apps.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

defined( 'ABSPATH' ) || exit;

/**
 * Loads the `imagina-signatures` text domain and serves the JS
 * translation maps (CLAUDE.md §6.5 / §21).
 *
 * Catalogues live in the plugin's `languages/` folder:
 *
 *  - `imagina-signatures-<locale>.mo`   — PHP (`__()`, `esc_html__()`…);
 *  - `imagina-signatures-<locale>.json` — `{ msgid: msgstr }` for the
 *    React apps, injected as `translations` into the bootstrap configs.
 *
 * Both are compiled from `imagina-signatures-<locale>.po` by
 * `npm run i18n:build`.
 *
 * Regional fallback: every Spanish locale (`es_CO`, `es_MX`, `es_AR`…)
 * without its own catalogue uses `es_ES`. Language packs installed in
 * `wp-content/languages/plugins/` still take precedence over the
 * bundled files (that's how `load_plugin_textdomain()` works).
 *
 * REST requests to our namespace run in the logged-in user's locale
 * (their profile language), like wp-admin does — so error messages
 * match the UI that shows them even when the site language differs.
 *
 * @since 1.1.0
 */
final class I18n {

	/**
	 * Text domain.
	 */
	public const DOMAIN = 'imagina-signatures';

	/**
	 * Catalogue used by any `es_*` locale that has none of its own.
	 */
	public const SPANISH_FALLBACK = 'es_ES';

	/**
	 * REST route prefix whose requests run in the user's locale.
	 */
	private const REST_PREFIX = '/imagina-signatures/';

	/**
	 * Decoded JSON maps keyed by catalogue path.
	 *
	 * @var array<string, array<string, string>>
	 */
	private static array $json_cache = [];

	/**
	 * One entry per REST request being dispatched (internal requests can
	 * nest): whether {@see self::switch_rest_locale()} switched the
	 * locale for it.
	 *
	 * @var bool[]
	 */
	private static array $rest_switched = [];

	/**
	 * Hooks the loaders.
	 *
	 * @since 1.1.0
	 *
	 * @return void
	 */
	public static function boot(): void {
		add_action( 'init', [ self::class, 'load_textdomain' ], 1 );
		add_filter( 'load_textdomain_mofile', [ self::class, 'filter_mofile' ], 10, 2 );
		add_action( 'change_locale', [ self::class, 'on_change_locale' ] );
		add_filter( 'rest_request_before_callbacks', [ self::class, 'switch_rest_locale' ], 10, 3 );
		add_filter( 'rest_request_after_callbacks', [ self::class, 'restore_rest_locale' ], 10, 3 );
	}

	/**
	 * Loads the text domain from the plugin's `languages/` folder.
	 *
	 * On WordPress 6.7+ this registers the path and the strings load
	 * just in time; earlier versions load immediately. Either way the
	 * `.mo` path runs through {@see self::filter_mofile()}.
	 *
	 * @since 1.1.0
	 *
	 * @return void
	 */
	public static function load_textdomain(): void {
		load_plugin_textdomain( self::DOMAIN, false, dirname( IMGSIG_BASENAME ) . '/languages' );
	}

	/**
	 * `load_textdomain_mofile`: when WordPress asks for a bundled
	 * catalogue that doesn't exist (e.g. `…-es_CO.mo`), hand it the
	 * Spanish fallback instead.
	 *
	 * Only paths inside our own `languages/` folder are rewritten, so a
	 * missing language pack in `wp-content/languages/plugins/` still
	 * falls through to the bundled locale-specific file first.
	 *
	 * @since 1.1.0
	 *
	 * @param string $mofile Path WordPress is about to load.
	 * @param string $domain Text domain.
	 *
	 * @return string
	 */
	public static function filter_mofile( $mofile, $domain ) {
		if ( self::DOMAIN !== $domain || ! is_string( $mofile ) || is_readable( $mofile ) ) {
			return $mofile;
		}

		$requested_dir = realpath( dirname( $mofile ) );
		$bundled_dir   = realpath( self::languages_dir() );
		if ( false === $requested_dir || false === $bundled_dir || $requested_dir !== $bundled_dir ) {
			return $mofile;
		}

		$prefix = self::DOMAIN . '-';
		$name   = basename( $mofile );
		if ( 0 !== strpos( $name, $prefix ) || '.mo' !== substr( $name, -3 ) ) {
			return $mofile;
		}

		$locale   = substr( $name, strlen( $prefix ), -3 );
		$fallback = self::fallback_locale( $locale );
		if ( null === $fallback ) {
			return $mofile;
		}

		$candidate = self::catalogue_path( $fallback, 'mo' );
		return is_readable( $candidate ) ? $candidate : $mofile;
	}

	/**
	 * `change_locale`: after `switch_to_locale()` WordPress reloads
	 * text domains just in time, which older cores can't resolve to
	 * the Spanish fallback. Load it explicitly when that didn't happen.
	 *
	 * @since 1.1.0
	 *
	 * @param string $locale The new locale.
	 *
	 * @return void
	 */
	public static function on_change_locale( $locale ): void {
		if ( ! is_string( $locale ) || is_textdomain_loaded( self::DOMAIN ) ) {
			return;
		}
		$file = self::resolve_catalogue( $locale, 'mo' );
		if ( null !== $file ) {
			load_textdomain( self::DOMAIN, $file, $locale );
		}
	}

	/**
	 * `rest_request_before_callbacks`: our REST endpoints answer in
	 * the logged-in user's locale (permission errors included — they
	 * run after this filter).
	 *
	 * @since 1.1.0
	 *
	 * @param mixed            $response Response so far (passed through).
	 * @param array            $handler  Route handler (unused).
	 * @param \WP_REST_Request $request  Request.
	 *
	 * @return mixed
	 */
	public static function switch_rest_locale( $response, $handler, $request ) {
		unset( $handler );
		$switched = false;

		if (
			$request instanceof \WP_REST_Request
			&& 0 === strpos( (string) $request->get_route(), self::REST_PREFIX )
			&& is_user_logged_in()
		) {
			$user_locale = get_user_locale();
			$switched    = determine_locale() !== $user_locale && switch_to_locale( $user_locale );
		}

		self::$rest_switched[] = $switched;
		return $response;
	}

	/**
	 * `rest_request_after_callbacks`: undoes {@see self::switch_rest_locale()}.
	 *
	 * @since 1.1.0
	 *
	 * @param mixed            $response Response (passed through).
	 * @param array            $handler  Route handler (unused).
	 * @param \WP_REST_Request $request  Request (unused).
	 *
	 * @return mixed
	 */
	public static function restore_rest_locale( $response, $handler, $request ) {
		unset( $handler, $request );
		if ( true === array_pop( self::$rest_switched ) ) {
			restore_previous_locale();
		}
		return $response;
	}

	/**
	 * The `{ msgid: msgstr }` map the React apps receive as
	 * `translations` — for the current user's locale unless one is
	 * given. Returns an object so `wp_json_encode()` always emits `{}`
	 * (never `[]`) when it's empty, e.g. for English.
	 *
	 * @since 1.1.0
	 *
	 * @param string|null $locale Locale; defaults to `get_user_locale()`.
	 *
	 * @return object
	 */
	public static function js_translations( ?string $locale = null ): object {
		$file = self::resolve_catalogue( null !== $locale ? $locale : get_user_locale(), 'json' );
		if ( null === $file ) {
			return new \stdClass();
		}

		if ( ! isset( self::$json_cache[ $file ] ) ) {
			$decoded = json_decode( (string) file_get_contents( $file ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local plugin file.
			$map     = [];
			if ( is_array( $decoded ) ) {
				foreach ( $decoded as $msgid => $msgstr ) {
					if ( is_string( $msgid ) && is_string( $msgstr ) && '' !== $msgstr ) {
						$map[ $msgid ] = $msgstr;
					}
				}
			}
			self::$json_cache[ $file ] = $map;
		}

		return (object) self::$json_cache[ $file ];
	}

	/**
	 * Locale whose catalogue a locale without its own should use, or
	 * null when there is none (non-Spanish locales, `es_ES` itself).
	 *
	 * @since 1.1.0
	 *
	 * @param string $locale WordPress locale (e.g. `es_CO`).
	 *
	 * @return string|null
	 */
	public static function fallback_locale( string $locale ): ?string {
		if ( self::SPANISH_FALLBACK === $locale ) {
			return null;
		}
		return 1 === preg_match( '/^es(?:_|$)/', $locale ) ? self::SPANISH_FALLBACK : null;
	}

	/**
	 * Bundled catalogue file for a locale (its own, else its fallback),
	 * or null when neither exists.
	 *
	 * @since 1.1.0
	 *
	 * @param string $locale    WordPress locale.
	 * @param string $extension `mo` or `json`.
	 *
	 * @return string|null
	 */
	public static function resolve_catalogue( string $locale, string $extension ): ?string {
		if ( '' === $locale || 1 !== preg_match( '/^[A-Za-z]{2,3}(?:_[A-Za-z0-9]+)*$/', $locale ) ) {
			return null;
		}

		$candidates = [ $locale ];
		$fallback   = self::fallback_locale( $locale );
		if ( null !== $fallback ) {
			$candidates[] = $fallback;
		}

		foreach ( $candidates as $candidate ) {
			$path = self::catalogue_path( $candidate, $extension );
			if ( is_readable( $path ) ) {
				return $path;
			}
		}
		return null;
	}

	/**
	 * Absolute path of a bundled catalogue.
	 *
	 * @param string $locale    Locale.
	 * @param string $extension File extension.
	 *
	 * @return string
	 */
	private static function catalogue_path( string $locale, string $extension ): string {
		return self::languages_dir() . self::DOMAIN . '-' . $locale . '.' . $extension;
	}

	/**
	 * The plugin's `languages/` directory, with a trailing slash.
	 *
	 * @return string
	 */
	private static function languages_dir(): string {
		return trailingslashit( IMGSIG_PATH ) . 'languages/';
	}
}
