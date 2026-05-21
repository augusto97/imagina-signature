<?php
/**
 * Frontend route registrar + dispatcher.
 *
 * @package ImaginaSignatures\Frontend
 */

declare(strict_types=1);

namespace ImaginaSignatures\Frontend;

defined( 'ABSPATH' ) || exit;

/**
 * Owns the rewrite rules + `template_redirect` dispatch for the
 * public-facing `/<slug>/` route.
 *
 * Why a custom rewrite rather than a page-with-shortcode: a shortcode
 * would inherit the theme's header / footer / sidebar, and we want
 * the editor + dashboard to take over the full viewport without theme
 * chrome — same UX as the wp-admin pages. Going through the rewrite
 * system + `template_redirect` lets us bail out of WordPress's normal
 * template loader and serve our own HTML directly.
 *
 * Three URLs:
 *
 *   /<slug>/                — public signature list (admin React bundle, page='signatures')
 *   /<slug>/editor/         — new signature editor (editor React bundle, signatureId=0)
 *   /<slug>/editor/{id}/    — existing signature editor (editor bundle, signatureId={id})
 *
 * The `{id}` segment is a positive integer; any non-numeric value
 * falls through to a 404 because the rewrite rule's regex won't match.
 *
 * @since 1.0.24
 */
final class FrontendRouter {

	/** Custom query var: `index|editor` — set by the rewrite rule. */
	public const QV_VIEW = 'imgsig_frontend';

	/** Custom query var: optional signature id for the editor view. */
	public const QV_ID = 'imgsig_signature_id';

	/**
	 * Boot hooks. Idempotent.
	 *
	 * @since 1.0.24
	 *
	 * @return void
	 */
	public function boot(): void {
		add_action( 'init', [ self::class, 'register_rewrite_rules' ], 10 );
		add_filter( 'query_vars', [ self::class, 'register_query_vars' ] );
		add_action( 'template_redirect', [ $this, 'dispatch' ] );
	}

	/**
	 * Adds the rewrite rules. Static so {@see FrontendAccess::update()}
	 * can call it when the slug changes (before flushing) without
	 * having to construct a router.
	 *
	 * Registers rules whether or not the feature is enabled — the
	 * `dispatch` step short-circuits to a 404 when disabled. Removing
	 * + re-adding rules on every enable/disable toggle would force a
	 * rewrite-flush which is more expensive than the 404 path.
	 *
	 * @since 1.0.24
	 *
	 * @return void
	 */
	public static function register_rewrite_rules(): void {
		$slug = FrontendAccess::slug();
		$quoted = preg_quote( $slug, '/' );

		add_rewrite_rule(
			'^' . $quoted . '/?$',
			'index.php?' . self::QV_VIEW . '=index',
			'top'
		);

		add_rewrite_rule(
			'^' . $quoted . '/editor/?$',
			'index.php?' . self::QV_VIEW . '=editor&' . self::QV_ID . '=0',
			'top'
		);

		add_rewrite_rule(
			'^' . $quoted . '/editor/([0-9]+)/?$',
			'index.php?' . self::QV_VIEW . '=editor&' . self::QV_ID . '=$matches[1]',
			'top'
		);
	}

	/**
	 * Registers our query vars so WP keeps them on the request after
	 * matching the rewrite rule.
	 *
	 * @since 1.0.24
	 *
	 * @param array<int, string> $vars Existing query vars.
	 *
	 * @return array<int, string>
	 */
	public static function register_query_vars( array $vars ): array {
		$vars[] = self::QV_VIEW;
		$vars[] = self::QV_ID;
		return $vars;
	}

	/**
	 * Intercepts the request after WP has parsed the URL but before
	 * the theme template loads. If our query var is set, we own the
	 * response; otherwise let WordPress continue.
	 *
	 * @since 1.0.24
	 *
	 * @return void
	 */
	public function dispatch(): void {
		$view = (string) get_query_var( self::QV_VIEW );
		if ( '' === $view ) {
			return;
		}

		// Feature disabled in settings → 404 cleanly. Without this,
		// hitting the URL after disabling would still render the
		// editor because the rewrite rule is still registered.
		if ( ! FrontendAccess::is_enabled() ) {
			global $wp_query;
			if ( null !== $wp_query ) {
				$wp_query->set_404();
				status_header( 404 );
			}
			return;
		}

		$id = (int) get_query_var( self::QV_ID );

		( new FrontendPage() )->render( $view, $id );
		exit;
	}
}
