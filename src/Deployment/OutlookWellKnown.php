<?php
/**
 * Serves the Office add-ins well-known URI.
 *
 * @package ImaginaSignatures\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment;

defined( 'ABSPATH' ) || exit;

/**
 * `/.well-known/microsoft-officeaddins-allowed.json`.
 *
 * Classic Outlook on Windows runs event handlers in a JavaScript-only
 * runtime that only makes CORS requests for scripts listed in this
 * file at the root of the script's origin:
 *
 *     { "allowed": [ "https://example.com/wp-content/plugins/imagina-signatures/assets/outlook/launchevent.js" ] }
 *
 * The listed URL deliberately carries no query string: the file is
 * public and the runtime URL's query holds the deployment key.
 *
 * Served by WordPress (`parse_request`) only while the Outlook
 * integration is enabled, and only when WordPress lives at the root of
 * its origin — a site installed in a sub-directory, or a server that
 * already has a physical file at that path, must publish the file
 * itself (the admin tab links to the URL so it can be checked).
 *
 * @since 1.3.0
 */
final class OutlookWellKnown {

	/** Path relative to the origin root. */
	public const PATH = '.well-known/microsoft-officeaddins-allowed.json';

	/**
	 * Hooks the request handler.
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public function boot(): void {
		add_action( 'parse_request', [ $this, 'maybe_serve' ], 0 );
	}

	/**
	 * Whether WordPress serves the origin root (home URL without a path).
	 *
	 * @since 1.3.0
	 *
	 * @return bool
	 */
	public static function at_origin_root(): bool {
		$path = (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH );
		return '' === trim( $path, '/' );
	}

	/**
	 * Absolute URL of the well-known file for this origin.
	 *
	 * @since 1.3.0
	 *
	 * @return string
	 */
	public static function url(): string {
		$origin = OutlookCors::site_origin();
		return '' === $origin ? '' : $origin . '/' . self::PATH;
	}

	/**
	 * The JSON document.
	 *
	 * @since 1.3.0
	 *
	 * @return array{allowed: string[]}
	 */
	public static function payload(): array {
		return [
			'allowed' => [ plugins_url( 'assets/outlook/launchevent.js', IMGSIG_FILE ) ],
		];
	}

	/**
	 * `parse_request`: answers the well-known path and stops.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $wp The `WP` instance.
	 *
	 * @return void
	 */
	public function maybe_serve( $wp ): void {
		$request = is_object( $wp ) && isset( $wp->request ) ? trim( (string) $wp->request, '/' ) : '';
		if ( self::PATH !== $request || ! self::at_origin_root() ) {
			return;
		}

		$settings = OutlookSettings::get();
		if ( empty( $settings['enabled'] ) ) {
			return; // WordPress carries on and answers 404.
		}

		nocache_headers();
		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'X-Content-Type-Options: nosniff' );
		echo wp_json_encode( self::payload(), JSON_UNESCAPED_SLASHES ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- JSON document.
		exit;
	}
}
