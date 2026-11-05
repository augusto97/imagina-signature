<?php
/**
 * Install-link invitations and reminders (admin).
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Api\Middleware\CapabilityCheck;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Deployment\Install\InstallReminders;
use ImaginaSignatures\Deployment\Install\InvitationMailer;
use ImaginaSignatures\Deployment\Install\InvitationQueue;
use ImaginaSignatures\Exceptions\ImaginaSignaturesException;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Routes (all `imgsig_manage_team`):
 *
 *  - `POST   /admin/deploy/invitations` — `{ user_ids?: int[], group_ids?: int[], all?: bool, message?: string }`:
 *    queues an invitation email for every resolved user (sent by WP-Cron
 *    in batches of 50). `group_ids` are terms of the `imgsig_group` user
 *    taxonomy and are only honoured when that taxonomy exists. 202 with
 *    the progress; 409 while another run is in progress.
 *  - `GET    /admin/deploy/invitations/progress` — progress of the current / last run.
 *  - `DELETE /admin/deploy/invitations` — cancels the current run.
 *  - `GET    /admin/deploy/invitations/settings` / `PATCH` — reminder settings.
 *
 * @since 1.3.0
 */
final class DeployInvitationsController extends BaseController {

	/**
	 * User taxonomy owned by the groups feature.
	 */
	public const GROUP_TAXONOMY = 'imgsig_group';

	private const RL_ACTION = 'deploy_invitations';
	private const RL_MAX    = 20;

	/**
	 * @var InvitationQueue
	 */
	private InvitationQueue $queue;

	/**
	 * @var RateLimiter
	 */
	private RateLimiter $rate_limiter;

	/**
	 * @param InvitationQueue $queue        Email queue.
	 * @param RateLimiter     $rate_limiter Rate limiter.
	 */
	public function __construct( InvitationQueue $queue, RateLimiter $rate_limiter ) {
		$this->queue        = $queue;
		$this->rate_limiter = $rate_limiter;
	}

	/**
	 * @inheritDoc
	 */
	public function register_routes(): void {
		$require_team = CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_MANAGE_TEAM );
		$id_list      = [
			'type'  => 'array',
			'items' => [ 'type' => 'integer' ],
		];

		register_rest_route(
			self::NAMESPACE,
			'/admin/deploy/invitations',
			[
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'create' ],
					'permission_callback' => $require_team,
					'args'                => [
						'user_ids'  => $id_list,
						'group_ids' => $id_list,
						'all'       => [ 'type' => 'boolean' ],
						'message'   => [
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_textarea_field',
						],
					],
				],
				[
					'methods'             => 'DELETE',
					'callback'            => [ $this, 'cancel' ],
					'permission_callback' => $require_team,
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/deploy/invitations/progress',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'progress' ],
					'permission_callback' => $require_team,
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/deploy/invitations/settings',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'get_settings' ],
					'permission_callback' => $require_team,
				],
				[
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => [ $this, 'update_settings' ],
					'permission_callback' => $require_team,
					'args'                => [
						'enabled'    => [ 'type' => 'boolean' ],
						'after_days' => [ 'type' => 'integer' ],
						'max'        => [ 'type' => 'integer' ],
					],
				],
			]
		);
	}

	/**
	 * `POST /admin/deploy/invitations`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function create( \WP_REST_Request $request ) {
		if ( $this->queue->is_running() ) {
			return self::busy();
		}

		$warnings = [];
		$ids      = $this->resolve_recipients( $request, $warnings );
		if ( empty( $ids ) ) {
			return new \WP_Error(
				'imgsig_no_recipients',
				__( 'Choose at least one person to invite.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}

		try {
			$this->rate_limiter->check( self::RL_ACTION, get_current_user_id(), self::RL_MAX, HOUR_IN_SECONDS );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$progress = $this->queue->start(
			$ids,
			InvitationMailer::KIND_INVITE,
			(string) $request->get_param( 'message' ),
			get_current_user_id()
		);
		if ( null === $progress ) {
			return self::busy();
		}

		$response = rest_ensure_response( $progress + [ 'warnings' => $warnings ] );
		$response->set_status( 202 );
		return $response;
	}

	/**
	 * `GET /admin/deploy/invitations/progress`. Also re-arms a run whose
	 * cron chain broke.
	 *
	 * @since 1.3.0
	 *
	 * @return \WP_REST_Response
	 */
	public function progress(): \WP_REST_Response {
		$this->queue->ensure_scheduled();
		return rest_ensure_response( $this->queue->progress() ?? self::idle() );
	}

	/**
	 * `DELETE /admin/deploy/invitations`.
	 *
	 * @since 1.3.0
	 *
	 * @return \WP_REST_Response
	 */
	public function cancel(): \WP_REST_Response {
		return rest_ensure_response( $this->queue->cancel() ?? self::idle() );
	}

	/**
	 * `GET /admin/deploy/invitations/settings`.
	 *
	 * @since 1.3.0
	 *
	 * @return \WP_REST_Response
	 */
	public function get_settings(): \WP_REST_Response {
		return rest_ensure_response( InstallReminders::settings() );
	}

	/**
	 * `PATCH /admin/deploy/invitations/settings`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response
	 */
	public function update_settings( \WP_REST_Request $request ): \WP_REST_Response {
		$patch = [];
		foreach ( [ 'enabled', 'after_days', 'max' ] as $key ) {
			if ( null !== $request->get_param( $key ) ) {
				$patch[ $key ] = $request->get_param( $key );
			}
		}
		return rest_ensure_response( InstallReminders::update( $patch ) );
	}

	/**
	 * User ids from `all` / `user_ids` / `group_ids`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request  Inbound.
	 * @param string[]         $warnings Receives notes for the response.
	 *
	 * @return int[]
	 */
	public function resolve_recipients( \WP_REST_Request $request, array &$warnings = [] ): array {
		$ids = [];

		if ( true === rest_sanitize_boolean( $request->get_param( 'all' ) ) ) {
			$all = get_users(
				[
					'capability'  => CapabilitiesInstaller::CAP_USE,
					'fields'      => 'ID',
					'number'      => -1,
					'count_total' => false,
				]
			);
			foreach ( is_array( $all ) ? $all : [] as $id ) {
				$ids[] = (int) $id;
			}
		}

		foreach ( self::int_list( $request->get_param( 'user_ids' ) ) as $id ) {
			$ids[] = $id;
		}

		$groups = self::int_list( $request->get_param( 'group_ids' ) );
		if ( ! empty( $groups ) ) {
			if ( taxonomy_exists( self::GROUP_TAXONOMY ) ) {
				$members = get_objects_in_term( $groups, self::GROUP_TAXONOMY );
				foreach ( is_array( $members ) ? $members : [] as $id ) {
					$ids[] = (int) $id;
				}
			} else {
				$warnings[] = 'groups_unavailable';
			}
		}

		return array_values( array_unique( array_filter( $ids, static fn ( int $id ): bool => $id > 0 ) ) );
	}

	/**
	 * Positive integers of an untrusted list.
	 *
	 * @param mixed $value Raw param.
	 *
	 * @return int[]
	 */
	private static function int_list( $value ): array {
		if ( ! is_array( $value ) ) {
			return [];
		}
		$out = [];
		foreach ( $value as $item ) {
			if ( is_numeric( $item ) && (int) $item > 0 ) {
				$out[] = (int) $item;
			}
		}
		return $out;
	}

	/**
	 * 409 while a run is in progress.
	 *
	 * @return \WP_Error
	 */
	private static function busy(): \WP_Error {
		return new \WP_Error(
			'imgsig_invitations_running',
			__( 'Invitations are still being sent. Wait for them to finish, or cancel them first.', 'imagina-signatures' ),
			[ 'status' => 409 ]
		);
	}

	/**
	 * Progress shape when nothing was ever sent.
	 *
	 * @return array<string, mixed>
	 */
	private static function idle(): array {
		return [
			'id'          => null,
			'kind'        => null,
			'status'      => 'idle',
			'running'     => false,
			'total'       => 0,
			'processed'   => 0,
			'pending'     => 0,
			'sent'        => 0,
			'failed'      => 0,
			'skipped'     => 0,
			'percent'     => 0,
			'created_at'  => null,
			'updated_at'  => null,
			'finished_at' => null,
			'report'      => [],
		];
	}
}
