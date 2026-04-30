<?php
/**
 * Asset enqueuer for the React editor.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Loads `build/editor.js` + `build/editor.css` and injects the
 * `IMGSIG_EDITOR_CONFIG` bootstrap object on the editor page.
 *
 * The Vite bundle imports a shared chunk via ES modules, so the
 * script tag MUST carry `type="module"`. WordPress's enqueue API
 * doesn't have a native modifier for that — we filter
 * `script_loader_tag` to rewrite the tag for our handle.
 *
 * Loaded only on the editor page hook suffix that {@see AdminMenu}
 * registers — never globally.
 *
 * @since 1.0.6
 */
final class EditorAssetEnqueuer {

	private const HANDLE = 'imgsig-editor';

	/**
	 * Hook suffix WordPress assigned to the editor admin page.
	 *
	 * @var string
	 */
	private string $hook_suffix;

	/**
	 * @param string $hook_suffix Hook suffix for the editor page.
	 */
	public function __construct( string $hook_suffix ) {
		$this->hook_suffix = $hook_suffix;
	}

	/**
	 * Hooks into WordPress's asset pipeline.
	 *
	 * @since 1.0.6
	 *
	 * @return void
	 */
	public function boot(): void {
		add_action( 'admin_enqueue_scripts', [ $this, 'enqueue' ] );
		add_filter( 'script_loader_tag', [ $this, 'tag_as_module' ], 10, 2 );
	}

	/**
	 * Enqueue the editor bundle when on the editor page.
	 *
	 * @since 1.0.6
	 *
	 * @param string $hook_suffix Current admin page hook suffix.
	 *
	 * @return void
	 */
	public function enqueue( string $hook_suffix ): void {
		if ( $hook_suffix !== $this->hook_suffix ) {
			return;
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$signature_id = isset( $_GET['id'] ) ? (int) $_GET['id'] : 0;
		$version      = defined( 'IMGSIG_VERSION' ) ? IMGSIG_VERSION : '1.0.0';

		wp_enqueue_style(
			self::HANDLE,
			plugins_url( 'build/editor.css', IMGSIG_FILE ),
			[],
			$version
		);

		wp_enqueue_script(
			self::HANDLE,
			plugins_url( 'build/editor.js', IMGSIG_FILE ),
			[],
			$version,
			true
		);

		wp_add_inline_script(
			self::HANDLE,
			'window.IMGSIG_EDITOR_CONFIG = ' . wp_json_encode( $this->build_config( $signature_id ) ) . ';',
			'before'
		);
	}

	/**
	 * Rewrites our script tag to `type="module"`.
	 *
	 * @since 1.0.6
	 *
	 * @param string $tag    Existing script tag HTML.
	 * @param string $handle WP script handle.
	 *
	 * @return string
	 */
	public function tag_as_module( string $tag, string $handle ): string {
		if ( self::HANDLE !== $handle ) {
			return $tag;
		}
		return str_replace( ' src=', ' type="module" src=', $tag );
	}

	/**
	 * Build the `IMGSIG_EDITOR_CONFIG` payload.
	 *
	 * @since 1.0.6
	 *
	 * @param int $signature_id 0 for "new", >0 for existing.
	 *
	 * @return array<string, mixed>
	 */
	private function build_config( int $signature_id ): array {
		$user_id = get_current_user_id();

		return [
			'signatureId'   => $signature_id,
			'userId'        => $user_id,
			'apiBase'       => esc_url_raw( rest_url( 'imagina-signatures/v1' ) ),
			'restNonce'     => wp_create_nonce( 'wp_rest' ),
			'locale'        => get_user_locale( $user_id ),
			'pluginUrl'     => esc_url_raw( plugins_url( '', IMGSIG_FILE ) ),
			'signaturesUrl' => esc_url_raw( admin_url( 'admin.php?page=imagina-signatures' ) ),
			'capabilities'  => [
				'use'              => current_user_can( CapabilitiesInstaller::CAP_USE ),
				'manage_templates' => current_user_can( CapabilitiesInstaller::CAP_MANAGE_TEMPLATES ),
			],
		];
	}
}
