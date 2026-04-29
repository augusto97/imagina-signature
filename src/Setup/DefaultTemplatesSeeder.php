<?php
/**
 * Loads bundled JSON templates into the database.
 *
 * @package ImaginaSignatures\Setup
 */

declare(strict_types=1);

namespace ImaginaSignatures\Setup;

use ImaginaSignatures\Repositories\TemplateRepository;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Reads `templates/*.json` and upserts each into `imgsig_templates`.
 *
 * Re-running on an already-seeded site upserts by slug, so admins can
 * "reset" a template by re-running activation.
 *
 * @since 1.0.0
 */
final class DefaultTemplatesSeeder {

	private TemplateRepository $repo;
	private string $templates_dir;

	public function __construct( ?TemplateRepository $repo = null, ?string $templates_dir = null ) {
		$this->repo          = $repo ?? new TemplateRepository();
		$this->templates_dir = $templates_dir ?? IMGSIG_PLUGIN_DIR . 'templates';
	}

	/**
	 * Seeds every JSON file in the templates directory.
	 *
	 * @return int Number of templates loaded.
	 */
	public function seed(): int {
		if ( ! is_dir( $this->templates_dir ) ) {
			return 0;
		}

		$count = 0;
		foreach ( (array) glob( trailingslashit( $this->templates_dir ) . '*.json' ) as $path ) {
			$json = file_get_contents( (string) $path );
			if ( false === $json ) {
				continue;
			}
			$data = json_decode( $json, true );
			if ( ! is_array( $data ) || empty( $data['slug'] ) ) {
				continue;
			}
			$data['is_system'] = true;
			$this->repo->upsert( $data );
			++$count;
		}

		return $count;
	}
}
