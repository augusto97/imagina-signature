<?php
/**
 * Team console data: every signature user with their deployment state.
 *
 * @package ImaginaSignatures\Team
 */

declare(strict_types=1);

namespace ImaginaSignatures\Team;

use ImaginaSignatures\Api\Controllers\GroupsController;
use ImaginaSignatures\Deployment\DeploymentStatus;
use ImaginaSignatures\Deployment\Gmail\GmailSettings;
use ImaginaSignatures\Deployment\OutlookSettings;
use ImaginaSignatures\Directory\Groups;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Repositories\TemplateRepository;
use ImaginaSignatures\Services\SignatureService;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Builds one page of the team console (1.3.0) with a constant number of
 * queries, whatever the page size:
 *
 *  1. ids of every user who can use signatures, matching `search` /
 *     `group`, by display name (`get_users`, `fields => ID`);
 *  2. per 500 of them: their signatures' narrow rows
 *     ({@see SignatureRepository::summaries_for_users()}) and their two
 *     plugin meta values (primary signature, deployment status) in one
 *     `usermeta` SELECT;
 *  3. counters + the `state` filter over the whole matching set (pure,
 *     {@see TeamRows});
 *  4. for the requested page only: the users (meta cache primed by
 *     `get_users`), their groups ({@see Groups::for_users()}), every
 *     group, and the names of the templates involved — one query each.
 *
 * Not `final` so PHPUnit 9 can double it in controller tests.
 *
 * @since 1.3.0
 */
class TeamDirectory {

	/** Default page size. */
	public const PER_PAGE = 25;

	/** Largest page size. */
	public const MAX_PER_PAGE = 100;

	/**
	 * @var SignatureRepository
	 */
	private SignatureRepository $signatures;

	/**
	 * @var TemplateRepository
	 */
	private TemplateRepository $templates;

	/**
	 * @var GmailSettings
	 */
	private GmailSettings $gmail;

	/**
	 * @var \wpdb
	 */
	private \wpdb $wpdb;

	/**
	 * @param SignatureRepository $signatures Signature repository.
	 * @param TemplateRepository  $templates  Template repository.
	 * @param GmailSettings       $gmail      Google Workspace settings.
	 * @param \wpdb               $wpdb       Database.
	 */
	public function __construct( SignatureRepository $signatures, TemplateRepository $templates, GmailSettings $gmail, \wpdb $wpdb ) {
		$this->signatures = $signatures;
		$this->templates  = $templates;
		$this->gmail      = $gmail;
		$this->wpdb       = $wpdb;
	}

	/**
	 * One page of rows plus the counters of the whole (search / group)
	 * scope.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed> $args `search`, `group`, `state`, `page`, `per_page`.
	 *
	 * @return array{items: array<int, array<string, mixed>>, total: int, page: int, per_page: int, total_pages: int, summary: array<string, int>, channels: array<string, array<string, bool>>}
	 */
	public function query( array $args ): array {
		$per_page = max( 1, min( self::MAX_PER_PAGE, (int) ( $args['per_page'] ?? self::PER_PAGE ) ) );
		$page     = max( 1, (int) ( $args['page'] ?? 1 ) );
		$state    = in_array( $args['state'] ?? '', TeamRows::STATES, true ) ? (string) $args['state'] : TeamRows::STATE_ALL;
		$channels = $this->channels();
		$flags    = [
			'gmail'   => $channels['gmail']['configured'],
			'outlook' => $channels['outlook']['enabled'],
		];

		$ids  = $this->candidate_ids( (string) ( $args['search'] ?? '' ), (int) ( $args['group'] ?? 0 ) );
		$rows = [];
		foreach ( array_chunk( $ids, SignatureRepository::ID_CHUNK ) as $chunk ) {
			$owned = $this->signatures->summaries_for_users( $chunk );
			$meta  = $this->plugin_meta( $chunk );
			foreach ( $chunk as $user_id ) {
				$rows[] = TeamRows::state(
					$user_id,
					$owned[ $user_id ] ?? [],
					(int) ( $meta[ $user_id ][ SignatureService::PRIMARY_META_KEY ] ?? 0 ),
					$meta[ $user_id ][ DeploymentStatus::META_KEY ] ?? null,
					$flags
				);
			}
		}

		$summary                     = TeamRows::summarize( $rows );
		$summary['stale_signatures'] = $this->signatures->count_stale();

		$matching = TeamRows::STATE_ALL === $state
			? $rows
			: array_values(
				array_filter(
					$rows,
					static function ( array $row ) use ( $state ): bool {
						return TeamRows::matches( $row, $state );
					}
				)
			);

		$total = count( $matching );
		$slice = array_slice( $matching, ( $page - 1 ) * $per_page, $per_page );

		return [
			'items'       => $this->decorate( $slice ),
			'total'       => $total,
			'page'        => $page,
			'per_page'    => $per_page,
			'total_pages' => (int) ceil( $total / $per_page ),
			'summary'     => $summary,
			'channels'    => $channels,
		];
	}

	/**
	 * Which deployment channels are set up.
	 *
	 * @since 1.3.0
	 *
	 * @return array{gmail: array{configured: bool, auto_push: bool}, outlook: array{enabled: bool}}
	 */
	public function channels(): array {
		$outlook = get_option( OutlookSettings::OPTION, [] );
		return [
			'gmail'   => [
				'configured' => $this->gmail->is_configured(),
				'auto_push'  => $this->gmail->is_configured() && $this->gmail->auto_push(),
			],
			// Read without OutlookSettings::get(), which would persist a
			// freshly generated deployment key on a site that never used it.
			'outlook' => [
				'enabled' => is_array( $outlook ) && ! empty( $outlook['enabled'] ),
			],
		];
	}

	/**
	 * Ids of the users who can use signatures, by display name.
	 *
	 * @since 1.3.0
	 *
	 * @param string $search Free text (login, email, nicename, display name).
	 * @param int    $group  Group id (0 = any).
	 *
	 * @return int[]
	 */
	protected function candidate_ids( string $search, int $group ): array {
		$args = [
			'capability'  => CapabilitiesInstaller::CAP_USE,
			'fields'      => 'ID',
			'number'      => -1,
			'orderby'     => 'display_name',
			'order'       => 'ASC',
			'count_total' => false,
		];

		$search = trim( $search );
		if ( '' !== $search ) {
			$args['search']         = '*' . $search . '*';
			$args['search_columns'] = [ 'user_login', 'user_email', 'user_nicename', 'display_name' ];
		}

		if ( $group > 0 ) {
			$members = Groups::members( $group );
			if ( empty( $members ) ) {
				return [];
			}
			$args['include'] = $members;
		}

		$ids = get_users( $args );
		return array_values( array_map( 'intval', is_array( $ids ) ? $ids : [] ) );
	}

	/**
	 * The primary-signature and deployment-status meta of these users, in
	 * one query (no per-user `get_user_meta`, and no loading of every
	 * other meta key of the whole team).
	 *
	 * @since 1.3.0
	 *
	 * @param int[] $user_ids Users (≤ {@see SignatureRepository::ID_CHUNK}).
	 *
	 * @return array<int, array<string, mixed>> User id => meta key => value.
	 */
	protected function plugin_meta( array $user_ids ): array {
		if ( empty( $user_ids ) ) {
			return [];
		}
		$placeholders = implode( ',', array_fill( 0, count( $user_ids ), '%d' ) );
		$table        = $this->wpdb->usermeta;
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare, WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber -- placeholders built above; core usermeta table.
		$sql = $this->wpdb->prepare( "SELECT user_id, meta_key, meta_value FROM {$table} WHERE meta_key IN (%s, %s) AND user_id IN ({$placeholders})", SignatureService::PRIMARY_META_KEY, DeploymentStatus::META_KEY, ...$user_ids );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared -- prepared above.
		$rows = $this->wpdb->get_results( $sql, ARRAY_A );

		$out = [];
		foreach ( is_array( $rows ) ? $rows : [] as $row ) {
			$out[ (int) $row['user_id'] ][ (string) $row['meta_key'] ] = maybe_unserialize( $row['meta_value'] );
		}
		return $out;
	}

	/**
	 * Adds the user, group and template details to a page of rows.
	 *
	 * @since 1.3.0
	 *
	 * @param array<int, array<string, mixed>> $rows {@see TeamRows::state()} rows.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	protected function decorate( array $rows ): array {
		if ( empty( $rows ) ) {
			return [];
		}
		$ids = array_map(
			static function ( array $row ): int {
				return (int) $row['user_id'];
			},
			$rows
		);

		$users = [];
		$found = get_users(
			[
				'include' => $ids,
				'orderby' => 'include',
				'number'  => count( $ids ),
			]
		);
		foreach ( is_array( $found ) ? $found : [] as $user ) {
			$users[ (int) $user->ID ] = $user;
		}

		$memberships = Groups::for_users( $ids );
		$groups      = [];
		foreach ( Groups::all() as $group ) {
			$groups[ (int) $group['id'] ] = $group;
		}

		$template_ids = [];
		foreach ( $rows as $row ) {
			if ( null !== $row['primary'] && null !== $row['primary']['template_id'] ) {
				$template_ids[] = (int) $row['primary']['template_id'];
			}
		}
		$template_names = $this->templates->names_by_ids( $template_ids );

		$out = [];
		foreach ( $rows as $row ) {
			$user_id = (int) $row['user_id'];
			if ( ! isset( $users[ $user_id ] ) ) {
				continue; // Deleted between the two queries.
			}
			$base = GroupsController::user_row( $users[ $user_id ], $memberships[ $user_id ] ?? [], $groups );
			if ( null !== $row['primary'] ) {
				$template_id                     = $row['primary']['template_id'];
				$row['primary']['template_name'] = null !== $template_id ? ( $template_names[ (int) $template_id ] ?? '' ) : '';
			}
			unset( $row['user_id'] );
			$out[] = $base + $row;
		}
		return $out;
	}
}
