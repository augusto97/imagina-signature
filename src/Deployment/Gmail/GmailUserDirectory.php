<?php
/**
 * Which users a Gmail push covers.
 *
 * @package ImaginaSignatures\Deployment\Gmail
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Gmail;

defined( 'ABSPATH' ) || exit;

/**
 * "Everyone" for the bulk push and the daily sync = every user who owns
 * at least one signature (users without one have nothing to deploy).
 * Read straight from `imgsig_signatures` (indexed on `user_id`), in
 * ascending user ID order so offsets and cursors are stable.
 *
 * Not `final` so PHPUnit can double it.
 *
 * @since 1.3.0
 */
class GmailUserDirectory {

	/**
	 * @var \wpdb
	 */
	private \wpdb $wpdb;

	/**
	 * @param \wpdb $wpdb Database.
	 */
	public function __construct( \wpdb $wpdb ) {
		$this->wpdb = $wpdb;
	}

	/**
	 * Owners with an ID greater than `$after_id` (cursor paging).
	 *
	 * @since 1.3.0
	 *
	 * @param int $after_id Last ID already processed.
	 * @param int $limit    Page size.
	 *
	 * @return int[]
	 */
	public function owner_ids_after( int $after_id, int $limit ): array {
		$table = $this->table();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name built from $wpdb->prefix.
		$sql = $this->wpdb->prepare( "SELECT DISTINCT user_id FROM {$table} WHERE user_id > %d ORDER BY user_id ASC LIMIT %d", $after_id, max( 1, $limit ) );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared -- prepared above.
		$ids = $this->wpdb->get_col( $sql );
		return array_map( 'intval', (array) $ids );
	}

	/**
	 * Owners by offset (bulk endpoint paging).
	 *
	 * @since 1.3.0
	 *
	 * @param int $offset Rows to skip.
	 * @param int $limit  Page size.
	 *
	 * @return int[]
	 */
	public function owner_ids_page( int $offset, int $limit ): array {
		$table = $this->table();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name built from $wpdb->prefix.
		$sql = $this->wpdb->prepare( "SELECT DISTINCT user_id FROM {$table} ORDER BY user_id ASC LIMIT %d OFFSET %d", max( 1, $limit ), max( 0, $offset ) );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared -- prepared above.
		$ids = $this->wpdb->get_col( $sql );
		return array_map( 'intval', (array) $ids );
	}

	/**
	 * Number of users owning at least one signature.
	 *
	 * @since 1.3.0
	 *
	 * @return int
	 */
	public function count_owners(): int {
		$table = $this->table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- plugin table, no user input.
		return (int) $this->wpdb->get_var( "SELECT COUNT(DISTINCT user_id) FROM {$table}" );
	}

	/**
	 * Signatures table name.
	 *
	 * @return string
	 */
	private function table(): string {
		return $this->wpdb->prefix . 'imgsig_signatures';
	}
}
