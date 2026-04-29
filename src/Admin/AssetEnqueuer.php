<?php
/**
 * Conditionally enqueues plugin scripts and styles inside wp-admin.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Loads bundle assets only on the plugin's screens.
 *
 * The editor bundle and the admin (settings/plans/users) bundle are split so
 * the heavy GrapesJS payload only ships when the editor is open.
 *
 * @since 1.0.0
 */
final class AssetEnqueuer {

	private const HANDLE_EDITOR = 'imagina-signatures-editor';
	private const HANDLE_ADMIN  = 'imagina-signatures-admin';

	/**
	 * Hooks the enqueue callback.
	 *
	 * @return void
	 */
	public function register(): void {
		add_action( 'admin_enqueue_scripts', [ $this, 'enqueue' ] );
		add_filter( 'script_loader_tag', [ $this, 'as_module' ], 10, 3 );
	}

	/**
	 * Promotes our bundles to ES modules.
	 *
	 * Vite outputs ESM that uses `import`, so the script tag must include
	 * `type="module"` or the browser parses it as a classic script and
	 * raises a SyntaxError on the first `import`.
	 *
	 * @param string $tag    Original script tag.
	 * @param string $handle Script handle.
	 * @param string $src    Script src URL.
	 *
	 * @return string
	 */
	public function as_module( string $tag, string $handle, string $src ): string {
		if ( self::HANDLE_EDITOR !== $handle && self::HANDLE_ADMIN !== $handle ) {
			return $tag;
		}
		// Replace the existing <script ...> opening with one that has type="module".
		$tag = preg_replace(
			'/<script(?![^>]*type=)/',
			'<script type="module"',
			$tag
		);
		return is_string( $tag ) ? $tag : '';
	}

	/**
	 * Enqueues bundles based on the current screen.
	 *
	 * @param string $hook_suffix Current admin page hook.
	 *
	 * @return void
	 */
	public function enqueue( string $hook_suffix ): void {
		if ( ! $this->is_plugin_screen( $hook_suffix ) ) {
			return;
		}

		// The dashboard, editor, and templates screens share the editor bundle
		// (drag-and-drop SPA + signature picker). The plans, users, storage,
		// settings, and setup screens use the lighter admin bundle.
		$editor_pages = [ 'imagina-signatures', 'imagina-signatures-editor', 'imagina-signatures-templates' ];
		$is_editor    = false;
		foreach ( $editor_pages as $page ) {
			if ( false !== strpos( $hook_suffix, $page ) && false === strpos( $hook_suffix, 'imagina-signatures-plans' )
				&& false === strpos( $hook_suffix, 'imagina-signatures-users' )
				&& false === strpos( $hook_suffix, 'imagina-signatures-storage' )
				&& false === strpos( $hook_suffix, 'imagina-signatures-settings' )
				&& false === strpos( $hook_suffix, 'imagina-signatures-setup' ) ) {
				$is_editor = true;
				break;
			}
		}

		$build_dir = IMGSIG_PLUGIN_DIR . 'build/';
		$build_url = IMGSIG_PLUGIN_URL . 'build/';
		$version   = IMGSIG_VERSION;

		if ( $is_editor && file_exists( $build_dir . 'editor.js' ) ) {
			wp_enqueue_script( self::HANDLE_EDITOR, $build_url . 'editor.js', [ 'wp-i18n', 'wp-api-fetch' ], $version, true );
			if ( file_exists( $build_dir . 'editor.css' ) ) {
				wp_enqueue_style( self::HANDLE_EDITOR, $build_url . 'editor.css', [], $version );
			}
			$this->localize( self::HANDLE_EDITOR );
			wp_set_script_translations( self::HANDLE_EDITOR, 'imagina-signatures', IMGSIG_PLUGIN_DIR . 'languages' );
			return;
		}

		if ( file_exists( $build_dir . 'admin.js' ) ) {
			wp_enqueue_script( self::HANDLE_ADMIN, $build_url . 'admin.js', [ 'wp-i18n', 'wp-api-fetch' ], $version, true );
			if ( file_exists( $build_dir . 'admin.css' ) ) {
				wp_enqueue_style( self::HANDLE_ADMIN, $build_url . 'admin.css', [], $version );
			}
			$this->localize( self::HANDLE_ADMIN );
			wp_set_script_translations( self::HANDLE_ADMIN, 'imagina-signatures', IMGSIG_PLUGIN_DIR . 'languages' );
		}
	}

	/**
	 * Localizes the script with bootstrap data.
	 *
	 * @param string $handle Script handle.
	 *
	 * @return void
	 */
	private function localize( string $handle ): void {
		$user = wp_get_current_user();

		$data = [
			'version'     => IMGSIG_VERSION,
			// `@wordpress/api-fetch` concatenates `apiUrl + path` literally with
			// `createRootURLMiddleware`, so we MUST end with a trailing slash;
			// otherwise `/me` is appended as `…/imgsig/v1me` and 404s.
			'apiUrl'      => esc_url_raw( rest_url( 'imgsig/v1/' ) ),
			'nonce'       => wp_create_nonce( 'wp_rest' ),
			'pluginUrl'   => IMGSIG_PLUGIN_URL,
			'currentUser' => [
				'id'           => (int) $user->ID,
				'capabilities' => array_keys( array_filter( (array) $user->allcaps ) ),
			],
			'mode'        => (string) get_option( 'imgsig_mode', 'single' ),
			'storage'     => [
				'driver'     => (string) get_option( 'imgsig_storage_driver', 'media_library' ),
				'configured' => true,
			],
			'setup'       => [
				'completed' => (bool) get_option( 'imgsig_setup_completed', false ),
			],
		];

		wp_add_inline_script(
			$handle,
			'window.ImaginaSignaturesData = ' . wp_json_encode( $data ) . ';',
			'before'
		);
	}

	/**
	 * Whether the current admin screen belongs to this plugin.
	 *
	 * @param string $hook_suffix Page hook.
	 *
	 * @return bool
	 */
	private function is_plugin_screen( string $hook_suffix ): bool {
		return false !== strpos( $hook_suffix, 'imagina-signatures' );
	}
}
