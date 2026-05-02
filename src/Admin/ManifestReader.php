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
	 * The `$fallback` argument is kept for API compatibility but is
	 * NOT used: Vite always emits hashed filenames (`editor.[hash].js`),
	 * so a fallback like `editor.js` would 404 in production. Until
	 * 1.0.25 the fallback path was returned silently, leading to
	 * confusing "the editor won't load" reports — now we surface a
	 * loud admin notice and an explicit empty string so the asset
	 * enqueuer can decide to skip enqueueing rather than emit a dead
	 * `<script src="editor.js">` URL.
	 *
	 * @since 1.0.21
	 *
	 * @param string $entry     Source-tree path Vite uses as the key.
	 * @param string $_fallback Legacy fallback (unused since 1.0.25).
	 *
	 * @return string Hashed output filename relative to `build/`, or
	 *                empty string when unresolved.
	 */
	public static function file_for( string $entry, string $_fallback = '' ): string {
		$manifest = self::load();
		if ( null === $manifest ) {
			self::notice_missing_manifest();
			return '';
		}
		if ( isset( $manifest[ $entry ]['file'] ) && is_string( $manifest[ $entry ]['file'] ) ) {
			return $manifest[ $entry ]['file'];
		}
		self::notice_missing_entry( $entry );
		return '';
	}

	/**
	 * Surfaces a one-time admin notice when the Vite manifest can't be
	 * found. Operators see "the editor doesn't load"; this tells them
	 * exactly why — they need to run `npm run build` (or their CI
	 * pipeline forgot to ship the manifest in the ZIP).
	 *
	 * Idempotent: only the first call per request actually enqueues
	 * the notice; subsequent calls are no-ops.
	 *
	 * @return void
	 */
	private static function notice_missing_manifest(): void {
		static $shown = false;
		if ( $shown || ! is_admin() ) {
			return;
		}
		$shown = true;

		add_action(
			'admin_notices',
			static function (): void {
				if ( ! current_user_can( 'manage_options' ) ) {
					return;
				}
				echo '<div class="notice notice-error"><p>';
				echo esc_html__(
					'Imagina Signatures: build manifest missing (build/.vite/manifest.json). The editor and admin pages will not load. Re-build the plugin (npm run build) or re-install from a fresh ZIP.',
					'imagina-signatures'
				);
				echo '</p></div>';
			}
		);
	}

	/**
	 * Surfaces an admin notice when an entry isn't in the manifest
	 * (manifest exists but doesn't include the requested entry). Hints
	 * at a build / config drift between the PHP enqueuer and the Vite
	 * `rollupOptions.input` map.
	 *
	 * @param string $entry The unresolved entry path.
	 *
	 * @return void
	 */
	private static function notice_missing_entry( string $entry ): void {
		static $reported = [];
		if ( isset( $reported[ $entry ] ) || ! is_admin() ) {
			return;
		}
		$reported[ $entry ] = true;

		add_action(
			'admin_notices',
			static function () use ( $entry ): void {
				if ( ! current_user_can( 'manage_options' ) ) {
					return;
				}
				echo '<div class="notice notice-warning"><p>';
				printf(
					/* translators: %s: source-tree entry path. */
					esc_html__( 'Imagina Signatures: manifest entry "%s" not found. Re-build the plugin to refresh the manifest.', 'imagina-signatures' ),
					esc_html( $entry )
				);
				echo '</p></div>';
			}
		);
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
