<?php
/**
 * CSV profile import REST endpoint.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Api\Middleware\CapabilityCheck;
use ImaginaSignatures\Directory\ProfileFields;
use ImaginaSignatures\Directory\ProfileImporter;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * `imgsig_manage_team` only:
 *
 *   GET  /admin/profiles/import   what the import UI needs (fields, roles, limits)
 *   POST /admin/profiles/import   { rows, columns, dry_run, row_offset, options }
 *
 * The admin app parses the CSV and posts it in chunks of at most
 * {@see ProfileImporter::MAX_ROWS} rows; see {@see ProfileImporter}
 * for the column targets and the result shape.
 *
 * @since 1.3.0
 */
final class ProfileImportController extends BaseController {

	/**
	 * @var ProfileImporter
	 */
	private ProfileImporter $importer;

	/**
	 * @param ProfileImporter|null $importer Importer.
	 */
	public function __construct( ?ProfileImporter $importer = null ) {
		$this->importer = $importer ?? new ProfileImporter();
	}

	/**
	 * @inheritDoc
	 */
	public function register_routes(): void {
		$require_team = CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_MANAGE_TEAM );

		register_rest_route(
			self::NAMESPACE,
			'/admin/profiles/import',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'show' ],
					'permission_callback' => $require_team,
				],
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'import' ],
					'permission_callback' => $require_team,
				],
			]
		);
	}

	/**
	 * `GET /admin/profiles/import`.
	 *
	 * @since 1.3.0
	 *
	 * @return \WP_REST_Response
	 */
	public function show(): \WP_REST_Response {
		return rest_ensure_response(
			[
				'fields'   => ProfileFields::definitions(),
				'roles'    => ProfileImporter::assignable_roles(),
				'max_rows' => ProfileImporter::MAX_ROWS,
			]
		);
	}

	/**
	 * `POST /admin/profiles/import`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function import( \WP_REST_Request $request ) {
		$rows    = $request->get_param( 'rows' );
		$columns = $request->get_param( 'columns' );

		if ( ! is_array( $rows ) || ! is_array( $columns ) ) {
			return self::invalid( __( 'Send rows and columns as lists.', 'imagina-signatures' ) );
		}
		if ( count( $rows ) > ProfileImporter::MAX_ROWS ) {
			return self::invalid(
				/* translators: %d: maximum rows per request. */
				sprintf( __( 'Send at most %d rows per request.', 'imagina-signatures' ), ProfileImporter::MAX_ROWS )
			);
		}

		$columns = array_values( $columns );
		$error   = ProfileImporter::validate_columns( $columns );
		if ( '' !== $error ) {
			return self::invalid( $error );
		}

		$options = $request->get_param( 'options' );
		$dry_run = null === $request->get_param( 'dry_run' ) ? true : rest_sanitize_boolean( $request->get_param( 'dry_run' ) );
		$offset  = max( 0, (int) $request->get_param( 'row_offset' ) );

		return rest_ensure_response(
			$this->importer->run( array_values( $rows ), $columns, is_array( $options ) ? $options : [], $dry_run, $offset )
		);
	}

	/**
	 * @param string $message Message.
	 *
	 * @return \WP_Error
	 */
	private static function invalid( string $message ): \WP_Error {
		return new \WP_Error( 'imgsig_validation_failed', $message, [ 'status' => 400 ] );
	}
}
