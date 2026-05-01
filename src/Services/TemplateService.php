<?php
/**
 * Template service.
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

use ImaginaSignatures\Exceptions\ValidationException;
use ImaginaSignatures\Models\Template;
use ImaginaSignatures\Repositories\TemplateRepository;

defined( 'ABSPATH' ) || exit;

/**
 * Domain operations on templates.
 *
 * Templates are global, so there's no ownership layer — only an admin
 * capability check (enforced at the controller level). The service
 * still owns:
 *
 *  - Slug uniqueness checks before insert (the DB has a UNIQUE
 *    constraint, but catching the duplicate up here gives a typed
 *    error the REST layer can render as a clean 400).
 *  - Refusal to delete `is_system = 1` rows (seeded defaults must
 *    survive plugin updates).
 *
 * @since 1.0.0
 */
final class TemplateService {

	/**
	 * @var TemplateRepository
	 */
	private TemplateRepository $repo;

	/**
	 * @var JsonSchemaValidator
	 */
	private JsonSchemaValidator $validator;

	/**
	 * @param TemplateRepository  $repo      Template repository.
	 * @param JsonSchemaValidator $validator Schema validator.
	 */
	public function __construct( TemplateRepository $repo, JsonSchemaValidator $validator ) {
		$this->repo      = $repo;
		$this->validator = $validator;
	}

	/**
	 * Creates a new template.
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, mixed> $data Field map.
	 *
	 * @return Template
	 *
	 * @throws ValidationException On schema or uniqueness failure.
	 */
	public function create( array $data ): Template {
		$prepared = $this->prepare_for_save( $data );

		if ( null !== $this->repo->find_by_slug( (string) $prepared['slug'] ) ) {
			throw new ValidationException(
				'Slug already exists.',
				[
					[
						'path'    => 'slug',
						'message' => 'A template with this slug already exists.',
					],
				]
			);
		}

		$template = $this->repo->insert( $prepared );

		do_action( 'imgsig/template/created', $template );

		return $template;
	}

	/**
	 * Updates an existing template.
	 *
	 * @since 1.0.0
	 *
	 * @param int                  $template_id Primary key.
	 * @param array<string, mixed> $changes     Partial field map.
	 *
	 * @return Template
	 *
	 * @throws ValidationException When the source row is missing or the
	 *                             new payload fails schema validation.
	 */
	public function update( int $template_id, array $changes ): Template {
		$existing = $this->repo->find( $template_id );
		if ( null === $existing ) {
			throw new ValidationException(
				'Template not found.',
				[
					[
						'path'    => 'id',
						'message' => 'No template with this id.',
					],
				]
			);
		}

		$prepared = $this->prepare_for_save( $changes );

		// Slug change must not collide with another row.
		if ( isset( $prepared['slug'] ) && $prepared['slug'] !== $existing->slug ) {
			$collision = $this->repo->find_by_slug( (string) $prepared['slug'] );
			if ( null !== $collision && $collision->id !== $template_id ) {
				throw new ValidationException(
					'Slug already exists.',
					[
						[
							'path'    => 'slug',
							'message' => 'A template with this slug already exists.',
						],
					]
				);
			}
		}

		$updated = $this->repo->update( $template_id, $prepared );
		return $updated ?? $existing;
	}

	/**
	 * Deletes a template, refusing to remove `is_system` rows.
	 *
	 * @since 1.0.0
	 *
	 * @param int $template_id Primary key.
	 *
	 * @return void
	 *
	 * @throws ValidationException When the row is system-protected or missing.
	 */
	public function delete( int $template_id ): void {
		$existing = $this->repo->find( $template_id );
		if ( null === $existing ) {
			throw new ValidationException(
				'Template not found.',
				[
					[
						'path'    => 'id',
						'message' => 'No template with this id.',
					],
				]
			);
		}

		if ( $existing->is_system ) {
			throw new ValidationException(
				'System templates cannot be deleted.',
				[
					[
						'path'    => 'id',
						'message' => 'This template is shipped with the plugin.',
					],
				]
			);
		}

		$this->repo->delete( $template_id );

		do_action( 'imgsig/template/deleted', $template_id );
	}

	/**
	 * Sanitises and validates a template payload.
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, mixed> $data Raw input.
	 *
	 * @return array<string, mixed>
	 *
	 * @throws ValidationException On schema failure.
	 */
	private function prepare_for_save( array $data ): array {
		$prepared = [];

		if ( array_key_exists( 'slug', $data ) ) {
			$prepared['slug'] = sanitize_title( (string) $data['slug'] );
		}

		foreach ( [ 'name', 'category', 'description' ] as $field ) {
			if ( array_key_exists( $field, $data ) ) {
				$prepared[ $field ] = sanitize_text_field( (string) $data[ $field ] );
			}
		}

		if ( array_key_exists( 'preview_url', $data ) ) {
			$prepared['preview_url'] = esc_url_raw( (string) $data['preview_url'] );
		}

		if ( array_key_exists( 'sort_order', $data ) ) {
			$prepared['sort_order'] = (int) $data['sort_order'];
		}

		if ( array_key_exists( 'visible_to_roles', $data ) ) {
			$roles = $data['visible_to_roles'];
			$prepared['visible_to_roles'] = is_array( $roles )
				? array_values( array_filter( array_map( 'sanitize_key', array_map( 'strval', $roles ) ) ) )
				: [];
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

		return $prepared;
	}
}
