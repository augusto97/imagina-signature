<?php
/**
 * Minimal stand-ins for the WordPress core classes the plugin relies on.
 *
 * Brain Monkey patches FUNCTIONS but doesn't ship class stubs. The
 * controllers reference \WP_REST_Request, \WP_REST_Response, and
 * \WP_Error in their type hints / return values, so tests that
 * exercise controller flows need those classes to exist. These
 * stubs are intentionally thin: just the methods the plugin
 * actually calls. They ARE NOT a full WordPress emulation — for
 * end-to-end REST tests against a real WP runtime, integrate
 * wp-tests-lib in a follow-up.
 *
 * @package ImaginaSignatures\Tests
 */

declare(strict_types=1);

if ( ! class_exists( 'WP_Error' ) ) {
	/**
	 * @phpstan-ignore-next-line
	 */
	class WP_Error { // phpcs:ignore Generic.Files.OneObjectStructurePerFile.MultipleFound

		/**
		 * @var array<int, array<int, string>>
		 */
		public array $errors = [];

		/**
		 * @var array<string, mixed>
		 */
		public array $error_data = [];

		/**
		 * @param string $code    Error code.
		 * @param string $message Human-readable message.
		 * @param mixed  $data    Optional extra data.
		 */
		public function __construct( string $code = '', string $message = '', $data = [] ) {
			if ( '' !== $code ) {
				$this->errors[ $code ][] = $message;
				if ( ! empty( $data ) ) {
					$this->error_data[ $code ] = $data;
				}
			}
		}

		/**
		 * @return string|int|null
		 */
		public function get_error_code() {
			$keys = array_keys( $this->errors );
			return $keys[0] ?? null;
		}

		public function get_error_message( string $code = '' ): string {
			$code = '' !== $code ? $code : (string) $this->get_error_code();
			return (string) ( $this->errors[ $code ][0] ?? '' );
		}

		/**
		 * @return mixed
		 */
		public function get_error_data( string $code = '' ) {
			$code = '' !== $code ? $code : (string) $this->get_error_code();
			return $this->error_data[ $code ] ?? null;
		}
	}
}

if ( ! class_exists( 'WP_REST_Request' ) ) {
	/**
	 * @phpstan-ignore-next-line
	 */
	class WP_REST_Request implements \ArrayAccess { // phpcs:ignore Generic.Files.OneObjectStructurePerFile.MultipleFound

		/**
		 * @var array<string, mixed>
		 */
		private array $params = [];

		/**
		 * @var array<string, mixed>
		 */
		private array $files = [];

		/**
		 * @param array<string, mixed> $params Initial parameters.
		 * @param array<string, mixed> $files  Initial $_FILES-style data.
		 */
		public function __construct( array $params = [], array $files = [] ) {
			$this->params = $params;
			$this->files  = $files;
		}

		/**
		 * @return mixed
		 */
		public function get_param( string $name ) {
			return $this->params[ $name ] ?? null;
		}

		/**
		 * @param string $name  Param name.
		 * @param mixed  $value Param value.
		 */
		public function set_param( string $name, $value ): void {
			$this->params[ $name ] = $value;
		}

		/**
		 * @return array<string, mixed>
		 */
		public function get_file_params(): array {
			return $this->files;
		}

		// ArrayAccess.

		public function offsetExists( $offset ): bool {
			return isset( $this->params[ (string) $offset ] );
		}

		/**
		 * @return mixed
		 */
		#[\ReturnTypeWillChange]
		public function offsetGet( $offset ) {
			return $this->params[ (string) $offset ] ?? null;
		}

		public function offsetSet( $offset, $value ): void {
			if ( null === $offset ) {
				$this->params[] = $value;
			} else {
				$this->params[ (string) $offset ] = $value;
			}
		}

		public function offsetUnset( $offset ): void {
			unset( $this->params[ (string) $offset ] );
		}
	}
}

if ( ! class_exists( 'WP_REST_Response' ) ) {
	/**
	 * @phpstan-ignore-next-line
	 */
	class WP_REST_Response { // phpcs:ignore Generic.Files.OneObjectStructurePerFile.MultipleFound

		/**
		 * @var mixed
		 */
		public $data;

		/**
		 * @var int
		 */
		public int $status = 200;

		/**
		 * @var array<string, string>
		 */
		public array $headers = [];

		/**
		 * @param mixed $data    Body payload.
		 * @param int   $status  HTTP status code.
		 * @param array<string, string> $headers HTTP headers.
		 */
		public function __construct( $data = null, int $status = 200, array $headers = [] ) {
			$this->data    = $data;
			$this->status  = $status;
			$this->headers = $headers;
		}

		public function set_status( int $status ): void {
			$this->status = $status;
		}

		public function get_status(): int {
			return $this->status;
		}

		/**
		 * @return mixed
		 */
		public function get_data() {
			return $this->data;
		}

		public function header( string $name, string $value ): void {
			$this->headers[ $name ] = $value;
		}
	}
}
