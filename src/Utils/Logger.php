<?php
/**
 * Lightweight logger.
 *
 * @package ImaginaSignatures\Utils
 */

declare(strict_types=1);

namespace ImaginaSignatures\Utils;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Logs structured events.
 *
 * Logging is opt-in via `imgsig_settings.enable_logs`. When the option is off
 * the methods are no-ops, so call sites don't need to guard.
 *
 * Errors are always emitted to PHP's error log, independent of the toggle.
 *
 * @since 1.0.0
 */
final class Logger {

	private const LEVELS = [
		'debug'   => 10,
		'info'    => 20,
		'warning' => 30,
		'error'   => 40,
	];

	/**
	 * Whether logging is currently enabled.
	 *
	 * Cached on construction; call `reload()` after changing settings.
	 *
	 * @var bool
	 */
	private bool $enabled;

	public function __construct() {
		$this->reload();
	}

	/**
	 * Re-reads the toggle from settings.
	 *
	 * @return void
	 */
	public function reload(): void {
		$settings      = get_option( 'imgsig_settings', [] );
		$this->enabled = is_array( $settings ) && ! empty( $settings['enable_logs'] );
	}

	/**
	 * @param string               $message Message.
	 * @param array<string, mixed> $context Context.
	 */
	public function debug( string $message, array $context = [] ): void {
		$this->log( 'debug', $message, $context );
	}

	/**
	 * @param string               $message Message.
	 * @param array<string, mixed> $context Context.
	 */
	public function info( string $message, array $context = [] ): void {
		$this->log( 'info', $message, $context );
	}

	/**
	 * @param string               $message Message.
	 * @param array<string, mixed> $context Context.
	 */
	public function warning( string $message, array $context = [] ): void {
		$this->log( 'warning', $message, $context );
	}

	/**
	 * @param string               $message Message.
	 * @param array<string, mixed> $context Context.
	 */
	public function error( string $message, array $context = [] ): void {
		$this->log( 'error', $message, $context );
	}

	/**
	 * Internal entry point.
	 *
	 * @param string               $level   Log level (one of LEVELS).
	 * @param string               $message Message.
	 * @param array<string, mixed> $context Context.
	 */
	private function log( string $level, string $message, array $context ): void {
		$severity = self::LEVELS[ $level ] ?? 20;

		if ( ! $this->enabled && $severity < self::LEVELS['error'] ) {
			return;
		}

		$payload = [
			'level'   => $level,
			'message' => $message,
			'context' => $context,
			'ts'      => gmdate( 'c' ),
		];

		if ( $severity >= self::LEVELS['error'] || ( defined( 'WP_DEBUG' ) && WP_DEBUG ) ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( '[imgsig] ' . wp_json_encode( $payload ) );
		}
	}
}
