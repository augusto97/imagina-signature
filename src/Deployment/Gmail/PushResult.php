<?php
/**
 * Outcome of pushing one user's signature to Gmail.
 *
 * @package ImaginaSignatures\Deployment\Gmail
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Gmail;

defined( 'ABSPATH' ) || exit;

/**
 * Value object returned by {@see GmailPusher::push_user()} and
 * serialised into the bulk endpoint's `results`.
 *
 * Statuses:
 *  - `pushed`             signature written to Gmail.
 *  - `up_to_date`         same HTML already pushed — skipped.
 *  - `no_signature`       the user has no signature.
 *  - `needs_recompile`    no server-side HTML, or it predates the last edit.
 *  - `domain_not_allowed` the user's address is outside the allowed domains.
 *  - `no_email`           the user has no valid email address.
 *  - `user_not_found`     no such WordPress user.
 *  - `not_configured`     no service account stored.
 *  - `retry`              temporary Google failure — retried automatically.
 *  - `error`              permanent failure (see `error_code`).
 *
 * @since 1.3.0
 */
final class PushResult {

	public const PUSHED             = 'pushed';
	public const UP_TO_DATE         = 'up_to_date';
	public const NO_SIGNATURE       = 'no_signature';
	public const NEEDS_RECOMPILE    = 'needs_recompile';
	public const DOMAIN_NOT_ALLOWED = 'domain_not_allowed';
	public const NO_EMAIL           = 'no_email';
	public const USER_NOT_FOUND     = 'user_not_found';
	public const NOT_CONFIGURED     = 'not_configured';
	public const RETRY              = 'retry';
	public const ERROR              = 'error';

	/**
	 * @var int
	 */
	public int $user_id;

	/**
	 * One of the constants above.
	 *
	 * @var string
	 */
	public string $status;

	/**
	 * Human-readable explanation ('' for a plain success).
	 *
	 * @var string
	 */
	public string $message = '';

	/**
	 * User's address ('' when unknown).
	 *
	 * @var string
	 */
	public string $email = '';

	/**
	 * Display name ('' when unknown).
	 *
	 * @var string
	 */
	public string $name = '';

	/**
	 * Addresses whose signature was set.
	 *
	 * @var string[]
	 */
	public array $send_as = [];

	/**
	 * Failure that produced `retry` / `error`, if any.
	 *
	 * @var GmailException|null
	 */
	public ?GmailException $exception = null;

	/**
	 * Consecutive retryable failures so far (drives the back-off).
	 *
	 * @var int
	 */
	public int $retries = 0;

	/**
	 * @param int    $user_id User.
	 * @param string $status  Status.
	 * @param string $message Explanation.
	 */
	public function __construct( int $user_id, string $status, string $message = '' ) {
		$this->user_id = $user_id;
		$this->status  = $status;
		$this->message = $message;
	}

	/**
	 * Builds a failure result from a diagnosed exception.
	 *
	 * @since 1.3.0
	 *
	 * @param int            $user_id   User.
	 * @param GmailException $exception Failure.
	 *
	 * @return self
	 */
	public static function failed( int $user_id, GmailException $exception ): self {
		$result            = new self( $user_id, $exception->is_retryable() ? self::RETRY : self::ERROR, $exception->getMessage() );
		$result->exception = $exception;
		return $result;
	}

	/**
	 * True when Gmail was actually called (success or failure) — what
	 * the batch limits count.
	 *
	 * @since 1.3.0
	 *
	 * @return bool
	 */
	public function attempted(): bool {
		return in_array( $this->status, [ self::PUSHED, self::RETRY, self::ERROR ], true );
	}

	/**
	 * Whether a later retry can succeed without admin action.
	 *
	 * @since 1.3.0
	 *
	 * @return bool
	 */
	public function is_retryable(): bool {
		return self::RETRY === $this->status;
	}

	/**
	 * Wire shape: `{user_id, status, email, name, message, error?, error_code?, google?, help_url?, send_as?}`.
	 *
	 * @since 1.3.0
	 *
	 * @return array<string, mixed>
	 */
	public function to_array(): array {
		$out = [
			'user_id' => $this->user_id,
			'status'  => $this->status,
			'email'   => $this->email,
			'name'    => $this->name,
			'message' => $this->message,
		];
		if ( null !== $this->exception ) {
			$out['error']      = $this->exception->getMessage();
			$out['error_code'] = $this->exception->reason();
			$out['google']     = $this->exception->google_message();
			$out['help_url']   = $this->exception->help_url();
		}
		if ( self::PUSHED === $this->status ) {
			$out['send_as'] = $this->send_as;
		}
		return $out;
	}
}
