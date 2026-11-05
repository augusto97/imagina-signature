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
		add_filter( 'posts_pre_query', [ self::class, 'short_circuit_main_query' ], 10, 2 );
		add_filter( 'pre_handle_404', [ self::class, 'skip_404_handling' ], 10, 2 );
		add_action( 'template_redirect', [ $this, 'dispatch' ] );
	}

	/**
	 * Skips the main posts query on our route.
	 *
	 * The rewrite maps `/<slug>/` to `index.php?imgsig_frontend=…`,
	 * which WP_Query would otherwise treat as the blog home and run the
	 * full "latest posts" SQL for a page that never renders posts.
	 * Returning an empty array from `posts_pre_query` makes WP_Query
	 * skip the database entirely.
	 *
	 * @since 1.0.40
	 *
	 * @param array<int, mixed>|null $posts Short-circuit value (null = run the query).
	 * @param \WP_Query|mixed        $query The query.
	 *
	 * @return array<int, mixed>|null
	 */
	public static function short_circuit_main_query( $posts, $query ) {
		if ( null !== $posts || ! self::is_our_main_query( $query ) ) {
			return $posts;
		}

		$query->found_posts   = 0;
		$query->max_num_pages = 0;
		return [];
	}

	/**
	 * Keeps WP from flagging our (post-less) route as a 404 before
	 * `template_redirect` dispatches it.
	 *
	 * @since 1.0.40
	 *
	 * @param bool            $preempt Whether to short-circuit 404 handling.
	 * @param \WP_Query|mixed $query   Main query.
	 *
	 * @return bool
	 */
	public static function skip_404_handling( $preempt, $query ) {
		if ( $preempt || ! self::is_our_main_query( $query ) ) {
			return (bool) $preempt;
		}
		return true;
	}

	/**
	 * True for the main query of an enabled public-route request. When
	 * the feature is disabled the normal flow (and dispatch()'s 404)
	 * applies.
	 *
	 * @param mixed $query Candidate query.
	 *
	 * @return bool
	 */
	private static function is_our_main_query( $query ): bool {
		return is_object( $query )
			&& method_exists( $query, 'is_main_query' )
			&& method_exists( $query, 'get' )
			&& $query->is_main_query()
			&& '' !== (string) $query->get( self::QV_VIEW )
			&& FrontendAccess::is_enabled();
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
	 * Removes this plugin's rules from the in-memory rewrite registry
	 * (they were added on `init` of the current request), so a
	 * following `flush_rewrite_rules()` — e.g. on deactivation — doesn't
	 * persist them again.
	 *
	 * @since 1.0.40
	 *
	 * @return void
	 */
	public static function unregister_rewrite_rules(): void {
		global $wp_rewrite;

		if ( ! is_object( $wp_rewrite ) || ! isset( $wp_rewrite->extra_rules_top ) || ! is_array( $wp_rewrite->extra_rules_top ) ) {
			return;
		}

		foreach ( array_keys( $wp_rewrite->extra_rules_top ) as $regex ) {
			if ( false !== strpos( (string) $wp_rewrite->extra_rules_top[ $regex ], self::QV_VIEW . '=' ) ) {
				unset( $wp_rewrite->extra_rules_top[ $regex ] );
			}
		}
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
