<?php
/**
 * Minimal `WP_User` stand-in for unit tests that type-hint it.
 *
 * @package ImaginaSignatures\Tests
 */

declare(strict_types=1);

if ( ! class_exists( 'WP_User' ) ) {
	/**
	 * Only the public properties the plugin reads.
	 *
	 * @phpstan-ignore-next-line
	 */
	class WP_User { // phpcs:ignore

		/** @var int */
		public $ID = 0;

		/** @var string */
		public $display_name = '';

		/** @var string */
		public $user_email = '';

		/** @var string */
		public $first_name = '';

		/** @var string */
		public $last_name = '';

		/** @var string */
		public $user_url = '';

		/** @var array<int, string> */
		public $roles = [];

		/**
		 * @param array<string, mixed> $props Property values.
		 */
		public function __construct( array $props = [] ) {
			foreach ( $props as $key => $value ) {
				$this->$key = $value;
			}
		}
	}
}
