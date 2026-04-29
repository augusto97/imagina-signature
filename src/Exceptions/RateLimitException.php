<?php
/**
 * Rate-limit exceeded error.
 *
 * @package ImaginaSignatures\Exceptions
 */

declare(strict_types=1);

namespace ImaginaSignatures\Exceptions;

defined( 'ABSPATH' ) || exit;

/**
 * Thrown when a rate limit is exceeded.
 *
 * Carries the seconds-until-reset window so REST controllers can emit
 * a `Retry-After` header alongside the `429 Too Many Requests` status
 * (CLAUDE.md §19.3).
 *
 * @since 1.0.0
 */
class RateLimitException extends ImaginaSignaturesException {

	/**
	 * Seconds until the limit resets.
	 *
	 * @var int
	 */
	private int $retry_after_seconds;

	/**
	 * @param string          $message              Human-readable message.
	 * @param int             $retry_after_seconds  Seconds the caller should wait.
	 * @param \Throwable|null $previous             Previous throwable for chaining.
	 */
	public function __construct( string $message, int $retry_after_seconds, ?\Throwable $previous = null ) {
		parent::__construct( $message, 0, $previous );
		$this->retry_after_seconds = $retry_after_seconds;
	}

	/**
	 * Returns the seconds the caller should wait before retrying.
	 *
	 * @since 1.0.0
	 *
	 * @return int
	 */
	public function get_retry_after_seconds(): int {
		return $this->retry_after_seconds;
	}
}
