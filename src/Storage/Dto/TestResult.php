<?php
/**
 * Result returned when testing a storage driver connection.
 *
 * @package ImaginaSignatures\Storage\Dto
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage\Dto;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Connection-test result DTO.
 *
 * @since 1.0.0
 */
final class TestResult {

	public bool $ok;
	public string $message;
	/** @var array<string, mixed> */
	public array $details;

	/**
	 * @param bool                 $ok       Whether the test succeeded.
	 * @param string               $message  Human-readable status.
	 * @param array<string, mixed> $details  Extra diagnostic context.
	 */
	public function __construct( bool $ok, string $message, array $details = [] ) {
		$this->ok      = $ok;
		$this->message = $message;
		$this->details = $details;
	}

	/**
	 * Serializes to an array.
	 *
	 * @return array<string, mixed>
	 */
	public function to_array(): array {
		return [
			'ok'      => $this->ok,
			'message' => $this->message,
			'details' => $this->details,
		];
	}
}
