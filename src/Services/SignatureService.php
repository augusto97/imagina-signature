<?php
/**
 * Signature CRUD + business rules.
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

use ImaginaSignatures\Exceptions\OwnershipException;
use ImaginaSignatures\Exceptions\ValidationException;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Repositories\UsageRepository;
use ImaginaSignatures\Utils\Logger;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * User-scoped signature service.
 *
 * Public methods always receive an owner user_id and never operate
 * cross-user. Ownership is asserted before mutations.
 *
 * @since 1.0.0
 */
final class SignatureService {

	private SignatureRepository $repo;
	private UsageRepository $usage;
	private QuotaEnforcer $quota;
	private JsonSchemaValidator $validator;
	private Logger $logger;

	public function __construct(
		SignatureRepository $repo,
		UsageRepository $usage,
		QuotaEnforcer $quota,
		JsonSchemaValidator $validator,
		Logger $logger
	) {
		$this->repo      = $repo;
		$this->usage     = $usage;
		$this->quota     = $quota;
		$this->validator = $validator;
		$this->logger    = $logger;
	}

	/**
	 * Lists signatures owned by the user.
	 *
	 * @param int                  $user_id User id.
	 * @param array<string, mixed> $args    Filters.
	 *
	 * @return array{items: Signature[], total: int}
	 */
	public function list_for_user( int $user_id, array $args = [] ): array {
		return $this->repo->find_by_user( $user_id, $args );
	}

	/**
	 * Loads a signature, asserting ownership.
	 *
	 * @param int $user_id User id.
	 * @param int $id      Signature id.
	 *
	 * @return Signature
	 */
	public function get_for_user( int $user_id, int $id ): Signature {
		$sig = $this->repo->find( $id );
		if ( null === $sig ) {
			throw new ValidationException(
				__( 'Signature not found.', 'imagina-signatures' ),
				[ [ 'path' => 'id', 'message' => 'not_found' ] ]
			);
		}
		$this->assert_ownership( $sig, $user_id );
		return $sig;
	}

	/**
	 * Creates a signature.
	 *
	 * @param int                  $user_id User id.
	 * @param array<string, mixed> $data    Signature payload.
	 *
	 * @return Signature
	 */
	public function create( int $user_id, array $data ): Signature {
		$this->quota->check_can_create_signature( $user_id );

		$name = sanitize_text_field( (string) ( $data['name'] ?? '' ) );
		if ( '' === $name ) {
			throw new ValidationException(
				__( 'Name is required.', 'imagina-signatures' ),
				[ [ 'path' => 'name', 'message' => 'required' ] ]
			);
		}

		$json = is_array( $data['json_content'] ?? null ) ? $data['json_content'] : [];

		/** @var array<string, mixed> $json */
		$json = (array) apply_filters( 'imgsig/signature/data_before_save', $json, [ 'context' => 'create', 'user_id' => $user_id ] );
		$this->validator->validate( $json );

		$template_id = isset( $data['template_id'] ) ? (int) $data['template_id'] : null;

		$id  = $this->repo->create( $user_id, $name, $json, $template_id );
		$sig = $this->repo->find( $id );
		if ( null === $sig ) {
			throw new \RuntimeException( 'Could not load saved signature.' );
		}

		$this->usage->adjust( $user_id, 1, 0 );
		$this->logger->info(
			'signature_created',
			[ 'user_id' => $user_id, 'signature_id' => $id ]
		);

		do_action( 'imgsig/signature/created', $sig );
		return $sig;
	}

	/**
	 * Updates a signature.
	 *
	 * @param int                  $user_id User id.
	 * @param int                  $id      Signature id.
	 * @param array<string, mixed> $data    Patch.
	 *
	 * @return Signature
	 */
	public function update( int $user_id, int $id, array $data ): Signature {
		$old = $this->get_for_user( $user_id, $id );

		$changes = [];
		if ( isset( $data['name'] ) ) {
			$name = sanitize_text_field( (string) $data['name'] );
			if ( '' === $name ) {
				throw new ValidationException(
					__( 'Name cannot be empty.', 'imagina-signatures' ),
					[ [ 'path' => 'name', 'message' => 'required' ] ]
				);
			}
			$changes['name'] = $name;
		}

		if ( isset( $data['json_content'] ) && is_array( $data['json_content'] ) ) {
			$json = (array) apply_filters( 'imgsig/signature/data_before_save', $data['json_content'], [ 'context' => 'update', 'user_id' => $user_id ] );
			$this->validator->validate( $json );
			$changes['json_content'] = $json;
		}

		if ( isset( $data['status'] ) ) {
			$status = (string) $data['status'];
			if ( ! in_array( $status, [ 'draft', 'ready', 'archived' ], true ) ) {
				throw new ValidationException(
					__( 'Invalid status.', 'imagina-signatures' ),
					[ [ 'path' => 'status', 'message' => 'invalid' ] ]
				);
			}
			$changes['status'] = $status;
		}

		if ( array_key_exists( 'html_cache', $data ) ) {
			$changes['html_cache'] = $data['html_cache'] === null ? null : (string) $data['html_cache'];
		}
		if ( array_key_exists( 'preview_url', $data ) ) {
			$changes['preview_url'] = $data['preview_url'] === null ? null : (string) $data['preview_url'];
		}

		do_action( 'imgsig/signature/before_update', $old, $changes );
		$this->repo->update( $id, $changes );

		$updated = $this->repo->find( $id );
		if ( null === $updated ) {
			throw new \RuntimeException( 'Could not reload updated signature.' );
		}

		do_action( 'imgsig/signature/updated', $updated );
		return $updated;
	}

	/**
	 * Deletes a signature.
	 *
	 * @param int $user_id User id.
	 * @param int $id      Signature id.
	 *
	 * @return void
	 */
	public function delete( int $user_id, int $id ): void {
		$sig = $this->get_for_user( $user_id, $id );

		do_action( 'imgsig/signature/before_delete', $sig );
		$this->repo->delete( $id );
		$this->usage->adjust( $user_id, -1, 0 );

		do_action( 'imgsig/signature/deleted', $id );
	}

	/**
	 * Duplicates a signature.
	 *
	 * @param int $user_id User id.
	 * @param int $id      Source signature id.
	 *
	 * @return Signature
	 */
	public function duplicate( int $user_id, int $id ): Signature {
		$source = $this->get_for_user( $user_id, $id );
		return $this->create(
			$user_id,
			[
				'name'         => $source->name . ' ' . __( '(Copy)', 'imagina-signatures' ),
				'json_content' => $source->json_content,
				'template_id'  => $source->template_id,
			]
		);
	}

	/**
	 * Asserts that a signature belongs to a user (or that the user is admin).
	 *
	 * @param Signature $sig     Signature.
	 * @param int       $user_id Caller.
	 *
	 * @return void
	 */
	private function assert_ownership( Signature $sig, int $user_id ): void {
		if ( $sig->user_id === $user_id ) {
			return;
		}
		if ( user_can( $user_id, 'imgsig_view_all_signatures' ) ) {
			return;
		}
		throw new OwnershipException( __( 'Forbidden.', 'imagina-signatures' ) );
	}
}
