<?php
/**
 * Google Workspace (Gmail push) endpoints.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Api\Middleware\CapabilityCheck;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Deployment\DeploymentStatus;
use ImaginaSignatures\Deployment\Gmail\GmailApi;
use ImaginaSignatures\Deployment\Gmail\GmailException;
use ImaginaSignatures\Deployment\Gmail\GmailPusher;
use ImaginaSignatures\Deployment\Gmail\GmailScheduler;
use ImaginaSignatures\Deployment\Gmail\GmailSettings;
use ImaginaSignatures\Deployment\Gmail\GmailUserDirectory;
use ImaginaSignatures\Exceptions\ImaginaSignaturesException;
use ImaginaSignatures\Services\SignatureService;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * `imgsig_manage_team` endpoints under `/admin/deploy/gmail/`:
 *
 *  - `GET    settings` — connection state; never the private key.
 *  - `PATCH  settings` — `{service_account?: string|object, domains?: string[]|string,
 *                        auto_push?: bool, daily_sync?: bool, push_aliases?: bool}`.
 *  - `DELETE settings` — forget the service account.
 *  - `POST   test`     — `{email}` → impersonate and list send-as addresses,
 *                        with a diagnosis on failure.
 *  - `POST   push`     — `{user_ids?: int[], all?: bool, force?: bool, offset?: int}`
 *                        → ≤ 20 users per call: `{results, next_offset|null, total, processed}`.
 *  - `GET    status`   — `?user_ids=1,2,3` → each user's `gmail` deployment record.
 *
 * @since 1.3.0
 */
final class GmailDeployController extends BaseController {

	/** Users pushed per bulk request. */
	public const PUSH_BATCH = 20;

	/** Wall-clock budget of one bulk request, in seconds. */
	public const PUSH_TIME_BUDGET = 15;

	/** Most user IDs accepted by `push` (explicit list). */
	public const MAX_PUSH_IDS = 5000;

	/** Most user IDs accepted by `status`. */
	public const MAX_STATUS_IDS = 100;

	private const RL_PUSH_ACTION = 'gmail_push';
	private const RL_PUSH_MAX    = 600;
	private const RL_TEST_ACTION = 'gmail_test';
	private const RL_TEST_MAX    = 20;
	private const RL_TEST_WINDOW = 300;

	/**
	 * @var GmailSettings
	 */
	private GmailSettings $settings;

	/**
	 * @var GmailApi
	 */
	private GmailApi $api;

	/**
	 * @var GmailPusher
	 */
	private GmailPusher $pusher;

	/**
	 * @var GmailScheduler
	 */
	private GmailScheduler $scheduler;

	/**
	 * @var GmailUserDirectory
	 */
	private GmailUserDirectory $users;

	/**
	 * @var RateLimiter
	 */
	private RateLimiter $rate_limiter;

	/**
	 * @var SignatureService
	 */
	private SignatureService $signatures;

	/**
	 * @param GmailSettings      $settings     Settings.
	 * @param GmailApi           $api          Gmail API client.
	 * @param GmailPusher        $pusher       Pusher.
	 * @param GmailScheduler     $scheduler    Automation.
	 * @param GmailUserDirectory $users        Signature owners.
	 * @param RateLimiter        $rate_limiter Rate limiter.
	 * @param SignatureService   $signatures   Primary-signature lookup.
	 */
	public function __construct(
		GmailSettings $settings,
		GmailApi $api,
		GmailPusher $pusher,
		GmailScheduler $scheduler,
		GmailUserDirectory $users,
		RateLimiter $rate_limiter,
		SignatureService $signatures
	) {
		$this->settings     = $settings;
		$this->api          = $api;
		$this->pusher       = $pusher;
		$this->scheduler    = $scheduler;
		$this->users        = $users;
		$this->rate_limiter = $rate_limiter;
		$this->signatures   = $signatures;
	}

	/**
	 * @inheritDoc
	 */
	public function register_routes(): void {
		$permission = CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_MANAGE_TEAM );
		$base       = '/admin/deploy/gmail';

		register_rest_route(
			self::NAMESPACE,
			$base . '/settings',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'show_settings' ],
					'permission_callback' => $permission,
				],
				[
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => [ $this, 'update_settings' ],
					'permission_callback' => $permission,
					'args'                => [
						'service_account' => [ 'type' => [ 'string', 'object' ] ],
						'domains'         => [ 'type' => [ 'array', 'string' ] ],
						'auto_push'       => [ 'type' => 'boolean' ],
						'daily_sync'      => [ 'type' => 'boolean' ],
						'push_aliases'    => [ 'type' => 'boolean' ],
					],
				],
				[
					'methods'             => 'DELETE',
					'callback'            => [ $this, 'forget_settings' ],
					'permission_callback' => $permission,
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			$base . '/test',
			[
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'test' ],
					'permission_callback' => $permission,
					'args'                => [
						'email' => [
							'type'     => 'string',
							'required' => true,
						],
					],
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			$base . '/push',
			[
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'push' ],
					'permission_callback' => $permission,
					'args'                => [
						'user_ids' => [
							'type'  => 'array',
							'items' => [ 'type' => 'integer' ],
						],
						'all'      => [ 'type' => 'boolean' ],
						'force'    => [ 'type' => 'boolean' ],
						'offset'   => [
							'type'    => 'integer',
							'minimum' => 0,
						],
					],
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			$base . '/status',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'status' ],
					'permission_callback' => $permission,
					'args'                => [
						'user_ids' => [
							'type'     => 'array',
							'items'    => [ 'type' => 'integer' ],
							'required' => true,
						],
					],
				],
			]
		);
	}

	/**
	 * `GET /admin/deploy/gmail/settings`.
	 *
	 * @since 1.3.0
	 *
	 * @return \WP_REST_Response
	 */
	public function show_settings(): \WP_REST_Response {
		$view          = $this->settings->public_view();
		$view['ready'] = $view['configured'] && ! empty( $view['domains'] );
		$view['sync']  = $this->scheduler->sync_state();

		$next                    = wp_next_scheduled( GmailScheduler::DAILY_HOOK );
		$view['next_daily_sync'] = false === $next ? null : gmdate( 'Y-m-d H:i:s', (int) $next );

		$user                = wp_get_current_user();
		$hint                = $user ? GmailSettings::domain_of( (string) $user->user_email ) : '';
		$view['domain_hint'] = in_array( $hint, [ 'gmail.com', 'googlemail.com' ], true ) ? '' : $hint;

		return rest_ensure_response( $view );
	}

	/**
	 * `PATCH /admin/deploy/gmail/settings`.
	 *
	 * Everything is validated before anything is written: an invalid key
	 * file or domain leaves the stored settings untouched (400 with
	 * field-level `errors`).
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function update_settings( \WP_REST_Request $request ) {
		$before = $this->settings->public_view();

		try {
			$service_account = null;
			$raw             = $request->get_param( 'service_account' );
			if ( null !== $raw && '' !== $raw && [] !== $raw ) {
				$service_account = GmailSettings::parse_service_account( $raw );
			}

			$changes = [];
			$domains = $request->get_param( 'domains' );
			if ( null !== $domains ) {
				$changes['domains'] = GmailSettings::sanitize_domains( $domains );
			}
			foreach ( [ 'auto_push', 'daily_sync', 'push_aliases' ] as $flag ) {
				$value = $request->get_param( $flag );
				if ( null !== $value ) {
					$changes[ $flag ] = rest_sanitize_boolean( $value );
				}
			}

			$this->settings->save( $service_account, $changes );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$this->scheduler->sync_with_settings( $before );

		return $this->show_settings();
	}

	/**
	 * `DELETE /admin/deploy/gmail/settings` — forget the service account.
	 *
	 * @since 1.3.0
	 *
	 * @return \WP_REST_Response
	 */
	public function forget_settings(): \WP_REST_Response {
		$before = $this->settings->public_view();
		$this->settings->forget_credentials();
		$this->scheduler->sync_with_settings( $before );

		return $this->show_settings();
	}

	/**
	 * `POST /admin/deploy/gmail/test` — `{email}`.
	 *
	 * Gets a fresh token impersonating `email` and lists their send-as
	 * addresses. Answers 200 either way: `{success, code, message, …}`
	 * with Google's text in `google` and a fix-it link in `help_url`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function test( \WP_REST_Request $request ) {
		try {
			$this->rate_limiter->check( self::RL_TEST_ACTION, get_current_user_id(), self::RL_TEST_MAX, self::RL_TEST_WINDOW );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$email = strtolower( sanitize_email( (string) $request->get_param( 'email' ) ) );
		if ( '' === $email || ! is_email( $email ) ) {
			return new \WP_Error(
				'imgsig_invalid_email',
				__( 'Enter the email address of a user in your Google Workspace.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}

		if ( ! $this->settings->is_configured() ) {
			return rest_ensure_response(
				$this->test_failure( GmailException::NOT_CONFIGURED, __( 'Upload the service-account JSON key first.', 'imagina-signatures' ), $email )
			);
		}

		$domains = $this->settings->domains();
		if ( ! empty( $domains ) && ! $this->settings->is_domain_allowed( $email ) ) {
			return rest_ensure_response(
				$this->test_failure(
					'domain_not_allowed',
					sprintf(
						/* translators: 1: email domain, 2: comma-separated allowed domains. */
						__( '%1$s is outside the allowed domains (%2$s). Add it to the allowed domains and save, or test with an address in one of them.', 'imagina-signatures' ),
						GmailSettings::domain_of( $email ),
						implode( ', ', $domains )
					),
					$email
				)
			);
		}

		try {
			$send_as = $this->api->list_send_as( $email, true );
		} catch ( GmailException $e ) {
			$failure = $e->to_array();
			return rest_ensure_response(
				[
					'success' => false,
					'email'   => $email,
				] + $failure
			);
		}

		$warnings = [];
		if ( empty( $domains ) ) {
			$warnings[] = __( 'No allowed domains are saved yet: pushes skip every user until you add your Workspace domain(s).', 'imagina-signatures' );
		}

		return rest_ensure_response(
			[
				'success'  => true,
				'code'     => 'ok',
				'email'    => $email,
				'message'  => sprintf(
					/* translators: 1: number of addresses, 2: email address. */
					_n(
						'Connected. Gmail returned %1$d send-as address for %2$s.',
						'Connected. Gmail returned %1$d send-as addresses for %2$s.',
						count( $send_as ),
						'imagina-signatures'
					),
					count( $send_as ),
					$email
				),
				'send_as'  => $send_as,
				'warnings' => $warnings,
			]
		);
	}

	/**
	 * `POST /admin/deploy/gmail/push`.
	 *
	 * Processes at most {@see PUSH_BATCH} users (fewer when the time
	 * budget runs out) starting at `offset`, and returns `next_offset`
	 * (null when done) so the client loops until everyone is pushed.
	 * `all: true` = every user owning a signature, by user ID.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function push( \WP_REST_Request $request ) {
		try {
			$this->rate_limiter->check( self::RL_PUSH_ACTION, get_current_user_id(), self::RL_PUSH_MAX, HOUR_IN_SECONDS );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		if ( ! $this->settings->is_configured() ) {
			return new \WP_Error(
				'imgsig_gmail_not_configured',
				__( 'Google Workspace is not connected yet: upload the service-account key first.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}

		$offset = max( 0, (int) $request->get_param( 'offset' ) );
		$force  = rest_sanitize_boolean( $request->get_param( 'force' ) ?? false );
		$ids    = $this->read_user_ids( $request->get_param( 'user_ids' ), self::MAX_PUSH_IDS );

		if ( ! empty( $ids ) ) {
			$total = count( $ids );
			$page  = array_slice( $ids, $offset, self::PUSH_BATCH );
		} elseif ( rest_sanitize_boolean( $request->get_param( 'all' ) ?? false ) ) {
			$total = $this->users->count_owners();
			$page  = $this->users->owner_ids_page( $offset, self::PUSH_BATCH );
		} else {
			return new \WP_Error(
				'imgsig_gmail_no_users',
				__( 'Pass user_ids or all: true.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}

		$deadline = microtime( true ) + self::PUSH_TIME_BUDGET;
		$results  = [];
		foreach ( $page as $user_id ) {
			if ( ! empty( $results ) && microtime( true ) >= $deadline ) {
				break;
			}
			$results[] = $this->pusher->push_user( $user_id, $force )->to_array();
		}

		$next      = $offset + count( $results );
		$cut_short = count( $results ) < count( $page );
		$more      = $cut_short || ( count( $page ) === self::PUSH_BATCH && $next < $total );

		return rest_ensure_response(
			[
				'results'     => $results,
				'next_offset' => $more ? $next : null,
				'total'       => max( $total, $next ),
				'processed'   => $next,
			]
		);
	}

	/**
	 * `GET /admin/deploy/gmail/status?user_ids=1,2,3`.
	 *
	 * Per user: the `gmail` DeploymentStatus record (null when never
	 * pushed), the primary signature's current `html_hash`, and whether
	 * the two match.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function status( \WP_REST_Request $request ) {
		$ids = $this->read_user_ids( $request->get_param( 'user_ids' ), self::MAX_STATUS_IDS );
		if ( empty( $ids ) ) {
			return new \WP_Error(
				'imgsig_gmail_no_users',
				__( 'Pass user_ids.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}

		$items = [];
		foreach ( $ids as $user_id ) {
			$record  = DeploymentStatus::get( $user_id )[ GmailPusher::CHANNEL ] ?? null;
			$primary = $this->signatures->primary_for_user( $user_id );
			$current = null;
			if ( null !== $primary && $primary->has_html && ! $primary->is_html_stale() ) {
				$current = null !== $primary->html_hash && '' !== $primary->html_hash
					? $primary->html_hash
					: hash( 'sha256', (string) $primary->html_cache );
			}

			$items[] = [
				'user_id'         => $user_id,
				'gmail'           => $record,
				'current_hash'    => $current,
				'needs_recompile' => null !== $primary && null === $current,
				'up_to_date'      => is_array( $record ) && null !== $current
					&& ( $record['hash'] ?? null ) === $current && empty( $record['error'] ),
			];
		}

		return rest_ensure_response( [ 'items' => $items ] );
	}

	/**
	 * Failure payload of the connection test.
	 *
	 * @param string $code    Diagnosis.
	 * @param string $message Message.
	 * @param string $email   Tested address.
	 *
	 * @return array<string, mixed>
	 */
	private function test_failure( string $code, string $message, string $email ): array {
		return [
			'success'     => false,
			'email'       => $email,
			'code'        => $code,
			'message'     => $message,
			'http_status' => 0,
			'retryable'   => false,
			'retry_after' => 0,
			'google'      => '',
			'help_url'    => '',
		];
	}

	/**
	 * Unique positive user IDs from an array or a comma-separated list.
	 *
	 * @param mixed $raw   Parameter.
	 * @param int   $limit Most IDs kept.
	 *
	 * @return int[]
	 */
	private function read_user_ids( $raw, int $limit ): array {
		if ( is_string( $raw ) ) {
			$raw = explode( ',', $raw );
		}
		if ( ! is_array( $raw ) ) {
			return [];
		}
		$ids = [];
		foreach ( $raw as $value ) {
			$id = is_scalar( $value ) ? (int) $value : 0;
			if ( $id > 0 ) {
				$ids[ $id ] = $id;
			}
		}
		return array_slice( array_values( $ids ), 0, $limit );
	}
}
