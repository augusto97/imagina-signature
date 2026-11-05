<?php
/**
 * Google Workspace (Gmail push) settings.
 *
 * @package ImaginaSignatures\Deployment\Gmail
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Gmail;

use ImaginaSignatures\Exceptions\EncryptionException;
use ImaginaSignatures\Exceptions\ValidationException;
use ImaginaSignatures\Security\Encryption;

defined( 'ABSPATH' ) || exit;

/**
 * Reads and writes the `imgsig_gmail` option.
 *
 * Stored shape:
 * ```
 * [
 *   'client_email'    => 'pusher@acme-sig.iam.gserviceaccount.com',
 *   'client_id'       => '1234567890…',
 *   'project_id'      => 'acme-sig',
 *   'private_key_id'  => 'a1b2…',
 *   'private_key'     => '<Encryption blob of the PEM>',
 *   'key_fingerprint' => sha256 of the public key (DER), hex,
 *   'domains'         => [ 'acme.com', 'acme.co' ],
 *   'auto_push'       => bool,
 *   'daily_sync'      => bool,
 *   'push_aliases'    => bool,
 *   'updated_at'      => 'Y-m-d H:i:s' UTC,
 * ]
 * ```
 *
 * Only those fields of the service-account JSON are kept — the rest
 * (`token_uri`, `auth_uri`, certificate URLs…) is discarded: the token
 * endpoint is a constant of {@see GmailTokenClient}, so a crafted JSON
 * can't point the server at another host. The private key is encrypted
 * with {@see Encryption} (encrypt-then-MAC) and is never part of
 * {@see public_view()}.
 *
 * Not `final` so PHPUnit can double it.
 *
 * @since 1.3.0
 */
class GmailSettings {

	/** Option key. */
	public const OPTION = 'imgsig_gmail';

	/** The one OAuth scope the integration requests (signatures only). */
	public const SCOPE = 'https://www.googleapis.com/auth/gmail.settings.basic';

	/** Largest service-account JSON accepted, in bytes. */
	public const MAX_JSON_BYTES = 16384;

	/** Most allowed domains. */
	public const MAX_DOMAINS = 50;

	/**
	 * Consumer domains — domain-wide delegation only exists for
	 * Google Workspace domains, so these can never work.
	 */
	private const CONSUMER_DOMAINS = [ 'gmail.com', 'googlemail.com' ];

	/**
	 * Toggles and their defaults.
	 */
	private const FLAGS = [
		'auto_push'    => false,
		'daily_sync'   => false,
		'push_aliases' => false,
	];

	/**
	 * @var Encryption
	 */
	private Encryption $encryption;

	/**
	 * Per-request cache of the option.
	 *
	 * @var array<string, mixed>|null
	 */
	private ?array $cache = null;

	/**
	 * @param Encryption $encryption Secret wrapper for the private key.
	 */
	public function __construct( Encryption $encryption ) {
		$this->encryption = $encryption;
	}

	/**
	 * Normalised stored settings (the private key still encrypted).
	 *
	 * @since 1.3.0
	 *
	 * @return array<string, mixed>
	 */
	public function all(): array {
		if ( null !== $this->cache ) {
			return $this->cache;
		}

		$raw = get_option( self::OPTION, [] );
		$raw = is_array( $raw ) ? $raw : [];

		$settings = [
			'client_email'    => (string) ( $raw['client_email'] ?? '' ),
			'client_id'       => (string) ( $raw['client_id'] ?? '' ),
			'project_id'      => (string) ( $raw['project_id'] ?? '' ),
			'private_key_id'  => (string) ( $raw['private_key_id'] ?? '' ),
			'private_key'     => (string) ( $raw['private_key'] ?? '' ),
			'key_fingerprint' => (string) ( $raw['key_fingerprint'] ?? '' ),
			'domains'         => isset( $raw['domains'] ) && is_array( $raw['domains'] )
				? array_values( array_filter( array_map( 'strval', $raw['domains'] ) ) )
				: [],
			'updated_at'      => (string) ( $raw['updated_at'] ?? '' ),
		];
		foreach ( self::FLAGS as $flag => $default ) {
			$settings[ $flag ] = isset( $raw[ $flag ] ) ? (bool) $raw[ $flag ] : $default;
		}

		$this->cache = $settings;
		return $settings;
	}

	/**
	 * True when a service account is stored.
	 *
	 * @since 1.3.0
	 *
	 * @return bool
	 */
	public function is_configured(): bool {
		$s = $this->all();
		return '' !== $s['client_email'] && '' !== $s['client_id'] && '' !== $s['private_key'];
	}

	/**
	 * Allowed Workspace domains (lowercase).
	 *
	 * @since 1.3.0
	 *
	 * @return string[]
	 */
	public function domains(): array {
		return $this->all()['domains'];
	}

	/**
	 * Whether an address belongs to one of the allowed domains (exact
	 * match on the part after the last `@`; sub-domains are separate
	 * Workspace domains and must be listed explicitly).
	 *
	 * @since 1.3.0
	 *
	 * @param string $email Address.
	 *
	 * @return bool
	 */
	public function is_domain_allowed( string $email ): bool {
		$domain = self::domain_of( $email );
		return '' !== $domain && in_array( $domain, $this->domains(), true );
	}

	/**
	 * Push automatically when a user's primary HTML changes.
	 *
	 * @since 1.3.0
	 *
	 * @return bool
	 */
	public function auto_push(): bool {
		return (bool) $this->all()['auto_push'];
	}

	/**
	 * Daily catch-up sync of outdated users.
	 *
	 * @since 1.3.0
	 *
	 * @return bool
	 */
	public function daily_sync(): bool {
		return (bool) $this->all()['daily_sync'];
	}

	/**
	 * Also update every verified send-as alias in an allowed domain.
	 *
	 * @since 1.3.0
	 *
	 * @return bool
	 */
	public function push_aliases(): bool {
		return (bool) $this->all()['push_aliases'];
	}

	/**
	 * Cloud project ID ('' when not configured).
	 *
	 * @since 1.3.0
	 *
	 * @return string
	 */
	public function project_id(): string {
		return $this->all()['project_id'];
	}

	/**
	 * OAuth client ID ('' when not configured).
	 *
	 * @since 1.3.0
	 *
	 * @return string
	 */
	public function client_id(): string {
		return $this->all()['client_id'];
	}

	/**
	 * Decrypted credentials for the token client.
	 *
	 * @since 1.3.0
	 *
	 * @return GmailCredentials
	 *
	 * @throws GmailException When nothing is stored or the key can't be decrypted.
	 */
	public function credentials(): GmailCredentials {
		if ( ! $this->is_configured() ) {
			throw new GmailException(
				GmailException::NOT_CONFIGURED,
				__( 'Google Workspace is not connected yet: upload the service-account key in Settings → Google Workspace.', 'imagina-signatures' )
			);
		}

		$s = $this->all();
		try {
			$pem = $this->encryption->decrypt( $s['private_key'] );
		} catch ( EncryptionException $e ) {
			$pem = '';
		}

		if ( '' === $pem ) {
			throw new GmailException(
				GmailException::CREDENTIALS_UNREADABLE,
				__( 'The stored service-account key can no longer be decrypted (the WordPress security keys or IMGSIG_ENCRYPTION_KEY changed). Upload the JSON key again.', 'imagina-signatures' )
			);
		}

		return new GmailCredentials( $s['client_email'], $s['client_id'], $s['project_id'], $s['private_key_id'], $pem );
	}

	/**
	 * Settings as returned over REST — never contains the private key.
	 *
	 * @since 1.3.0
	 *
	 * @return array<string, mixed>
	 */
	public function public_view(): array {
		$s = $this->all();

		return [
			'configured'      => $this->is_configured(),
			'client_email'    => $s['client_email'],
			'client_id'       => $s['client_id'],
			'project_id'      => $s['project_id'],
			'private_key_id'  => $s['private_key_id'],
			'key_fingerprint' => $s['key_fingerprint'],
			'domains'         => $s['domains'],
			'auto_push'       => $s['auto_push'],
			'daily_sync'      => $s['daily_sync'],
			'push_aliases'    => $s['push_aliases'],
			'scope'           => self::SCOPE,
			'updated_at'      => $s['updated_at'],
		];
	}

	/**
	 * Persists new credentials and/or settings.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, string>|null $service_account Output of {@see parse_service_account()}, or null to keep the stored one.
	 * @param array<string, mixed>       $changes         `domains` (already sanitised) and/or toggles.
	 *
	 * @return void
	 *
	 * @throws EncryptionException When the key can't be encrypted.
	 */
	public function save( ?array $service_account, array $changes = [] ): void {
		$next = $this->all();

		if ( null !== $service_account ) {
			$next['client_email']    = $service_account['client_email'];
			$next['client_id']       = $service_account['client_id'];
			$next['project_id']      = $service_account['project_id'];
			$next['private_key_id']  = $service_account['private_key_id'];
			$next['key_fingerprint'] = $service_account['key_fingerprint'];
			$next['private_key']     = $this->encryption->encrypt( $service_account['private_key'] );
		}

		if ( array_key_exists( 'domains', $changes ) && is_array( $changes['domains'] ) ) {
			$next['domains'] = array_values( array_map( 'strval', $changes['domains'] ) );
		}
		foreach ( array_keys( self::FLAGS ) as $flag ) {
			if ( array_key_exists( $flag, $changes ) ) {
				$next[ $flag ] = (bool) $changes[ $flag ];
			}
		}

		$next['updated_at'] = gmdate( 'Y-m-d H:i:s' );
		$this->write( $next );
	}

	/**
	 * Forgets the service account (keeps domains and toggles so a new
	 * key can be dropped in without re-entering them).
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public function forget_credentials(): void {
		$next = $this->all();
		foreach ( [ 'client_email', 'client_id', 'project_id', 'private_key_id', 'private_key', 'key_fingerprint' ] as $field ) {
			$next[ $field ] = '';
		}
		$next['updated_at'] = gmdate( 'Y-m-d H:i:s' );
		$this->write( $next );
	}

	/**
	 * Validates a pasted / uploaded service-account key file.
	 *
	 * Checks `type` = service_account, a service-account `client_email`,
	 * a numeric `client_id`, and that `private_key` is a PEM RSA key
	 * OpenSSL can load. Everything else in the file is dropped.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $input JSON text, or the already-decoded object.
	 *
	 * @return array{client_email: string, client_id: string, project_id: string, private_key_id: string, private_key: string, key_fingerprint: string}
	 *
	 * @throws ValidationException When the file isn't a usable service-account key.
	 */
	public static function parse_service_account( $input ): array {
		$fail = static function ( string $path, string $message ): ValidationException {
			return new ValidationException(
				__( 'This is not a valid Google service-account key file.', 'imagina-signatures' ),
				[
					[
						'path'    => $path,
						'message' => $message,
					],
				]
			);
		};

		if ( is_string( $input ) ) {
			$input = trim( $input );
			if ( strlen( $input ) > self::MAX_JSON_BYTES ) {
				throw $fail( 'service_account', __( 'The file is too large to be a service-account key.', 'imagina-signatures' ) );
			}
			$input = json_decode( $input, true );
		}

		if ( ! is_array( $input ) ) {
			throw $fail( 'service_account', __( 'Paste the contents of the JSON key file downloaded from Google Cloud (it starts with {).', 'imagina-signatures' ) );
		}

		if ( 'service_account' !== ( $input['type'] ?? null ) ) {
			throw $fail( 'type', __( 'The file must be a service-account key ("type": "service_account"), not an OAuth client or API key.', 'imagina-signatures' ) );
		}

		$errors = [];

		$client_email = strtolower( trim( (string) ( $input['client_email'] ?? '' ) ) );
		if ( ! is_email( $client_email ) || ! preg_match( '/\.gserviceaccount\.com$/', $client_email ) ) {
			$errors[] = [
				'path'    => 'client_email',
				'message' => __( 'client_email must be the service account address (…@….iam.gserviceaccount.com).', 'imagina-signatures' ),
			];
		}

		$client_id = trim( (string) ( $input['client_id'] ?? '' ) );
		if ( ! preg_match( '/^\d{5,32}$/', $client_id ) ) {
			$errors[] = [
				'path'    => 'client_id',
				'message' => __( 'client_id must be the numeric client ID of the service account.', 'imagina-signatures' ),
			];
		}

		$project_id = strtolower( trim( (string) ( $input['project_id'] ?? '' ) ) );
		if ( '' !== $project_id && ! preg_match( '/^[a-z0-9][a-z0-9:.\-]{1,99}$/', $project_id ) ) {
			$errors[] = [
				'path'    => 'project_id',
				'message' => __( 'project_id has an unexpected format.', 'imagina-signatures' ),
			];
		}

		$private_key_id = strtolower( trim( (string) ( $input['private_key_id'] ?? '' ) ) );
		if ( '' !== $private_key_id && ! preg_match( '/^[a-f0-9]{8,64}$/', $private_key_id ) ) {
			$errors[] = [
				'path'    => 'private_key_id',
				'message' => __( 'private_key_id has an unexpected format.', 'imagina-signatures' ),
			];
		}

		$pem         = str_replace( "\r\n", "\n", trim( (string) ( $input['private_key'] ?? '' ) ) );
		$fingerprint = '';
		$key         = false !== strpos( $pem, '-----BEGIN' ) && false !== strpos( $pem, 'PRIVATE KEY-----' )
			? openssl_pkey_get_private( $pem )
			: false;
		$details     = false !== $key ? openssl_pkey_get_details( $key ) : false;
		if ( ! is_array( $details ) || OPENSSL_KEYTYPE_RSA !== ( $details['type'] ?? null ) || ( $details['bits'] ?? 0 ) < 2048 ) {
			$errors[] = [
				'path'    => 'private_key',
				'message' => __( 'private_key must be the RSA private key (PEM) Google generated for this service account.', 'imagina-signatures' ),
			];
		} else {
			$fingerprint = self::fingerprint( (string) $details['key'] );
		}

		if ( ! empty( $errors ) ) {
			throw new ValidationException(
				__( 'This is not a valid Google service-account key file.', 'imagina-signatures' ),
				$errors
			);
		}

		return [
			'client_email'    => $client_email,
			'client_id'       => $client_id,
			'project_id'      => $project_id,
			'private_key_id'  => $private_key_id,
			'private_key'     => $pem . "\n",
			'key_fingerprint' => $fingerprint,
		];
	}

	/**
	 * Normalises a list of domains (array, or a comma / whitespace
	 * separated string). Lowercases, strips `@` / scheme, de-duplicates.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $input Domains.
	 *
	 * @return string[]
	 *
	 * @throws ValidationException When an entry isn't a domain name.
	 */
	public static function sanitize_domains( $input ): array {
		if ( is_string( $input ) ) {
			$input = preg_split( '/[\s,;]+/', $input );
		}
		if ( ! is_array( $input ) ) {
			$input = [];
		}

		$domains = [];
		$errors  = [];
		foreach ( $input as $index => $raw ) {
			if ( ! is_scalar( $raw ) ) {
				continue;
			}
			$domain = strtolower( trim( (string) $raw ) );
			$domain = (string) preg_replace( '#^(?:https?://)?(?:[^@/]*@)?#', '', $domain );
			$domain = rtrim( $domain, './' );
			if ( '' === $domain ) {
				continue;
			}
			if ( ! preg_match( '/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/', $domain ) ) {
				$errors[] = [
					'path'    => 'domains.' . $index,
					'message' => sprintf(
						/* translators: %s: rejected domain. */
						__( '"%s" is not a domain name.', 'imagina-signatures' ),
						$domain
					),
				];
				continue;
			}
			if ( in_array( $domain, self::CONSUMER_DOMAINS, true ) ) {
				$errors[] = [
					'path'    => 'domains.' . $index,
					'message' => sprintf(
						/* translators: %s: consumer domain such as gmail.com. */
						__( '%s is a consumer domain; domain-wide delegation only works for Google Workspace domains.', 'imagina-signatures' ),
						$domain
					),
				];
				continue;
			}
			$domains[ $domain ] = true;
		}

		if ( count( $domains ) > self::MAX_DOMAINS ) {
			$errors[] = [
				'path'    => 'domains',
				'message' => sprintf(
					/* translators: %d: maximum number of domains. */
					__( 'At most %d domains can be allowed.', 'imagina-signatures' ),
					self::MAX_DOMAINS
				),
			];
		}

		if ( ! empty( $errors ) ) {
			throw new ValidationException( __( 'Some allowed domains are invalid.', 'imagina-signatures' ), $errors );
		}

		return array_keys( $domains );
	}

	/**
	 * Lowercase domain of an address ('' when there is no `@`).
	 *
	 * @since 1.3.0
	 *
	 * @param string $email Address.
	 *
	 * @return string
	 */
	public static function domain_of( string $email ): string {
		$at = strrpos( $email, '@' );
		return false === $at ? '' : strtolower( trim( substr( $email, $at + 1 ) ) );
	}

	/**
	 * SHA-256 (hex) of the DER public key — lets an admin tell two
	 * uploaded keys apart without the key ever leaving the server.
	 *
	 * @param string $public_pem PEM public key.
	 *
	 * @return string
	 */
	private static function fingerprint( string $public_pem ): string {
		$body = (string) preg_replace( '/-----[A-Z ]+-----|\s+/', '', $public_pem );
		$der  = base64_decode( $body, true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- PEM body.
		return false === $der ? '' : hash( 'sha256', $der );
	}

	/**
	 * Writes the option (autoloaded: it's small and read on every
	 * signature save to decide whether to schedule a push).
	 *
	 * @param array<string, mixed> $settings Full settings.
	 *
	 * @return void
	 */
	private function write( array $settings ): void {
		update_option( self::OPTION, $settings );
		$this->cache = null;
	}
}
