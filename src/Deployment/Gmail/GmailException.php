<?php
/**
 * Typed failure of the Gmail integration.
 *
 * @package ImaginaSignatures\Deployment\Gmail
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Gmail;

use ImaginaSignatures\Exceptions\ImaginaSignaturesException;

defined( 'ABSPATH' ) || exit;

/**
 * A Gmail / Google OAuth failure with a machine-readable diagnosis.
 *
 * `reason` is one of the constants below and is what the admin UI and
 * the team console key their help text on. The message is already
 * translated and actionable ("add client ID … with scope …"); Google's
 * own text, when there was one, travels separately in
 * {@see google_message()} so it can be shown verbatim under it.
 *
 * Built by {@see GmailErrorMapper}; thrown by {@see GmailTokenClient}
 * and {@see GmailApi}; caught by {@see GmailPusher} and the REST
 * controller.
 *
 * @since 1.3.0
 */
class GmailException extends ImaginaSignaturesException {

	/** No service account stored. */
	public const NOT_CONFIGURED = 'not_configured';

	/** The stored key can't be decrypted / parsed (salts rotated?). */
	public const CREDENTIALS_UNREADABLE = 'credentials_unreadable';

	/** OAuth `unauthorized_client`: delegation missing or without our scope. */
	public const DELEGATION_MISSING = 'delegation_missing';

	/** Token issued but the API says the scope is insufficient. */
	public const WRONG_SCOPE = 'wrong_scope';

	/** Gmail API not enabled in the Cloud project. */
	public const API_DISABLED = 'api_disabled';

	/** OAuth `invalid_grant` for the subject: not a user of the Workspace. */
	public const USER_NOT_FOUND = 'user_not_found';

	/** OAuth `invalid_grant` "Invalid JWT Signature": key deleted / rotated. */
	public const INVALID_KEY = 'invalid_key';

	/** OAuth `invalid_client`: service account deleted or disabled. */
	public const INVALID_CLIENT = 'invalid_client';

	/** OAuth `invalid_grant` on iat / exp: server clock is off. */
	public const CLOCK_SKEW = 'clock_skew';

	/** Any other token refusal. */
	public const TOKEN_REFUSED = 'token_refused';

	/** The user has no Gmail service (no licence / turned off). */
	public const MAIL_DISABLED = 'mail_disabled';

	/** 404 — the send-as address doesn't exist for that user. */
	public const SEND_AS_NOT_FOUND = 'send_as_not_found';

	/** 401 even with a fresh token. */
	public const UNAUTHORIZED = 'unauthorized';

	/** Other 403. */
	public const FORBIDDEN = 'forbidden';

	/** 429 / 403 rate-limit reasons — retry later. */
	public const RATE_LIMITED = 'rate_limited';

	/** 5xx — retry later. */
	public const SERVER_ERROR = 'server_error';

	/** Transport failure (DNS, TLS, timeout) — retry later. */
	public const NETWORK = 'network';

	/** Other 400. */
	public const BAD_REQUEST = 'bad_request';

	/** Signature longer than Gmail accepts. */
	public const TOO_LONG = 'too_long';

	/** Unparseable / unexpected success body. */
	public const INVALID_RESPONSE = 'invalid_response';

	/**
	 * Diagnosis code (one of the constants above).
	 *
	 * @var string
	 */
	private string $reason;

	/**
	 * HTTP status Google answered with (0 for local / transport failures).
	 *
	 * @var int
	 */
	private int $http_status;

	/**
	 * Whether retrying later can succeed without admin action.
	 *
	 * @var bool
	 */
	private bool $retryable;

	/**
	 * Seconds Google asked us to wait (`Retry-After`), 0 when unknown.
	 *
	 * @var int
	 */
	private int $retry_after;

	/**
	 * Google's own error text (truncated), '' when none.
	 *
	 * @var string
	 */
	private string $google_message;

	/**
	 * Where the admin fixes it (Cloud console page), '' when generic.
	 *
	 * @var string
	 */
	private string $help_url;

	/**
	 * @param string $reason         Diagnosis code.
	 * @param string $message        Translated, actionable message.
	 * @param int    $http_status    HTTP status (0 = none).
	 * @param bool   $retryable      Whether a later retry can succeed.
	 * @param int    $retry_after    Seconds to wait before retrying.
	 * @param string $google_message Google's own error text.
	 * @param string $help_url       Where to fix it.
	 */
	public function __construct(
		string $reason,
		string $message,
		int $http_status = 0,
		bool $retryable = false,
		int $retry_after = 0,
		string $google_message = '',
		string $help_url = ''
	) {
		parent::__construct( $message );
		$this->reason         = $reason;
		$this->http_status    = $http_status;
		$this->retryable      = $retryable;
		$this->retry_after    = max( 0, $retry_after );
		$this->google_message = $google_message;
		$this->help_url       = $help_url;
	}

	/**
	 * Diagnosis code.
	 *
	 * @since 1.3.0
	 *
	 * @return string
	 */
	public function reason(): string {
		return $this->reason;
	}

	/**
	 * HTTP status Google answered with (0 = none).
	 *
	 * @since 1.3.0
	 *
	 * @return int
	 */
	public function http_status(): int {
		return $this->http_status;
	}

	/**
	 * Whether a later retry can succeed without admin action.
	 *
	 * @since 1.3.0
	 *
	 * @return bool
	 */
	public function is_retryable(): bool {
		return $this->retryable;
	}

	/**
	 * Seconds Google asked us to wait (0 = unknown).
	 *
	 * @since 1.3.0
	 *
	 * @return int
	 */
	public function retry_after(): int {
		return $this->retry_after;
	}

	/**
	 * Google's own error text ('' when none).
	 *
	 * @since 1.3.0
	 *
	 * @return string
	 */
	public function google_message(): string {
		return $this->google_message;
	}

	/**
	 * Where the admin fixes the problem ('' when generic).
	 *
	 * @since 1.3.0
	 *
	 * @return string
	 */
	public function help_url(): string {
		return $this->help_url;
	}

	/**
	 * Wire shape used by the REST controller (test + bulk push).
	 *
	 * @since 1.3.0
	 *
	 * @return array{code: string, message: string, http_status: int, retryable: bool, retry_after: int, google: string, help_url: string}
	 */
	public function to_array(): array {
		return [
			'code'        => $this->reason,
			'message'     => $this->getMessage(),
			'http_status' => $this->http_status,
			'retryable'   => $this->retryable,
			'retry_after' => $this->retry_after,
			'google'      => $this->google_message,
			'help_url'    => $this->help_url,
		];
	}
}
