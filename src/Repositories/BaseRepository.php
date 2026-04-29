<?php
/**
 * Base repository.
 *
 * @package ImaginaSignatures\Repositories
 */

declare(strict_types=1);

namespace ImaginaSignatures\Repositories;

defined( 'ABSPATH' ) || exit;

/**
 * Common parent for the plugin's data-access classes.
 *
 * Holds the `$wpdb` reference and exposes a single helper —
 * {@see now()} — for the UTC timestamp format used by every model's
 * `created_at` / `updated_at` column. Subclasses declare the table
 * name and any model-specific query methods.
 *
 * Direct queries always go through `$wpdb->prepare()` (CLAUDE.md §5.5).
 *
 * @since 1.0.0
 */
abstract class BaseRepository {

	/**
	 * WordPress DB abstraction.
	 *
	 * @var \wpdb
	 */
	protected \wpdb $wpdb;

	/**
	 * @param \wpdb $wpdb WordPress DB abstraction.
	 */
	public function __construct( \wpdb $wpdb ) {
		$this->wpdb = $wpdb;
	}

	/**
	 * Returns the (prefixed) table name this repository is bound to.
	 *
	 * @since 1.0.0
	 *
	 * @return string
	 */
	abstract protected function table(): string;

	/**
	 * UTC timestamp in `Y-m-d H:i:s` format (CLAUDE.md §5.9).
	 *
	 * @since 1.0.0
	 *
	 * @return string
	 */
	protected function now(): string {
		return gmdate( 'Y-m-d H:i:s' );
	}
}
