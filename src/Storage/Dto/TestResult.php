<?php
/**
 * DTO returned from a connection / configuration check.
 *
 * @package ImaginaSignatures\Storage\Dto
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage\Dto;

defined( 'ABSPATH' ) || exit;

/**
 * Result of `StorageDriverInterface::test_connection()`.
 *
 * Settings page renders this directly: a green check + the message on
 * success, a red banner with the message and details on failure.
 *
 * `$details` is intentionally untyped — different providers surface
 * different diagnostic shapes (latency_ms, region, bucket name, error
 * code from the wire response). Callers should never trust it for
 * security-relevant decisions.
 *
 * @since 1.0.0
 */
final class TestResult {

	/**
	 * Whether the backend accepted the configured credentials.
	 *
	 * @var bool
	 */
	public bool $success;

	/**
	 * Human-readable message, ready to be shown in the admin UI.
	 *
	 * Prepared by the driver and i18n-translated where applicable.
	 *
	 * @var string
	 */
	public string $message;

	/**
	 * Optional diagnostic payload (latency, error codes, region, etc.).
	 *
	 * @var array<string, mixed>
	 */
	public array $details;

	/**
	 * @param bool                 $success Connection check outcome.
	 * @param string               $message Human-readable summary.
	 * @param array<string, mixed> $details Optional diagnostic payload.
	 */
	public function __construct( bool $success, string $message, array $details = [] ) {
		$this->success = $success;
		$this->message = $message;
		$this->details = $details;
	}

	/**
	 * Convenience constructor for the success case.
	 *
	 * @since 1.0.0
	 *
	 * @param string               $message Display message.
	 * @param array<string, mixed> $details Optional diagnostics.
	 *
	 * @return self
	 */
	public static function success( string $message, array $details = [] ): self {
		return new self( true, $message, $details );
	}

	/**
	 * Convenience constructor for the failure case.
	 *
	 * @since 1.0.0
	 *
	 * @param string               $message Display message.
	 * @param array<string, mixed> $details Optional diagnostics.
	 *
	 * @return self
	 */
	public static function failure( string $message, array $details = [] ): self {
		return new self( false, $message, $details );
	}

	/**
	 * @since 1.0.0
	 *
	 * @return array<string, mixed>
	 */
	public function to_array(): array {
		return [
			'success' => $this->success,
			'message' => $this->message,
			'details' => $this->details,
		];
	}
}
