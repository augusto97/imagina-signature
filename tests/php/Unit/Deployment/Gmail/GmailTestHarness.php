<?php
/**
 * Shared fixtures for the Gmail integration tests.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment\Gmail
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment\Gmail;

use Brain\Monkey\Functions;
use ImaginaSignatures\Deployment\Gmail\GmailSettings;
use ImaginaSignatures\Security\Encryption;

require_once __DIR__ . '/../../../fixtures/wp-user-stub.php';

/**
 * In-memory WordPress for the Gmail classes: options, transients, user
 * meta, users, WP-Cron, and a `pre_http_request`-style HTTP mock — every
 * `wp_safe_remote_*()` call goes to `$this->http_handler( false, $args,
 * $url )`, which returns a response array (see {@see http_response()}),
 * a `WP_Error`, or false (= unexpected request: the test fails, nothing
 * ever reaches the network).
 *
 * Call {@see set_up_harness()} after `Monkey\setUp()`.
 */
trait GmailTestHarness {

	/** @var array<string, mixed> */
	protected array $options = [];

	/** @var array<string, array{value: mixed, ttl: int}> */
	protected array $transients = [];

	/** @var array<int, array<string, mixed>> */
	protected array $user_meta = [];

	/** @var array<int, \WP_User> */
	protected array $users = [];

	/** @var array<int, array{url: string, args: array<string, mixed>}> */
	protected array $http_requests = [];

	/** @var callable|null */
	protected $http_handler = null;

	/** @var array<int, array{hook: string, timestamp: int, args: array<int, mixed>, recurrence: string}> */
	protected array $cron = [];

	/** @var int update_user_meta() calls. */
	protected int $meta_writes = 0;

	/** @var array{private: string, public: string}|null */
	private static ?array $key_pair = null;

	protected function encryption(): Encryption {
		return new Encryption( 'gmail-tests-dedicated-key-0123456789abcdef' );
	}

	protected function set_up_harness(): void {
		$this->options       = [];
		$this->transients    = [];
		$this->user_meta     = [];
		$this->users         = [];
		$this->http_requests = [];
		$this->http_handler  = null;
		$this->cron          = [];
		$this->meta_writes   = 0;

		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'wp_json_encode' )->alias(
			static function ( $data, $options = 0, $depth = 512 ) {
				return json_encode( $data, $options, $depth );
			}
		);
		Functions\when( 'wp_strip_all_tags' )->alias(
			static function ( $text ): string {
				return trim( strip_tags( (string) $text ) );
			}
		);
		Functions\when( 'is_email' )->alias(
			static function ( $email ) {
				return false !== filter_var( (string) $email, FILTER_VALIDATE_EMAIL ) ? $email : false;
			}
		);
		Functions\when( 'sanitize_email' )->alias(
			static function ( $email ): string {
				return trim( (string) $email );
			}
		);
		Functions\when( 'is_wp_error' )->alias(
			static function ( $thing ): bool {
				return $thing instanceof \WP_Error;
			}
		);
		Functions\when( 'rest_sanitize_boolean' )->alias(
			static function ( $value ): bool {
				if ( is_string( $value ) ) {
					return ! in_array( strtolower( $value ), [ '', '0', 'false', 'no', 'off' ], true );
				}
				return (bool) $value;
			}
		);
		Functions\when( 'rest_ensure_response' )->alias(
			static function ( $data ) {
				return $data instanceof \WP_REST_Response ? $data : new \WP_REST_Response( $data );
			}
		);
		Functions\when( 'get_current_user_id' )->justReturn( 1 );
		Functions\when( 'wp_get_current_user' )->alias(
			function () {
				return $this->users[1] ?? new \WP_User( [ 'ID' => 1, 'user_email' => 'admin@acme.com' ] );
			}
		);

		// Options.
		Functions\when( 'get_option' )->alias(
			function ( $name, $default = false ) {
				return array_key_exists( $name, $this->options ) ? $this->options[ $name ] : $default;
			}
		);
		Functions\when( 'update_option' )->alias(
			function ( $name, $value ) {
				$this->options[ $name ] = $value;
				return true;
			}
		);
		Functions\when( 'delete_option' )->alias(
			function ( $name ) {
				unset( $this->options[ $name ] );
				return true;
			}
		);

		// Transients.
		Functions\when( 'get_transient' )->alias(
			function ( $name ) {
				return $this->transients[ $name ]['value'] ?? false;
			}
		);
		Functions\when( 'set_transient' )->alias(
			function ( $name, $value, $ttl = 0 ) {
				$this->transients[ $name ] = [
					'value' => $value,
					'ttl'   => (int) $ttl,
				];
				return true;
			}
		);
		Functions\when( 'delete_transient' )->alias(
			function ( $name ) {
				unset( $this->transients[ $name ] );
				return true;
			}
		);

		// Users + user meta.
		Functions\when( 'get_userdata' )->alias(
			function ( $id ) {
				return $this->users[ (int) $id ] ?? false;
			}
		);
		Functions\when( 'get_user_meta' )->alias(
			function ( $id, $key = '', $single = false ) {
				return $this->user_meta[ (int) $id ][ $key ] ?? ( $single ? '' : [] );
			}
		);
		Functions\when( 'update_user_meta' )->alias(
			function ( $id, $key, $value ) {
				++$this->meta_writes;
				$this->user_meta[ (int) $id ][ $key ] = $value;
				return true;
			}
		);

		// HTTP.
		Functions\when( 'wp_safe_remote_post' )->alias(
			function ( $url, $args = [] ) {
				return $this->dispatch_http( (string) $url, (array) $args + [ 'method' => 'POST' ] );
			}
		);
		Functions\when( 'wp_safe_remote_request' )->alias(
			function ( $url, $args = [] ) {
				return $this->dispatch_http( (string) $url, (array) $args + [ 'method' => 'GET' ] );
			}
		);
		Functions\when( 'wp_remote_retrieve_response_code' )->alias(
			static function ( $response ) {
				return is_array( $response ) ? (int) ( $response['response']['code'] ?? 0 ) : '';
			}
		);
		Functions\when( 'wp_remote_retrieve_body' )->alias(
			static function ( $response ) {
				return is_array( $response ) ? (string) ( $response['body'] ?? '' ) : '';
			}
		);
		Functions\when( 'wp_remote_retrieve_header' )->alias(
			static function ( $response, $header ) {
				return is_array( $response ) ? ( $response['headers'][ strtolower( (string) $header ) ] ?? '' ) : '';
			}
		);

		// WP-Cron.
		Functions\when( 'wp_next_scheduled' )->alias(
			function ( $hook, $args = [] ) {
				$times = [];
				foreach ( $this->cron as $event ) {
					if ( $event['hook'] === $hook && $event['args'] === array_values( (array) $args ) ) {
						$times[] = $event['timestamp'];
					}
				}
				return empty( $times ) ? false : min( $times );
			}
		);
		Functions\when( 'wp_schedule_single_event' )->alias(
			function ( $timestamp, $hook, $args = [] ) {
				$this->cron[] = [
					'hook'       => (string) $hook,
					'timestamp'  => (int) $timestamp,
					'args'       => array_values( (array) $args ),
					'recurrence' => '',
				];
				return true;
			}
		);
		Functions\when( 'wp_schedule_event' )->alias(
			function ( $timestamp, $recurrence, $hook, $args = [] ) {
				$this->cron[] = [
					'hook'       => (string) $hook,
					'timestamp'  => (int) $timestamp,
					'args'       => array_values( (array) $args ),
					'recurrence' => (string) $recurrence,
				];
				return true;
			}
		);
		Functions\when( 'wp_unschedule_event' )->alias(
			function ( $timestamp, $hook, $args = [] ) {
				$this->cron = array_values(
					array_filter(
						$this->cron,
						static function ( array $event ) use ( $timestamp, $hook, $args ): bool {
							return ! ( $event['hook'] === $hook && $event['timestamp'] === (int) $timestamp && $event['args'] === array_values( (array) $args ) );
						}
					)
				);
				return true;
			}
		);
		$clear = function ( $hook ) {
			$before     = count( $this->cron );
			$this->cron = array_values(
				array_filter(
					$this->cron,
					static function ( array $event ) use ( $hook ): bool {
						return $event['hook'] !== $hook;
					}
				)
			);
			return $before - count( $this->cron );
		};
		Functions\when( 'wp_clear_scheduled_hook' )->alias( $clear );
		Functions\when( 'wp_unschedule_hook' )->alias( $clear );
	}

	/**
	 * `pre_http_request`-style dispatch.
	 *
	 * @param string               $url  URL.
	 * @param array<string, mixed> $args Request args.
	 *
	 * @return mixed
	 */
	protected function dispatch_http( string $url, array $args ) {
		$this->http_requests[] = [
			'url'  => $url,
			'args' => $args,
		];
		$handler  = $this->http_handler;
		$response = null !== $handler ? $handler( false, $args, $url ) : false;
		if ( false === $response ) {
			throw new \RuntimeException( 'Unexpected HTTP request: ' . ( $args['method'] ?? 'GET' ) . ' ' . $url );
		}
		return $response;
	}

	/**
	 * A WordPress HTTP API response array.
	 *
	 * @param int                   $code    Status.
	 * @param mixed                 $body    Body (arrays are JSON-encoded).
	 * @param array<string, string> $headers Headers.
	 *
	 * @return array<string, mixed>
	 */
	protected static function http_response( int $code, $body = '', array $headers = [] ): array {
		return [
			'headers'  => array_change_key_case( $headers, CASE_LOWER ),
			'body'     => is_string( $body ) ? $body : (string) json_encode( $body ),
			'response' => [
				'code'    => $code,
				'message' => '',
			],
			'cookies'  => [],
			'filename' => null,
		];
	}

	/**
	 * Routes requests by "METHOD url-prefix" → response (or callable).
	 *
	 * @param array<string, mixed> $routes Map.
	 */
	protected function route_http( array $routes ): void {
		$this->http_handler = static function ( $preempt, array $args, string $url ) use ( $routes ) {
			foreach ( $routes as $route => $response ) {
				[ $method, $prefix ] = explode( ' ', $route, 2 );
				if ( strtoupper( (string) ( $args['method'] ?? 'GET' ) ) === $method && 0 === strpos( $url, $prefix ) ) {
					return is_callable( $response ) ? $response( $args, $url ) : $response;
				}
			}
			return $preempt;
		};
	}

	/**
	 * RSA key pair generated once per test run.
	 *
	 * @return array{private: string, public: string}
	 */
	protected static function key_pair(): array {
		if ( null === self::$key_pair ) {
			$key = openssl_pkey_new(
				[
					'private_key_bits' => 2048,
					'private_key_type' => OPENSSL_KEYTYPE_RSA,
				]
			);
			openssl_pkey_export( $key, $private );
			$details        = openssl_pkey_get_details( $key );
			self::$key_pair = [
				'private' => (string) $private,
				'public'  => (string) $details['key'],
			];
		}
		return self::$key_pair;
	}

	/**
	 * A service-account key file as Google generates it.
	 *
	 * @param array<string, mixed> $overrides Field overrides.
	 *
	 * @return array<string, mixed>
	 */
	protected function service_account( array $overrides = [] ): array {
		return $overrides + [
			'type'                        => 'service_account',
			'project_id'                  => 'acme-signatures',
			'private_key_id'              => '0123456789abcdef0123456789abcdef01234567',
			'private_key'                 => self::key_pair()['private'],
			'client_email'                => 'pusher@acme-signatures.iam.gserviceaccount.com',
			'client_id'                   => '112233445566778899001',
			'auth_uri'                    => 'https://accounts.google.com/o/oauth2/auth',
			'token_uri'                   => 'https://evil.example/token',
			'auth_provider_x509_cert_url' => 'https://www.googleapis.com/oauth2/v1/certs',
			'client_x509_cert_url'        => 'https://www.googleapis.com/robot/v1/metadata/x509/pusher',
		];
	}

	/**
	 * Stores a connected configuration and returns fresh settings.
	 *
	 * @param array<string, mixed> $changes Domains / toggles.
	 */
	protected function configured_settings( array $changes = [] ): GmailSettings {
		$settings = new GmailSettings( $this->encryption() );
		$settings->save(
			GmailSettings::parse_service_account( (string) json_encode( $this->service_account() ) ),
			$changes + [ 'domains' => [ 'acme.com' ] ]
		);
		return new GmailSettings( $this->encryption() );
	}

	/**
	 * Adds a WordPress user.
	 */
	protected function add_user( int $id, string $email, string $name = '' ): void {
		$this->users[ $id ] = new \WP_User(
			[
				'ID'           => $id,
				'user_email'   => $email,
				'display_name' => '' !== $name ? $name : 'User ' . $id,
			]
		);
	}

	/**
	 * Responder for Google's token endpoint that always issues a token.
	 *
	 * @return callable
	 */
	protected static function token_ok( string $token = 'ya29.test-token' ): callable {
		return static function () use ( $token ): array {
			return self::http_response(
				200,
				[
					'access_token' => $token,
					'expires_in'   => 3599,
					'token_type'   => 'Bearer',
				]
			);
		};
	}

	/**
	 * HTTP requests whose URL starts with `$prefix`.
	 *
	 * @return array<int, array{url: string, args: array<string, mixed>}>
	 */
	protected function requests_to( string $prefix ): array {
		return array_values(
			array_filter(
				$this->http_requests,
				static function ( array $request ) use ( $prefix ): bool {
					return 0 === strpos( $request['url'], $prefix );
				}
			)
		);
	}
}
