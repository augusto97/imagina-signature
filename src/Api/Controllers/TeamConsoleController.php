<?php
/**
 * Team console listing.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Api\Middleware\CapabilityCheck;
use ImaginaSignatures\Setup\CapabilitiesInstaller;
use ImaginaSignatures\Team\TeamDirectory;
use ImaginaSignatures\Team\TeamRows;

defined( 'ABSPATH' ) || exit;

/**
 * `GET /admin/team` (`imgsig_manage_team`, 1.3.0) — the Team page in
 * one call:
 *
 * `?search&group&state&page&per_page` (≤ 100) →
 * ```
 * { items: [ { id, display_name, email, roles, groups, avatar, can_use,
 *              signature_count, primary, html, gmail, outlook, install } ],
 *   total, page, per_page, total_pages,
 *   summary: { users, with_signature, without_signature, outdated_html,
 *              gmail_pushed, gmail_failed, outlook_delivered, installed,
 *              install_outdated, not_installed, stale_signatures },
 *   channels: { gmail: { configured, auto_push }, outlook: { enabled } } }
 * ```
 * plus `X-WP-Total` / `X-WP-TotalPages`. Every user who can use
 * signatures is listed (display-name order); `summary` counts the whole
 * `search` / `group` scope regardless of `state` and the page.
 * `stale_signatures` counts every non-archived signature with outdated
 * HTML (what "Recompile" walks through `/admin/signatures/stale`). Row
 * shape: {@see TeamRows}.
 *
 * @since 1.3.0
 */
final class TeamConsoleController extends BaseController {

	/**
	 * @var TeamDirectory
	 */
	private TeamDirectory $directory;

	/**
	 * @param TeamDirectory $directory Team data.
	 */
	public function __construct( TeamDirectory $directory ) {
		$this->directory = $directory;
	}

	/**
	 * @inheritDoc
	 */
	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/admin/team',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'index' ],
					'permission_callback' => CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_MANAGE_TEAM ),
					'args'                => [
						'search'   => [
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_text_field',
						],
						'group'    => [
							'type'    => 'integer',
							'minimum' => 0,
						],
						'state'    => [
							'type'    => 'string',
							'enum'    => TeamRows::STATES,
							'default' => TeamRows::STATE_ALL,
						],
						'page'     => [
							'type'    => 'integer',
							'minimum' => 1,
							'default' => 1,
						],
						'per_page' => [
							'type'    => 'integer',
							'minimum' => 1,
							'maximum' => TeamDirectory::MAX_PER_PAGE,
							'default' => TeamDirectory::PER_PAGE,
						],
					],
				],
			]
		);
	}

	/**
	 * `GET /admin/team`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response
	 */
	public function index( \WP_REST_Request $request ): \WP_REST_Response {
		$state  = $request->get_param( 'state' );
		$search = $request->get_param( 'search' );
		$result = $this->directory->query(
			[
				'search'   => is_string( $search ) ? $search : '',
				'group'    => max( 0, (int) $request->get_param( 'group' ) ),
				'state'    => is_string( $state ) ? $state : TeamRows::STATE_ALL,
				'page'     => $this->read_int( $request, 'page', 1 ),
				'per_page' => min( TeamDirectory::MAX_PER_PAGE, $this->read_int( $request, 'per_page', TeamDirectory::PER_PAGE ) ),
			]
		);

		$response = rest_ensure_response( $result );
		$response->header( 'X-WP-Total', (string) $result['total'] );
		$response->header( 'X-WP-TotalPages', (string) $result['total_pages'] );
		return $response;
	}
}
