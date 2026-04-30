<?php
/**
 * Seeds the default templates on plugin activation.
 *
 * @package ImaginaSignatures\Setup
 */

declare(strict_types=1);

namespace ImaginaSignatures\Setup;

use ImaginaSignatures\Repositories\TemplateRepository;

defined( 'ABSPATH' ) || exit;

/**
 * Reads every JSON file under `templates/` and inserts a row in
 * `imgsig_templates` for any slug that doesn't already exist.
 *
 * Idempotent: re-running on a populated install is a no-op for
 * pre-existing slugs. System rows are stamped `is_system = 1` so
 * the {@see TemplateService} refuses deletion (CLAUDE.md §27).
 *
 * Sprint 10 ships with two templates (`minimal-modern`,
 * `corporate-classic`); the remaining eight from §27 are queued
 * to land before public release.
 *
 * @since 1.0.0
 */
final class DefaultTemplatesSeeder {

	/**
	 * Static metadata for each shipped template, keyed by slug.
	 *
	 * Keeps the human-readable label / category / sort_order out of
	 * the JSON files so the JSON stays focused on the actual schema.
	 *
	 * @var array<string, array{name: string, category: string, sort_order: int, description: string}>
	 */
	private const META = [
		'minimal-modern'    => [
			'name'        => 'Minimal Modern',
			'category'    => 'minimal',
			'sort_order'  => 10,
			'description' => 'Single column, generous spacing, sans-serif.',
		],
		'corporate-classic' => [
			'name'        => 'Corporate Classic',
			'category'    => 'corporate',
			'sort_order'  => 20,
			'description' => 'Serif typography with a short rule.',
		],
	];

	/**
	 * @var TemplateRepository
	 */
	private TemplateRepository $repo;

	/**
	 * @param TemplateRepository $repo Repository.
	 */
	public function __construct( TemplateRepository $repo ) {
		$this->repo = $repo;
	}

	/**
	 * Reads the JSON files under `templates/` and inserts one row
	 * per slug, skipping rows that already exist.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function seed(): void {
		$base_dir = trailingslashit( IMGSIG_PATH ) . 'templates';
		if ( ! is_dir( $base_dir ) ) {
			return;
		}

		foreach ( self::META as $slug => $meta ) {
			if ( null !== $this->repo->find_by_slug( $slug ) ) {
				continue;
			}

			$file = $base_dir . '/' . $slug . '.json';
			if ( ! is_file( $file ) ) {
				continue;
			}

			$json    = (string) file_get_contents( $file );
			$decoded = json_decode( $json, true );
			if ( ! is_array( $decoded ) ) {
				continue;
			}

			$this->repo->insert(
				[
					'slug'           => $slug,
					'name'           => $meta['name'],
					'category'       => $meta['category'],
					'description'    => $meta['description'],
					'json_content'   => (string) wp_json_encode( $decoded ),
					'is_system'      => true,
					'sort_order'     => $meta['sort_order'],
					'schema_version' => isset( $decoded['schema_version'] )
						? (string) $decoded['schema_version']
						: '1.0',
				]
			);
		}
	}
}
