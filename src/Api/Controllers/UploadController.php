<?php
/**
 * REST controller for /upload/*.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Repositories\AssetRepository;
use ImaginaSignatures\Repositories\UsageRepository;
use ImaginaSignatures\Security\RateLimiter;
use ImaginaSignatures\Services\QuotaEnforcer;
use ImaginaSignatures\Storage\StorageManager;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Coordinates the two upload modes:
 *
 * - `init`: returns either a presigned URL (S3) or an internal upload URL
 *   (Media Library). The browser then PUTs the file to that URL.
 * - `direct`: receives multipart/form-data and stores the file via the
 *   active driver. Used when presigned uploads aren't supported.
 * - `finalize`: confirms a presigned upload completed and registers the
 *   asset row.
 *
 * @since 1.0.0
 */
final class UploadController extends BaseController {

	private const ALLOWED_MIME = [ 'image/png', 'image/jpeg', 'image/gif', 'image/webp' ];

	private StorageManager $storage;
	private AssetRepository $assets;
	private UsageRepository $usage;
	private QuotaEnforcer $quota;
	private RateLimiter $rate;

	public function __construct(
		StorageManager $storage,
		AssetRepository $assets,
		UsageRepository $usage,
		QuotaEnforcer $quota,
		RateLimiter $rate
	) {
		$this->storage = $storage;
		$this->assets  = $assets;
		$this->usage   = $usage;
		$this->quota   = $quota;
		$this->rate    = $rate;
	}

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/upload/init',
			[
				'methods'             => 'POST',
				'callback'            => [ $this, 'init' ],
				'permission_callback' => $this->permission_for( 'imgsig_upload_assets' ),
			]
		);
		register_rest_route(
			self::NAMESPACE,
			'/upload/direct',
			[
				'methods'             => 'POST',
				'callback'            => [ $this, 'direct' ],
				'permission_callback' => $this->permission_for( 'imgsig_upload_assets' ),
			]
		);
		register_rest_route(
			self::NAMESPACE,
			'/upload/finalize',
			[
				'methods'             => 'POST',
				'callback'            => [ $this, 'finalize' ],
				'permission_callback' => $this->permission_for( 'imgsig_upload_assets' ),
			]
		);
	}

	public function init( \WP_REST_Request $request ) {
		try {
			$user_id = get_current_user_id();
			$this->rate->check( 'upload', $user_id, 10, MINUTE_IN_SECONDS );

			$mime = (string) $request->get_param( 'mime_type' );
			$size = (int) $request->get_param( 'size_bytes' );
			$ext  = $this->extension_for( $mime );

			if ( ! in_array( $mime, self::ALLOWED_MIME, true ) ) {
				return new \WP_Error( 'imgsig_invalid_mime', __( 'Unsupported file type.', 'imagina-signatures' ), [ 'status' => 400 ] );
			}

			$this->quota->check_can_upload( $user_id, $size );

			$key    = $this->build_key( $user_id, $ext );
			$driver = $this->storage->get_active_driver();

			if ( $driver->supports_presigned_uploads() ) {
				$presigned = $driver->get_presigned_upload_url( $key, $mime, $size, 5 * MINUTE_IN_SECONDS );
				return rest_ensure_response(
					array_merge( [ 'method' => 'presigned' ], $presigned->to_array() )
				);
			}

			$token = wp_generate_password( 32, false, false );
			set_transient( 'imgsig_upload_' . $token, [
				'user_id' => $user_id,
				'key'     => $key,
				'mime'    => $mime,
			], MINUTE_IN_SECONDS * 10 );

			return rest_ensure_response(
				[
					'method'      => 'direct',
					'upload_url'  => rest_url( self::NAMESPACE . '/upload/direct?token=' . $token ),
					'storage_key' => $key,
				]
			);
		} catch ( \Throwable $e ) {
			return $this->exception_to_wp_error( $e );
		}
	}

	public function direct( \WP_REST_Request $request ) {
		try {
			$token = (string) $request->get_param( 'token' );
			$ctx   = get_transient( 'imgsig_upload_' . $token );
			if ( ! is_array( $ctx ) ) {
				return new \WP_Error( 'imgsig_invalid_token', '', [ 'status' => 400 ] );
			}
			delete_transient( 'imgsig_upload_' . $token );

			if ( (int) $ctx['user_id'] !== get_current_user_id() ) {
				return new \WP_Error( 'imgsig_forbidden', '', [ 'status' => 403 ] );
			}

			$file_params = $request->get_file_params();
			if ( empty( $file_params['file']['tmp_name'] ) ) {
				return new \WP_Error( 'imgsig_no_file', '', [ 'status' => 400 ] );
			}

			$tmp_path = (string) $file_params['file']['tmp_name'];
			$driver   = $this->storage->get_active_driver();
			$result   = $driver->upload( $tmp_path, (string) $ctx['key'], [ 'mime_type' => (string) $ctx['mime'] ] );

			$asset_id = $this->assets->create(
				[
					'user_id'        => (int) $ctx['user_id'],
					'storage_driver' => $driver->get_id(),
					'storage_key'    => $result->storage_key,
					'public_url'     => $result->public_url,
					'mime_type'      => $result->mime_type,
					'size_bytes'     => $result->size_bytes,
					'width'          => $result->width,
					'height'         => $result->height,
					'hash_sha256'    => $result->hash_sha256 ?? '',
				]
			);

			$this->usage->adjust( (int) $ctx['user_id'], 0, $result->size_bytes );

			$asset = $this->assets->find( $asset_id );
			do_action( 'imgsig/asset/uploaded', $asset );

			return rest_ensure_response( $asset !== null ? $asset->to_array() : [ 'id' => $asset_id ] );
		} catch ( \Throwable $e ) {
			return $this->exception_to_wp_error( $e );
		}
	}

	public function finalize( \WP_REST_Request $request ) {
		try {
			$user_id     = get_current_user_id();
			$key         = (string) $request->get_param( 'storage_key' );
			$mime        = (string) $request->get_param( 'mime_type' );
			$size        = (int) $request->get_param( 'size_bytes' );
			$width       = (int) $request->get_param( 'width' );
			$height      = (int) $request->get_param( 'height' );
			$hash        = (string) ( $request->get_param( 'hash_sha256' ) ?? '' );
			$driver      = $this->storage->get_active_driver();

			$asset_id = $this->assets->create(
				[
					'user_id'        => $user_id,
					'storage_driver' => $driver->get_id(),
					'storage_key'    => $key,
					'public_url'     => $driver->get_public_url( $key ),
					'mime_type'      => $mime,
					'size_bytes'     => $size,
					'width'          => $width > 0 ? $width : null,
					'height'         => $height > 0 ? $height : null,
					'hash_sha256'    => $hash,
				]
			);

			$this->usage->adjust( $user_id, 0, $size );
			$asset = $this->assets->find( $asset_id );

			do_action( 'imgsig/asset/uploaded', $asset );

			return rest_ensure_response( $asset !== null ? $asset->to_array() : [ 'id' => $asset_id ] );
		} catch ( \Throwable $e ) {
			return $this->exception_to_wp_error( $e );
		}
	}

	/**
	 * Picks an extension from a MIME type.
	 *
	 * @param string $mime MIME type.
	 *
	 * @return string
	 */
	private function extension_for( string $mime ): string {
		switch ( $mime ) {
			case 'image/jpeg':
				return 'jpg';
			case 'image/png':
				return 'png';
			case 'image/gif':
				return 'gif';
			case 'image/webp':
				return 'webp';
			default:
				return 'bin';
		}
	}

	/**
	 * Builds a per-user storage key.
	 *
	 * @param int    $user_id   User id.
	 * @param string $extension File extension (no dot).
	 *
	 * @return string
	 */
	private function build_key( int $user_id, string $extension ): string {
		$random = bin2hex( random_bytes( 8 ) );
		$date   = gmdate( 'Y/m' );
		return $user_id . '/' . $date . '/' . $random . '.' . $extension;
	}
}
