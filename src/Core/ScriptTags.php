<?php
/**
 * Script-tag helpers shared by every page the plugin prints.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

defined( 'ABSPATH' ) || exit;

/**
 * Keeps the plugin's `<script>` tags out of script optimisers that
 * rewrite them.
 *
 * Cloudflare Rocket Loader (and similar "defer all JavaScript" features)
 * swaps every `<script>` for a placeholder and later re-creates it from
 * its own loader. Re-created inline scripts lose their CSP nonce, so on
 * the public route and the install page the browser blocks the bootstrap
 * (`window.IMGSIG_ADMIN_CONFIG = …`) and the app never starts; in
 * wp-admin the config and the module bundle could also run out of order.
 * `data-cfasync="false"` is Cloudflare's documented opt-out.
 *
 * @since 1.3.1
 */
final class ScriptTags {

	/**
	 * Attribute that tells Cloudflare Rocket Loader to leave a script alone.
	 */
	public const OPT_OUT = 'data-cfasync="false"';

	/**
	 * Adds {@see self::OPT_OUT} to every `<script` opening tag in `$html`
	 * that doesn't carry it yet. Idempotent.
	 *
	 * @since 1.3.1
	 *
	 * @param string $html One or more script tags (e.g. a `script_loader_tag`
	 *                     value, which includes the handle's inline scripts).
	 *
	 * @return string
	 */
	public static function opt_out_of_optimizers( string $html ): string {
		$out = preg_replace_callback(
			'/<script\b([^>]*)>/i',
			static function ( array $m ): string {
				if ( false !== stripos( $m[1], 'data-cfasync' ) ) {
					return $m[0];
				}
				return '<script ' . self::OPT_OUT . $m[1] . '>';
			},
			$html
		);
		return is_string( $out ) ? $out : $html;
	}
}
