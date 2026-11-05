<?php
/**
 * Assigns a template to many users at once.
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

use ImaginaSignatures\Exceptions\ImaginaSignaturesException;
use ImaginaSignatures\Exceptions\ValidationException;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Models\Template;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Setup\CapabilitiesInstaller;
use ImaginaSignatures\Setup\DefaultTemplatesSeeder;

defined( 'ABSPATH' ) || exit;

/**
 * Template assignment (1.3.0) — `POST /admin/templates/:id/assign`.
 *
 * Targets are the union of explicit user ids, members of `imgsig_group`
 * terms (when that taxonomy exists) and a WordPress role — always
 * filtered to users holding `imgsig_use_signatures`, deduplicated and
 * sorted by id so a client can walk them in chunks of {@see CHUNK} with
 * `offset` / `next_offset`.
 *
 * Per user, against the signature they already have from this template
 * (the linked one first, else the most recently updated):
 *
 *  - `linked`: an existing one is (re)linked and its design refreshed
 *    from the template, keeping its variables and text overrides —
 *    `skipped` when it already was linked and up to date; otherwise a
 *    new linked signature is created.
 *  - `copy`:   a detached copy of the template is created; users who
 *    already have a signature from it are `skipped` (their copy is
 *    theirs) unless `always_create` is set (legacy bulk apply).
 *
 * `make_primary` marks the resulting signature as the user's primary
 * (the one deployed to Gmail / Outlook / install links).
 *
 * Not declared `final` so controller tests can mock it.
 *
 * @since 1.3.0
 */
class TemplateAssignmentService {

	public const MODE_LINKED = 'linked';
	public const MODE_COPY   = 'copy';

	/**
	 * Users processed per request.
	 */
	public const CHUNK = 50;

	/**
	 * Taxonomy of user groups (registered by the groups module).
	 */
	public const GROUP_TAXONOMY = 'imgsig_group';

	/**
	 * @var SignatureService
	 */
	private SignatureService $signatures;

	/**
	 * @var SignatureRepository
	 */
	private SignatureRepository $repo;

	/**
	 * @param SignatureService    $signatures Signature service.
	 * @param SignatureRepository $repo       Signature repository.
	 */
	public function __construct( SignatureService $signatures, SignatureRepository $repo ) {
		$this->signatures = $signatures;
		$this->repo       = $repo;
	}

	/**
	 * Processes one chunk of an assignment.
	 *
	 * `$args`: `user_ids` int[], `group_ids` int[], `role` string,
	 * `all` bool (every signature user), `mode` linked|copy,
	 * `make_primary` bool, `offset` int, `chunk` int (default
	 * {@see CHUNK}), `always_create` bool (copy mode only).
	 *
	 * @since 1.3.0
	 *
	 * @param Template             $template Template to assign.
	 * @param array<string, mixed> $args     Targets and options.
	 *
	 * @return array{processed: int, created: int, updated: int, skipped: int, failed: int, total: int, next_offset: int|null}
	 *
	 * @throws ValidationException When the template is unusable or no user matches.
	 */
	public function assign( Template $template, array $args ): array {
		$schema = json_decode( $template->json_content, true );
		if ( ! is_array( $schema ) ) {
			throw new ValidationException(
				__( 'This template has invalid content and cannot be assigned.', 'imagina-signatures' ),
				[
					[
						'path'    => 'json_content',
						'message' => __( 'Could not decode the template.', 'imagina-signatures' ),
					],
				]
			);
		}

		$mode = self::MODE_COPY === ( $args['mode'] ?? '' ) ? self::MODE_COPY : self::MODE_LINKED;

		$user_ids = $this->resolve_user_ids( $args );
		$total    = count( $user_ids );
		if ( 0 === $total ) {
			throw new ValidationException(
				__( 'No users matched the selection.', 'imagina-signatures' ),
				[
					[
						'path'    => 'user_ids',
						'message' => __( 'Pick users, groups or a role whose members can use signatures.', 'imagina-signatures' ),
					],
				]
			);
		}

		$chunk  = max( 1, min( 500, (int) ( $args['chunk'] ?? self::CHUNK ) ) );
		$offset = max( 0, (int) ( $args['offset'] ?? 0 ) );
		$slice  = array_slice( $user_ids, $offset, $chunk );
		$name   = (string) ( DefaultTemplatesSeeder::localize( $template->to_array() )['name'] ?? $template->name );

		$result = [
			'processed'   => 0,
			'created'     => 0,
			'updated'     => 0,
			'skipped'     => 0,
			'failed'      => 0,
			'total'       => $total,
			'next_offset' => $offset + $chunk < $total ? $offset + $chunk : null,
		];

		foreach ( $slice as $user_id ) {
			++$result['processed'];
			try {
				$outcome = $this->assign_one( $template, $schema, $user_id, $mode, ! empty( $args['make_primary'] ), $name, ! empty( $args['always_create'] ) );
				++$result[ $outcome ];
			} catch ( ImaginaSignaturesException $e ) {
				++$result['failed'];
			}
		}

		/**
		 * Fires after one chunk of a template assignment.
		 *
		 * @since 1.3.0
		 *
		 * @param int                  $template_id Template.
		 * @param int[]                $user_ids    Users of this chunk.
		 * @param string               $mode        `linked` or `copy`.
		 * @param array<string, mixed> $result      Chunk counters.
		 */
		do_action( 'imgsig/template/assigned', $template->id, $slice, $mode, $result );

		return $result;
	}

	/**
	 * The deduplicated, id-sorted users an assignment targets.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed> $args `user_ids`, `group_ids`, `role`, `all`.
	 *
	 * @return int[]
	 */
	public function resolve_user_ids( array $args ): array {
		$ids = [];

		if ( ! empty( $args['all'] ) ) {
			$ids = array_merge(
				$ids,
				array_map(
					'intval',
					(array) get_users(
						[
							'capability' => CapabilitiesInstaller::CAP_USE,
							'fields'     => 'ID',
						]
					)
				)
			);
		}

		if ( ! empty( $args['user_ids'] ) && is_array( $args['user_ids'] ) ) {
			$ids = array_merge( $ids, array_map( 'intval', $args['user_ids'] ) );
		}

		if ( ! empty( $args['group_ids'] ) && is_array( $args['group_ids'] ) && taxonomy_exists( self::GROUP_TAXONOMY ) ) {
			$group_ids = array_values( array_filter( array_map( 'intval', $args['group_ids'] ) ) );
			if ( [] !== $group_ids ) {
				$members = get_objects_in_term( $group_ids, self::GROUP_TAXONOMY );
				if ( is_array( $members ) ) {
					$ids = array_merge( $ids, array_map( 'intval', $members ) );
				}
			}
		}

		$role = isset( $args['role'] ) ? sanitize_key( (string) $args['role'] ) : '';
		if ( '' !== $role ) {
			$ids = array_merge(
				$ids,
				array_map(
					'intval',
					(array) get_users(
						[
							'role'   => $role,
							'fields' => 'ID',
						]
					)
				)
			);
		}

		$ids = array_values( array_unique( array_filter( $ids ) ) );
		$ids = array_values(
			array_filter(
				$ids,
				static function ( int $id ): bool {
					return user_can( $id, CapabilitiesInstaller::CAP_USE );
				}
			)
		);
		sort( $ids, SORT_NUMERIC );

		return $ids;
	}

	/**
	 * Assigns the template to one user.
	 *
	 * @param Template             $template      Template.
	 * @param array<string, mixed> $schema        Decoded template schema.
	 * @param int                  $user_id       Target user.
	 * @param string               $mode          `linked` | `copy`.
	 * @param bool                 $make_primary  Mark the result as primary.
	 * @param string               $name          Name for new signatures.
	 * @param bool                 $always_create Copy mode: create even when one exists.
	 *
	 * @return string `created` | `updated` | `skipped`.
	 */
	private function assign_one( Template $template, array $schema, int $user_id, string $mode, bool $make_primary, string $name, bool $always_create ): string {
		$existing = $this->repo->find_latest_by_user_and_template( $user_id, $template->id );
		$outcome  = 'skipped';
		$target   = $existing;

		if ( self::MODE_LINKED === $mode ) {
			if ( null !== $existing ) {
				$current = json_decode( $existing->json_content, true );
				$current = is_array( $current ) ? $current : [];
				$next    = TemplateLink::refresh( $schema, $current );

				if ( ! $existing->is_linked() || ! TemplateLink::equivalent( $next, $current, true ) ) {
					$target  = $this->signatures->update(
						$existing->id,
						$user_id,
						[
							'json_content' => $next,
							'link_mode'    => Signature::LINK_LINKED,
						],
						true
					);
					$outcome = 'updated';
				}
			} else {
				$now     = gmdate( 'Y-m-d\TH:i:s\Z' );
				$target  = $this->signatures->create(
					$user_id,
					[
						'name'         => $name,
						'json_content' => TemplateLink::refresh( $schema, [], $now ),
						'template_id'  => $template->id,
						'link_mode'    => Signature::LINK_LINKED,
					],
					true
				);
				$outcome = 'created';
			}
		} elseif ( null === $existing || $always_create ) {
			$target  = $this->signatures->create(
				$user_id,
				[
					'name'         => $name,
					'json_content' => TemplateLink::copy_of( $schema ),
					'template_id'  => $template->id,
					'link_mode'    => Signature::LINK_DETACHED,
				],
				true
			);
			$outcome = 'created';
		}

		if ( $make_primary && null !== $target ) {
			$this->signatures->set_primary( $user_id, $target->id );
		}

		return $outcome;
	}
}
