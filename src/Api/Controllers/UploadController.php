<?php
/**
 * Upload endpoints (init / direct / finalize).
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Api\Middleware\CapabilityCheck;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Exceptions\ImaginaSignaturesException;
use ImaginaSignatures\Exceptions\StorageException;
use ImaginaSignatures\Repositories\AssetRepository;
use ImaginaSignatures\Setup\CapabilitiesInstaller;
use ImaginaSignatures\Storage\StorageManager;

defined( 'ABSPATH' ) || exit;

/**
 * Three-step upload flow (CLAUDE.md §17.5):
 *
 *  1. `POST /upload/init` — the editor describes the file it wants to
 *     upload (filename / mime / size). Server picks the path:
 *       - presigned     → returns a URL the browser PUTs directly to S3.
 *       - direct        → returns this endpoint's `/upload/direct` URL
 *                         and the browser POSTs multipart to PHP.
 *  2. For S3 only:  browser PUTs to the presigned URL, then calls
 *     `POST /upload/finalize` so the server can insert the asset row
 *     once the bytes are durably stored.
 *  3. For Media Library:  the multipart body is handled by the
 *     `/upload/direct` endpoint here, which delegates to
 *     {@see MediaLibraryDriver::upload()} and inserts the asset row in
 *     a single round-trip.
 *
 * All three endpoints are gated by `imgsig_use_signatures`. A 10/min
 * per-user rate limit applies on `init` (CLAUDE.md §29 SIEMPRE).
 *
 * @since 1.0.0
 */
final class UploadController extends BaseController {

	/**
	 * Rate-limit action name.
	 */
	private const RL_ACTION = 'upload';

	/**
	 * Allowed mime types. SVG is intentionally not on the list
	 * (CLAUDE.md §19.4).
	 *
	 * @var string[]
	 */
	private const ALLOWED_MIME_TYPES = [ 'image/png', 'image/jpeg', 'image/webp', 'image/gif' ];

	/**
	 * Default presigned-URL TTL.
	 */
	private const PRESIGN_TTL_SECONDS = 300;

	/**
	 * @var StorageManager
	 */
	private StorageManager $storage;

	/**
	 * @var AssetRepository
	 */
	private AssetRepository $assets;

	/**
	 * @var RateLimiter
	 */
	private RateLimiter $rate_limiter;

	/**
	 * @param StorageManager  $storage      Storage manager.
	 * @param AssetRepository $assets       Asset repository.
	 * @param RateLimiter     $rate_limiter Rate limiter.
	 */
	public function __construct( StorageManager $storage, AssetRepository $assets, RateLimiter $rate_limiter ) {
		$this->storage      = $storage;
		$this->assets       = $assets;
		$this->rate_limiter = $rate_limiter;
	}

	/**
	 * @inheritDoc
	 */
	public function register_routes(): void {
		$require_use = CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_USE );

		register_rest_route(
			self::NAMESPACE,
			'/upload/init',
			[
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'init' ],
					'permission_callback' => $require_use,
					'args'                => [
						'filename'    => [ 'type' => 'string', 'required' => true ],
						'mime_type'   => [ 'type' => 'string', 'required' => true ],
						'size_bytes'  => [ 'type' => 'integer', 'required' => true, 'minimum' => 1 ],
						'hash_sha256' => [ 'type' => 'string' ],
					],
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/upload/direct',
			[
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'direct' ],
					'permission_callback' => $require_use,
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/upload/finalize',
			[
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'finalize' ],
					'permission_callback' => $require_use,
					'args'                => [
						'key'         => [ 'type' => 'string', 'required' => true ],
						'mime_type'   => [ 'type' => 'string', 'required' => true ],
						'size_bytes'  => [ 'type' => 'integer', 'required' => true, 'minimum' => 1 ],
						'hash_sha256' => [ 'type' => 'string', 'required' => true ],
						'width'       => [ 'type' => 'integer' ],
						'height'      => [ 'type' => 'integer' ],
					],
				],
			]
		);
	}

	/**
	 * `POST /upload/init`.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function init( \WP_REST_Request $request ) {
		$user_id = get_current_user_id();

		try {
			$this->rate_limiter->check( self::RL_ACTION, $user_id, 10, MINUTE_IN_SECONDS );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$filename   = sanitize_file_name( (string) $request->get_param( 'filename' ) );
		$mime_type  = sanitize_text_field( (string) $request->get_param( 'mime_type' ) );
		$size_bytes = (int) $request->get_param( 'size_bytes' );
		$hash       = (string) $request->get_param( 'hash_sha256' );

		if ( ! $this->is_allowed_mime( $mime_type ) ) {
			return new \WP_Error(
				'imgsig_unsupported_mime',
				__( 'Unsupported file type.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}

		if ( $size_bytes > $this->max_size() ) {
			return new \WP_Error(
				'imgsig_too_large',
				__( 'File size exceeds the configured limit.', 'imagina-signatures' ),
				[ 'status' => 400, 'max_size' => $this->max_size() ]
			);
		}

		// Dedup: if the same user already has an asset with this hash,
		// short-circuit. The browser can use the existing public_url
		// without re-uploading.
		if ( '' !== $hash ) {
			$existing = $this->assets->find_by_hash( $user_id, $hash );
			if ( null !== $existing ) {
				return rest_ensure_response(
					[
						'method' => 'duplicate',
						'asset'  => $existing->to_array(),
					]
				);
			}
		}

		try {
			$driver = $this->storage->active_driver();
		} catch ( StorageException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		if ( $driver->supports_presigned_uploads() ) {
			$key = $this->build_key( $user_id, $filename );
			try {
				$presigned = $driver->get_presigned_upload_url(
					$key,
					$mime_type,
					$this->max_size(),
					self::PRESIGN_TTL_SECONDS
				);
			} catch ( StorageException $e ) {
				return $this->exception_to_wp_error( $e );
			}

			return rest_ensure_response(
				array_merge(
					[ 'method' => 'presigned' ],
					$presigned->to_array()
				)
			);
		}

		// Direct (Media Library) — point the browser back at this controller.
		return rest_ensure_response(
			[
				'method' => 'direct',
				'url'    => rest_url( self::NAMESPACE . '/upload/direct' ),
			]
		);
	}

	/**
	 * `POST /upload/direct` — multipart receiver for the Media Library
	 * driver.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function direct( \WP_REST_Request $request ) {
		$user_id = get_current_user_id();

		try {
			$this->rate_limiter->check( self::RL_ACTION, $user_id, 10, MINUTE_IN_SECONDS );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$files = $request->get_file_params();
		$file  = $files['file'] ?? null;

		if ( ! is_array( $file ) || empty( $file['tmp_name'] ) || ! file_exists( $file['tmp_name'] ) ) {
			return new \WP_Error(
				'imgsig_missing_file',
				__( 'No file received.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}

		$mime_type  = $this->detect_mime_type( $file );
		$size_bytes = isset( $file['size'] ) ? (int) $file['size'] : 0;

		if ( ! $this->is_allowed_mime( $mime_type ) ) {
			return new \WP_Error(
				'imgsig_unsupported_mime',
				__( 'Unsupported file type.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}

		if ( $size_bytes <= 0 || $size_bytes > $this->max_size() ) {
			return new \WP_Error(
				'imgsig_bad_size',
				__( 'File size out of range.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}

		try {
			$driver       = $this->storage->active_driver();
			$upload_result = $driver->upload(
				(string) $file['tmp_name'],
				isset( $file['name'] ) ? (string) $file['name'] : 'upload',
				[
					'user_id'   => $user_id,
					'mime_type' => $mime_type,
				]
			);
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$asset = $this->assets->insert(
			[
				'user_id'        => $user_id,
				'storage_driver' => $upload_result->driver,
				'storage_key'    => $upload_result->storage_key,
				'public_url'     => $upload_result->public_url,
				'mime_type'      => $upload_result->mime_type,
				'size_bytes'     => $upload_result->size_bytes,
				'width'          => $upload_result->width,
				'height'         => $upload_result->height,
				'hash_sha256'    => $upload_result->hash_sha256,
			]
		);

		do_action( 'imgsig/asset/uploaded', $asset );

		$response = rest_ensure_response( $asset->to_array() );
		$response->set_status( 201 );
		return $response;
	}

	/**
	 * `POST /upload/finalize` — registers the asset row after a
	 * browser-direct PUT to S3.
	 *
	 * The server trusts the metadata sent by the browser (mime, size,
	 * hash, dimensions) since it never saw the bytes; the storage
	 * backend is the source of truth. A future hardening pass can
	 * add a HEAD probe here to verify the object actually exists at
	 * the reported key.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function finalize( \WP_REST_Request $request ) {
		$user_id = get_current_user_id();

		$key        = (string) $request->get_param( 'key' );
		$mime_type  = sanitize_text_field( (string) $request->get_param( 'mime_type' ) );
		$size_bytes = (int) $request->get_param( 'size_bytes' );
		$hash       = (string) $request->get_param( 'hash_sha256' );
		$width      = $request->get_param( 'width' );
		$height     = $request->get_param( 'height' );

		if ( ! $this->is_allowed_mime( $mime_type ) ) {
			return new \WP_Error(
				'imgsig_unsupported_mime',
				__( 'Unsupported file type.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}

		// Confirm the key actually belongs to this user — keys minted
		// by `init()` are prefixed with `users/{user_id}/`, so reject
		// anything that doesn't match.
		if ( ! $this->key_belongs_to( $key, $user_id ) ) {
			return new \WP_Error(
				'imgsig_forbidden',
				__( 'The provided storage key does not belong to your account.', 'imagina-signatures' ),
				[ 'status' => 403 ]
			);
		}

		try {
			$driver = $this->storage->active_driver();
		} catch ( StorageException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$asset = $this->assets->insert(
			[
				'user_id'        => $user_id,
				'storage_driver' => $driver->get_id(),
				'storage_key'    => $key,
				'public_url'     => $driver->get_public_url( $key ),
				'mime_type'      => $mime_type,
				'size_bytes'     => $size_bytes,
				'width'          => null !== $width ? (int) $width : null,
				'height'         => null !== $height ? (int) $height : null,
				'hash_sha256'    => $hash,
			]
		);

		do_action( 'imgsig/asset/uploaded', $asset );

		$response = rest_ensure_response( $asset->to_array() );
		$response->set_status( 201 );
		return $response;
	}

	/**
	 * Returns true when the mime type is allowed.
	 *
	 * @since 1.0.0
	 *
	 * @param string $mime_type IANA mime type.
	 *
	 * @return bool
	 */
	private function is_allowed_mime( string $mime_type ): bool {
		return in_array( strtolower( $mime_type ), self::ALLOWED_MIME_TYPES, true );
	}

	/**
	 * Returns the maximum upload size in bytes (filterable).
	 *
	 * Default 5 MB.
	 *
	 * @since 1.0.0
	 *
	 * @return int
	 */
	private function max_size(): int {
		/**
		 * Filters the maximum upload size in bytes.
		 *
		 * @since 1.0.0
		 *
		 * @param int $max_size Default 5 MB.
		 */
		return (int) apply_filters( 'imgsig/upload/max_size', 5 * MB_IN_BYTES );
	}

	/**
	 * Best-effort mime sniffing for a multipart file array.
	 *
	 * Trusts wp_check_filetype_and_ext to resolve the real type from
	 * the filename and contents — `$_FILES['type']` is browser-supplied
	 * and untrustworthy.
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, mixed> $file `$_FILES`-style entry.
	 *
	 * @return string
	 */
	private function detect_mime_type( array $file ): string {
		require_once ABSPATH . 'wp-admin/includes/file.php';
		$check = wp_check_filetype_and_ext(
			(string) ( $file['tmp_name'] ?? '' ),
			(string) ( $file['name'] ?? '' )
		);
		return is_array( $check ) && ! empty( $check['type'] ) ? (string) $check['type'] : '';
	}

	/**
	 * Builds the storage key for a fresh upload.
	 *
	 * Format: `users/{user_id}/{microsecond_timestamp}-{sanitized_name}`.
	 *
	 * @since 1.0.0
	 *
	 * @param int    $user_id  Owner.
	 * @param string $filename Sanitised filename.
	 *
	 * @return string
	 */
	private function build_key( int $user_id, string $filename ): string {
		// microtime gives us collision-free keys without a DB round-trip.
		$prefix = (string) (int) ( microtime( true ) * 1000 );
		return sprintf( 'users/%d/%s-%s', $user_id, $prefix, $filename );
	}

	/**
	 * Returns true when a storage key was minted for the given user.
	 *
	 * Defends against a caller passing another user's key during
	 * `finalize()`.
	 *
	 * @since 1.0.0
	 *
	 * @param string $key     Storage key.
	 * @param int    $user_id User ID.
	 *
	 * @return bool
	 */
	private function key_belongs_to( string $key, int $user_id ): bool {
		return 0 === strpos( $key, 'users/' . $user_id . '/' );
	}
}
