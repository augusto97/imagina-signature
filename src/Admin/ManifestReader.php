<?php
/**
 * Vite manifest reader.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

defined( 'ABSPATH' ) || exit;

/**
 * Resolves Vite-hashed asset filenames at request time.
 *
 * Why: the build pipeline emits `editor.[hash].js`, `admin.[hash].js`,
 * etc. The hash changes whenever the bundle content changes, which is
 * the cache-busting strategy — every release has a fresh URL that no
 * browser / CDN / page cache can possibly have seen before. Vite
 * writes a `manifest.json` mapping each entry's source-tree path to
 * its hashed output filename; this class is the PHP-side reader.
 *
 * Cached in a static property so multiple enqueuers in the same
 * request don't re-read / re-decode the JSON file.
 *
 * @since 1.0.21
 */
final class ManifestReader {

	/**
	 * Decoded manifest, lazily loaded.
	 *
	 * @var array<string, array<string, mixed>>|null
	 */
	private static ?array $manifest = null;

	/**
	 * Returns the hashed filename for a given source-tree entry.
	 *
	 * The lookup key is the source path Vite knows the entry by —
	 * for our setup, `assets/editor/src/main.tsx` and
	 * `assets/admin/src/main.tsx`.
	 *
	 * Falls back to a sensible default if the manifest is missing
	 * (e.g. someone is running off a build that pre-dates the
	 * manifest convention) so the editor still loads, just without
	 * the cache-busting guarantee.
	 *
	 * @since 1.0.21
	 *
	 * @param string $entry    Source-tree path Vite uses as the key.
	 * @param string $fallback Filename to return when the manifest
	 *                          can't resolve the entry.
	 *
	 * @return string The hashed output filename relative to `build/`.
	 */
	public static function file_for( string $entry, string $fallback ): string {
		$manifest = self::load();
		if ( null === $manifest ) {
			return $fallback;
		}
		if ( isset( $manifest[ $entry ]['file'] ) && is_string( $manifest[ $entry ]['file'] ) ) {
			return $manifest[ $entry ]['file'];
		}
		return $fallback;
	}

	/**
	 * Returns the hashed CSS filename associated with an entry, or
	 * an empty string if the entry has no CSS.
	 *
	 * @since 1.0.21
	 *
	 * @param string $entry Source-tree path Vite uses as the key.
	 *
	 * @return string
	 */
	public static function css_for( string $entry ): string {
		$manifest = self::load();
		if ( null === $manifest ) {
			return '';
		}
		if ( ! isset( $manifest[ $entry ]['css'][0] ) ) {
			return '';
		}
		$css = $manifest[ $entry ]['css'][0];
		return is_string( $css ) ? $css : '';
	}

	/**
	 * Lazily load + decode the manifest. Returns null when missing.
	 *
	 * @return array<string, array<string, mixed>>|null
	 */
	private static function load(): ?array {
		if ( null !== self::$manifest ) {
			return self::$manifest;
		}

		$path = trailingslashit( IMGSIG_PATH ) . 'build/.vite/manifest.json';
		if ( ! file_exists( $path ) || ! is_readable( $path ) ) {
			return null;
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$raw = file_get_contents( $path );
		if ( false === $raw ) {
			return null;
		}

		$decoded = json_decode( $raw, true );
		if ( ! is_array( $decoded ) ) {
			return null;
		}

		self::$manifest = $decoded;
		return self::$manifest;
	}
}
