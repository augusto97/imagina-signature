<?php
/**
 * Signature service — domain operations on signatures.
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

use ImaginaSignatures\Exceptions\OwnershipException;
use ImaginaSignatures\Exceptions\ValidationException;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Repositories\SignatureRepository;

defined( 'ABSPATH' ) || exit;

/**
 * Coordinates create / update / delete / duplicate flows for signatures.
 *
 * Owns three kinds of work that don't belong to either the controller
 * or the repository:
 *
 *  - Validation (delegates to {@see JsonSchemaValidator}).
 *  - Ownership enforcement at the service boundary (so any caller —
 *    not just REST controllers — can't bypass it).
 *  - Firing public action hooks (`imgsig/signature/*`) at the right
 *    moments so extensions can react.
 *
 * Controllers translate the typed exceptions thrown here into
 * `WP_Error` via {@see \ImaginaSignatures\Api\BaseController::exception_to_wp_error()}.
 *
 * Not declared `final` so PHPUnit 9 can produce mock doubles in
 * controller tests. The public surface is the supported contract.
 *
 * @since 1.0.0
 */
class SignatureService {

	/**
	 * @var SignatureRepository
	 */
	private SignatureRepository $repo;

	/**
	 * @var JsonSchemaValidator
	 */
	private JsonSchemaValidator $validator;

	/**
	 * @param SignatureRepository $repo      Signature repository.
	 * @param JsonSchemaValidator $validator Schema validator.
	 */
	public function __construct( SignatureRepository $repo, JsonSchemaValidator $validator ) {
		$this->repo      = $repo;
		$this->validator = $validator;
	}

	/**
	 * Creates a new signature owned by `$user_id`.
	 *
	 * `$data` is filtered through `imgsig/signature/data_before_save`
	 * before validation so extensions can normalise or augment it.
	 *
	 * @since 1.0.0
	 *
	 * @param int                  $user_id Owner.
	 * @param array<string, mixed> $data    Field map (`name`, `json_content`, ...).
	 *
	 * @return Signature
	 *
	 * @throws ValidationException When the JSON schema check fails.
	 */
	public function create( int $user_id, array $data ): Signature {
		// `prepare_for_save()` runs the `imgsig/signature/data_before_save`
		// filter on the payload. Listeners can normalise / augment fields,
		// but they must NOT be allowed to set `user_id` — that would let
		// a third-party plugin (or a future internal bug) silently re-
		// assign ownership of a fresh row to another user. Strip any
		// listener-injected `user_id` and stamp ours AFTER the filter.
		$prepared = $this->prepare_for_save( $data, 'create' );
		unset( $prepared['user_id'] );
		$prepared['user_id'] = $user_id;

		do_action( 'imgsig/signature/before_create', $prepared, $user_id );

		$signature = $this->repo->insert( $prepared );

		do_action( 'imgsig/signature/created', $signature );

		return $signature;
	}

	/**
	 * Updates an existing signature.
	 *
	 * Fetches the row through `find_owned_by` so ownership is enforced
	 * even if the caller passes the wrong user_id by mistake. Propagates
	 * a {@see ValidationException} from {@see prepare_for_save()} when
	 * the new payload fails schema validation.
	 *
	 * @since 1.0.0
	 *
	 * @param int                  $signature_id Primary key.
	 * @param int                  $user_id      Caller's user ID.
	 * @param array<string, mixed> $changes      Partial field map.
	 *
	 * @return Signature
	 *
	 * @throws OwnershipException When the row is missing or owned by someone else.
	 */
	public function update( int $signature_id, int $user_id, array $changes ): Signature {
		$existing = $this->repo->find_owned_by( $signature_id, $user_id );
		if ( null === $existing ) {
			throw new OwnershipException( 'Signature not found or not owned by the caller.' );
		}

		$prepared = $this->prepare_for_save( $changes, 'update' );

		do_action( 'imgsig/signature/before_update', $existing, $prepared );

		$updated = $this->repo->update( $signature_id, $prepared );
		// `update()` always returns a row when the original existed.
		$updated = $updated ?? $existing;

		do_action( 'imgsig/signature/updated', $updated );

		return $updated;
	}

	/**
	 * Deletes a signature.
	 *
	 * @since 1.0.0
	 *
	 * @param int $signature_id Primary key.
	 * @param int $user_id      Caller's user ID.
	 *
	 * @return void
	 *
	 * @throws OwnershipException When the row is missing or owned by someone else.
	 */
	public function delete( int $signature_id, int $user_id ): void {
		$existing = $this->repo->find_owned_by( $signature_id, $user_id );
		if ( null === $existing ) {
			throw new OwnershipException( 'Signature not found or not owned by the caller.' );
		}

		do_action( 'imgsig/signature/before_delete', $existing );

		$this->repo->delete( $signature_id );

		do_action( 'imgsig/signature/deleted', $signature_id );
	}

	/**
	 * Duplicates a signature owned by the caller.
	 *
	 * The copy is named "<original> (copy)" and gets fresh timestamps
	 * + a fresh primary key. Status defaults to `draft` regardless of
	 * the source's status so a duplicated `ready` row needs explicit
	 * approval.
	 *
	 * @since 1.0.0
	 *
	 * @param int $signature_id Primary key.
	 * @param int $user_id      Caller's user ID.
	 *
	 * @return Signature The newly inserted copy.
	 *
	 * @throws OwnershipException When the source row is missing.
	 */
	public function duplicate( int $signature_id, int $user_id ): Signature {
		$source = $this->repo->find_owned_by( $signature_id, $user_id );
		if ( null === $source ) {
			throw new OwnershipException( 'Signature not found or not owned by the caller.' );
		}

		$copy = $this->repo->insert(
			[
				'user_id'        => $user_id,
				'name'           => sprintf(
					/* translators: %s: original signature name. */
					__( '%s (copy)', 'imagina-signatures' ),
					$source->name
				),
				'json_content'   => $source->json_content,
				'template_id'    => $source->template_id,
				'status'         => Signature::STATUS_DRAFT,
				'schema_version' => $source->schema_version,
			]
		);

		do_action( 'imgsig/signature/created', $copy );

		return $copy;
	}

	/**
	 * Sanitises and validates an incoming field map before persisting.
	 *
	 * The `imgsig/signature/data_before_save` filter runs after
	 * sanitisation so listeners can mutate the prepared payload.
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, mixed> $data    Raw input.
	 * @param string               $context `create` or `update` — passed to listeners.
	 *
	 * @return array<string, mixed>
	 *
	 * @throws ValidationException When validation fails.
	 */
	private function prepare_for_save( array $data, string $context ): array {
		$prepared = [];

		if ( array_key_exists( 'name', $data ) ) {
			$prepared['name'] = sanitize_text_field( (string) $data['name'] );
		}

		if ( array_key_exists( 'status', $data ) ) {
			$status = (string) $data['status'];
			if ( ! in_array( $status, Signature::STATUSES, true ) ) {
				throw new ValidationException(
					'Invalid status value.',
					[
						[
							'path'    => 'status',
							'message' => 'Status must be one of: draft, ready, archived.',
						],
					]
				);
			}
			$prepared['status'] = $status;
		}

		if ( array_key_exists( 'template_id', $data ) ) {
			$prepared['template_id'] = (int) $data['template_id'];
		}

		if ( array_key_exists( 'json_content', $data ) ) {
			$json    = $data['json_content'];
			$decoded = is_array( $json ) ? $json : json_decode( (string) $json, true );

			if ( ! is_array( $decoded ) ) {
				throw new ValidationException(
					'json_content must be a JSON object.',
					[
						[
							'path'    => 'json_content',
							'message' => 'Could not decode payload.',
						],
					]
				);
			}

			$this->validator->validate( $decoded );

			$prepared['json_content']   = (string) wp_json_encode( $decoded );
			$prepared['schema_version'] = (string) ( $decoded['schema_version'] ?? '1.0' );
		}

		/** This filter is documented in CLAUDE.md §26.2. */
		$prepared = apply_filters( 'imgsig/signature/data_before_save', $prepared, $context );

		return is_array( $prepared ) ? $prepared : [];
	}
}
