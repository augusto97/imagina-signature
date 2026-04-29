<?php
/**
 * Template service.
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

use ImaginaSignatures\Models\Template;
use ImaginaSignatures\Repositories\TemplateRepository;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Listing and admin CRUD for templates.
 *
 * @since 1.0.0
 */
final class TemplateService {

	private TemplateRepository $repo;
	private JsonSchemaValidator $validator;

	public function __construct( TemplateRepository $repo, JsonSchemaValidator $validator ) {
		$this->repo      = $repo;
		$this->validator = $validator;
	}

	/**
	 * @param array<string, mixed> $args Filters.
	 *
	 * @return Template[]
	 */
	public function list_templates( array $args = [] ): array {
		return $this->repo->find_all( $args );
	}

	/**
	 * @param int $id Template id.
	 *
	 * @return Template|null
	 */
	public function get( int $id ): ?Template {
		return $this->repo->find( $id );
	}

	/**
	 * Persists a template (admin operation).
	 *
	 * @param array<string, mixed> $data Template fields.
	 *
	 * @return Template
	 */
	public function save( array $data ): Template {
		if ( isset( $data['json_content'] ) && is_array( $data['json_content'] ) ) {
			$this->validator->validate( $data['json_content'] );
		}
		$id       = $this->repo->upsert( $data );
		$template = $this->repo->find( $id );
		if ( null === $template ) {
			throw new \RuntimeException( 'Could not load saved template.' );
		}
		do_action( 'imgsig/template/saved', $template );
		return $template;
	}
}
