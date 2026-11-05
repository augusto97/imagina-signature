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
 * Template files may use any supported schema version (1.0 or 1.1,
 * see {@see \ImaginaSignatures\Services\JsonSchemaValidator::SUPPORTED_VERSIONS});
 * the row's `schema_version` column records the file's version and
 * defaults to 1.0 for files that predate the field.
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
		'sales-active'      => [
			'name'        => 'Sales Active',
			'category'    => 'sales',
			'sort_order'  => 30,
			'description' => 'Conversion-focused with a CTA button.',
		],
		'medical'           => [
			'name'        => 'Medical',
			'category'    => 'professional',
			'sort_order'  => 40,
			'description' => 'Professional credentials with a confidentiality disclaimer.',
		],
		'legal'             => [
			'name'        => 'Legal',
			'category'    => 'professional',
			'sort_order'  => 50,
			'description' => 'Serif type with a long privilege disclaimer.',
		],
		'creative'          => [
			'name'        => 'Creative',
			'category'    => 'creative',
			'sort_order'  => 60,
			'description' => 'Vibrant accent colours and social icons.',
		],
		'developer'         => [
			'name'        => 'Developer',
			'category'    => 'creative',
			'sort_order'  => 70,
			'description' => 'Monospace type with a GitHub link.',
		],
		'tech-startup'      => [
			'name'        => 'Tech Startup',
			'category'    => 'sales',
			'sort_order'  => 80,
			'description' => 'Modern type with a product CTA.',
		],
		'consultant'        => [
			'name'        => 'Consultant',
			'category'    => 'professional',
			'sort_order'  => 90,
			'description' => 'Credentials front-and-centre with LinkedIn.',
		],
		'e-commerce'        => [
			'name'        => 'E-commerce',
			'category'    => 'sales',
			'sort_order'  => 100,
			'description' => 'Shop CTA + social icons for storefront teams.',
		],
		// Multi-column templates added in 1.0.32. They are stored in
		// schema 1.0 (container `children` / `right_children`); the
		// editor migrates them to 1.1 `columns` when a template is
		// applied or previewed, and the validator accepts both versions.
		'logo-left'         => [
			'name'        => 'Logo + info (2-column)',
			'category'    => 'multi-column',
			'sort_order'  => 110,
			'description' => 'Square logo on the left, name / role / contact / socials on the right.',
		],
		'avatar-pro'        => [
			'name'        => 'Avatar + info (2-column)',
			'category'    => 'multi-column',
			'sort_order'  => 120,
			'description' => 'Round profile photo + role on the left, contacts and socials on the right.',
		],
		'two-col-balanced'  => [
			'name'        => 'Balanced split (2-column)',
			'category'    => 'multi-column',
			'sort_order'  => 130,
			'description' => 'Headline + tagline on the left, contacts + Book-a-call CTA on the right.',
		],
	];

	/**
	 * Translated name / description of every seeded template, keyed by
	 * slug.
	 *
	 * The DB keeps the English source strings from {@see self::META}
	 * (seeding may run in any locale), and the REST layer swaps them for
	 * these at read time via {@see self::localize()}. The literal
	 * `__()` calls are what lets `npm run i18n:pot` extract them — keep
	 * them in sync with META (a unit test enforces it).
	 *
	 * @since 1.1.0
	 *
	 * @return array<string, array{name: string, description: string}>
	 */
	public static function translated_meta(): array {
		return [
			'minimal-modern'    => [
				'name'        => __( 'Minimal Modern', 'imagina-signatures' ),
				'description' => __( 'Single column, generous spacing, sans-serif.', 'imagina-signatures' ),
			],
			'corporate-classic' => [
				'name'        => __( 'Corporate Classic', 'imagina-signatures' ),
				'description' => __( 'Serif typography with a short rule.', 'imagina-signatures' ),
			],
			'sales-active'      => [
				'name'        => __( 'Sales Active', 'imagina-signatures' ),
				'description' => __( 'Conversion-focused with a CTA button.', 'imagina-signatures' ),
			],
			'medical'           => [
				'name'        => __( 'Medical', 'imagina-signatures' ),
				'description' => __( 'Professional credentials with a confidentiality disclaimer.', 'imagina-signatures' ),
			],
			'legal'             => [
				'name'        => __( 'Legal', 'imagina-signatures' ),
				'description' => __( 'Serif type with a long privilege disclaimer.', 'imagina-signatures' ),
			],
			'creative'          => [
				'name'        => __( 'Creative', 'imagina-signatures' ),
				'description' => __( 'Vibrant accent colours and social icons.', 'imagina-signatures' ),
			],
			'developer'         => [
				'name'        => __( 'Developer', 'imagina-signatures' ),
				'description' => __( 'Monospace type with a GitHub link.', 'imagina-signatures' ),
			],
			'tech-startup'      => [
				'name'        => __( 'Tech Startup', 'imagina-signatures' ),
				'description' => __( 'Modern type with a product CTA.', 'imagina-signatures' ),
			],
			'consultant'        => [
				'name'        => __( 'Consultant', 'imagina-signatures' ),
				'description' => __( 'Credentials front-and-centre with LinkedIn.', 'imagina-signatures' ),
			],
			'e-commerce'        => [
				'name'        => __( 'E-commerce', 'imagina-signatures' ),
				'description' => __( 'Shop CTA + social icons for storefront teams.', 'imagina-signatures' ),
			],
			'logo-left'         => [
				'name'        => __( 'Logo + info (2-column)', 'imagina-signatures' ),
				'description' => __( 'Square logo on the left, name / role / contact / socials on the right.', 'imagina-signatures' ),
			],
			'avatar-pro'        => [
				'name'        => __( 'Avatar + info (2-column)', 'imagina-signatures' ),
				'description' => __( 'Round profile photo + role on the left, contacts and socials on the right.', 'imagina-signatures' ),
			],
			'two-col-balanced'  => [
				'name'        => __( 'Balanced split (2-column)', 'imagina-signatures' ),
				'description' => __( 'Headline + tagline on the left, contacts + Book-a-call CTA on the right.', 'imagina-signatures' ),
			],
		];
	}

	/**
	 * Swaps a seeded system template's English name / description for
	 * the current locale's translation.
	 *
	 * Only fields still holding the seeded source text are touched: an
	 * admin who renamed a system template keeps their wording, and
	 * user-created templates are never translated.
	 *
	 * @since 1.1.0
	 *
	 * @param array<string, mixed> $template Serialised template ({@see \ImaginaSignatures\Models\Template::to_array()}).
	 *
	 * @return array<string, mixed>
	 */
	public static function localize( array $template ): array {
		$slug = isset( $template['slug'] ) ? (string) $template['slug'] : '';
		if ( empty( $template['is_system'] ) || ! isset( self::META[ $slug ] ) ) {
			return $template;
		}

		$translated = self::translated_meta()[ $slug ] ?? null;
		if ( null === $translated ) {
			return $template;
		}

		foreach ( [ 'name', 'description' ] as $field ) {
			if ( isset( $template[ $field ] ) && self::META[ $slug ][ $field ] === $template[ $field ] ) {
				$template[ $field ] = $translated[ $field ];
			}
		}
		return $template;
	}

	/**
	 * Inverse of {@see self::localize()} for writes: when an admin saves
	 * a system template's metadata form without changing the (translated)
	 * name / description it was shown, store the English source again so
	 * other locales keep seeing their own translation.
	 *
	 * @since 1.1.0
	 *
	 * @param string               $slug    Slug of the template being updated.
	 * @param bool                 $is_system Whether it's a seeded system row.
	 * @param array<string, mixed> $payload Incoming update payload.
	 *
	 * @return array<string, mixed>
	 */
	public static function delocalize( string $slug, bool $is_system, array $payload ): array {
		if ( ! $is_system || ! isset( self::META[ $slug ] ) ) {
			return $payload;
		}

		$translated = self::translated_meta()[ $slug ] ?? null;
		if ( null === $translated ) {
			return $payload;
		}

		foreach ( [ 'name', 'description' ] as $field ) {
			if ( isset( $payload[ $field ] ) && is_string( $payload[ $field ] ) && trim( $payload[ $field ] ) === $translated[ $field ] ) {
				$payload[ $field ] = self::META[ $slug ][ $field ];
			}
		}
		return $payload;
	}

	/**
	 * English source metadata of the seeded templates (slug => meta).
	 *
	 * @since 1.1.0
	 *
	 * @return array<string, array{name: string, category: string, sort_order: int, description: string}>
	 */
	public static function source_meta(): array {
		return self::META;
	}

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
