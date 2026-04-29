<?php
/**
 * Shared helpers for all repositories.
 *
 * @package ImaginaSignatures\Repositories
 */

declare(strict_types=1);

namespace ImaginaSignatures\Repositories;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Provides convenience methods on top of `wpdb`.
 *
 * @since 1.0.0
 */
abstract class BaseRepository {

	/**
	 * Returns the global wpdb instance, type-narrowed for callers.
	 *
	 * @return \wpdb
	 */
	protected function db(): \wpdb {
		global $wpdb;
		return $wpdb;
	}

	/**
	 * Returns the prefixed table name for this repository.
	 *
	 * @return string
	 */
	abstract protected function table(): string;

	/**
	 * Returns the current UTC timestamp.
	 *
	 * @return string
	 */
	protected function now(): string {
		return gmdate( 'Y-m-d H:i:s' );
	}
}
