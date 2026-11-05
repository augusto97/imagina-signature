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
use ImaginaSignatures\Storage\Contracts\ObjectInspectorInterface;
use ImaginaSignatures\Storage\Contracts\StorageDriverInterface;
use ImaginaSignatures\Storage\Drivers\UrlOnlyDriver;
use ImaginaSignatures\Storage\PendingUploads;
use ImaginaSignatures\Storage\StorageManager;
use ImaginaSignatures\Storage\UploadPolicy;

defined( 'ABSPATH' ) || exit;

/**
 * Three-step upload flow (CLAUDE.md §17.5):
 *
 *  1. `POST /upload/init` — the editor describes the file it wants to
 *     upload (filename / mime / size). The server validates type, size
 *     and the user's storage quota, then picks the path:
 *       - presigned → returns a URL the browser PUTs directly to S3.
 *         The URL is signed for exactly the authorised Content-Type and
 *         the authorised (mime, size, owner) is remembered server-side
 *         ({@see PendingUploads}).
 *       - direct    → returns this controller's `/upload/direct` URL
 *                     and the browser POSTs multipart to PHP.
 *  2. For S3 only: browser PUTs to the presigned URL (sending the
 *     returned `headers`), then calls `POST /upload/finalize`. The
 *     server HEADs the object and only registers it when its real
 *     Content-Type and Content-Length match what init authorised;
 *     otherwise the object is deleted.
 *  3. For Media Library: `/upload/direct` sniffs the real type from the
 *     bytes, enforces size + quota, and stores through the driver.
 *
 * Accepted: PNG / JPEG / WebP / GIF (≤ `imgsig/upload/max_size`, 5 MB)
 * and vCards (`text/vcard`, `.vcf`, ≤ 64 KB, must start with
 * `BEGIN:VCARD`). See {@see UploadPolicy}.
 *
 * All three endpoints are gated by `imgsig_use_signatures` and share a
 * 10/min per-user rate limit. Request / response JSON shapes are
 * unchanged from 1.0.0.
 *
 * @since 1.0.0
 */
final class UploadController extends BaseController {

	/**
	 * Rate-limit action name.
	 */
	private const RL_ACTION = 'upload';

	/**
	 * Uploads allowed per user per minute (init + direct + finalize).
	 */
	private const RL_MAX = 10;

	/**
	 * Default presigned-URL TTL.
	 */
	private const PRESIGN_TTL_SECONDS = 300;

	/**
	 * Largest width / height accepted from a client report.
	 */
	private const MAX_DIMENSION = 20000;

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
	 * @var PendingUploads
	 */
	private PendingUploads $pending;

	/**
	 * @param StorageManager      $storage      Storage manager.
	 * @param AssetRepository     $assets       Asset repository.
	 * @param RateLimiter         $rate_limiter Rate limiter.
	 * @param PendingUploads|null $pending      Presigned-upload records (defaults to a fresh store).
	 */
	public function __construct( StorageManager $storage, AssetRepository $assets, RateLimiter $rate_limiter, ?PendingUploads $pending = null ) {
		$this->storage      = $storage;
		$this->assets       = $assets;
		$this->rate_limiter = $rate_limiter;
		$this->pending      = $pending ?? new PendingUploads();
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
						'filename'    => [
							'type'     => 'string',
							'required' => true,
						],
						'mime_type'   => [
							'type'     => 'string',
							'required' => true,
						],
						'size_bytes'  => [
							'type'     => 'integer',
							'required' => true,
							'minimum'  => 1,
						],
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
						'key'         => [
							'type'     => 'string',
							'required' => true,
						],
						'mime_type'   => [
							'type'     => 'string',
							'required' => true,
						],
						'size_bytes'  => [
							'type'     => 'integer',
							'required' => true,
							'minimum'  => 1,
						],
						'hash_sha256' => [
							'type'     => 'string',
							'required' => true,
						],
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

		// URL-only mode short-circuit (before burning a rate-limit slot).
		if ( UrlOnlyDriver::ID === $this->storage->active_driver_id() ) {
			return new \WP_Error(
				'imgsig_uploads_disabled',
				__( 'Uploads are disabled on this site (URL-only mode). Paste an external image URL instead.', 'imagina-signatures' ),
				[ 'status' => 403 ]
			);
		}

		try {
			$this->rate_limiter->check( self::RL_ACTION, $user_id, self::RL_MAX, MINUTE_IN_SECONDS );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$mime_type  = UploadPolicy::canonical_mime( sanitize_text_field( (string) $request->get_param( 'mime_type' ) ) );
		$size_bytes = (int) $request->get_param( 'size_bytes' );
		$hash       = UploadPolicy::normalise_hash( (string) $request->get_param( 'hash_sha256' ) );

		if ( '' === $mime_type ) {
			return $this->unsupported_type_error();
		}

		$size_error = $this->size_error( $mime_type, $size_bytes );
		if ( null !== $size_error ) {
			return $size_error;
		}

		// Dedup: same user, same content → reuse the existing asset.
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

		$quota_error = $this->quota_error( $user_id, $size_bytes );
		if ( null !== $quota_error ) {
			return $quota_error;
		}

		try {
			$driver = $this->storage->active_driver();
		} catch ( StorageException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		if ( $driver->supports_presigned_uploads() ) {
			$key = UploadPolicy::new_object_key( $user_id, $mime_type );
			try {
				$presigned = $driver->get_presigned_upload_url(
					$key,
					$mime_type,
					UploadPolicy::max_size_for( $mime_type ),
					self::PRESIGN_TTL_SECONDS
				);
			} catch ( StorageException $e ) {
				return $this->exception_to_wp_error( $e );
			}

			$this->pending->remember( $key, $user_id, $mime_type, $size_bytes, self::PRESIGN_TTL_SECONDS );

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
	 * `POST /upload/direct` — multipart receiver for server-side storage.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function direct( \WP_REST_Request $request ) {
		$user_id = get_current_user_id();

		if ( UrlOnlyDriver::ID === $this->storage->active_driver_id() ) {
			return new \WP_Error(
				'imgsig_uploads_disabled',
				__( 'Uploads are disabled on this site (URL-only mode).', 'imagina-signatures' ),
				[ 'status' => 403 ]
			);
		}

		try {
			$this->rate_limiter->check( self::RL_ACTION, $user_id, self::RL_MAX, MINUTE_IN_SECONDS );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$files = $request->get_file_params();
		$file  = $files['file'] ?? null;

		if ( ! is_array( $file ) || empty( $file['tmp_name'] ) || ! file_exists( (string) $file['tmp_name'] ) ) {
			return new \WP_Error(
				'imgsig_missing_file',
				__( 'No file received.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}

		$size_bytes = (int) filesize( (string) $file['tmp_name'] );
		$mime_type  = $this->detect_mime_type( $file );

		if ( '' === $mime_type ) {
			return $this->unsupported_type_error();
		}

		if ( $size_bytes <= 0 || $size_bytes > UploadPolicy::max_size_for( $mime_type ) ) {
			return new \WP_Error(
				'imgsig_bad_size',
				__( 'File size out of range.', 'imagina-signatures' ),
				[
					'status'   => 400,
					'max_size' => UploadPolicy::max_size_for( $mime_type ),
				]
			);
		}

		$quota_error = $this->quota_error( $user_id, $size_bytes );
		if ( null !== $quota_error ) {
			return $quota_error;
		}

		try {
			$driver = $this->storage->active_driver();

			// Media Library treats the key as a filename hint (it names
			// files after their content hash); object stores get a fresh
			// `u/{token}/{random}.{ext}` key — never the client filename.
			$destination = $driver->supports_presigned_uploads()
				? UploadPolicy::new_object_key( $user_id, $mime_type )
				: UploadPolicy::hashed_filename( (string) hash_file( 'sha256', (string) $file['tmp_name'] ), $mime_type );

			$upload_result = $driver->upload(
				(string) $file['tmp_name'],
				$destination,
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
	 * Nothing the browser reports is trusted on its own: the key must be
	 * one `/upload/init` minted for this user (server-side record), and
	 * the stored object's real Content-Type / Content-Length (HEAD) must
	 * match what init authorised and fit the size cap and quota. On any
	 * mismatch the object is deleted and the call fails with 422.
	 * vCards additionally have their first bytes checked for
	 * `BEGIN:VCARD`. The row is written with the server-verified type
	 * and size.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function finalize( \WP_REST_Request $request ) {
		$user_id = get_current_user_id();

		if ( UrlOnlyDriver::ID === $this->storage->active_driver_id() ) {
			return new \WP_Error(
				'imgsig_uploads_disabled',
				__( 'Uploads are disabled on this site (URL-only mode).', 'imagina-signatures' ),
				[ 'status' => 403 ]
			);
		}

		try {
			$this->rate_limiter->check( self::RL_ACTION, $user_id, self::RL_MAX, MINUTE_IN_SECONDS );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$key        = (string) $request->get_param( 'key' );
		$mime_type  = UploadPolicy::canonical_mime( sanitize_text_field( (string) $request->get_param( 'mime_type' ) ) );
		$size_bytes = (int) $request->get_param( 'size_bytes' );
		$hash       = UploadPolicy::normalise_hash( (string) $request->get_param( 'hash_sha256' ) );

		if ( '' === $mime_type ) {
			return $this->unsupported_type_error();
		}

		if ( $size_bytes <= 0 || $size_bytes > UploadPolicy::max_size_for( $mime_type ) ) {
			return new \WP_Error(
				'imgsig_invalid_size',
				__( 'Reported file size is missing or exceeds the configured limit.', 'imagina-signatures' ),
				[
					'status'   => 400,
					'max_size' => UploadPolicy::max_size_for( $mime_type ),
				]
			);
		}

		// Strict key alphabet (no `..`, no leading slash) + owner prefix.
		if ( ! UploadPolicy::key_belongs_to( $key, $user_id ) ) {
			return new \WP_Error(
				'imgsig_forbidden',
				__( 'The provided storage key does not belong to your account.', 'imagina-signatures' ),
				[ 'status' => 403 ]
			);
		}

		$pending = $this->pending->get( $key );
		if ( null === $pending || $pending['user_id'] !== $user_id ) {
			return new \WP_Error(
				'imgsig_upload_unknown',
				__( 'This upload was not started from this account or has expired. Please upload the file again.', 'imagina-signatures' ),
				[ 'status' => 422 ]
			);
		}

		try {
			$driver = $this->storage->active_driver();
		} catch ( StorageException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		if ( ! $driver instanceof ObjectInspectorInterface ) {
			// Third-party presigning driver without inspection support:
			// keep the legacy existence probe.
			if ( ! $driver->verify_object_exists( $key ) ) {
				return $this->upload_not_found_error();
			}
			$verified_mime = $pending['mime_type'];
			$verified_size = $pending['size_bytes'];
		} else {
			$object = $driver->describe_object( $key );
			if ( null === $object ) {
				return $this->upload_not_found_error();
			}

			$verified_mime = UploadPolicy::canonical_mime( $object['content_type'] );
			$verified_size = (int) $object['content_length'];

			$mismatch = $verified_mime !== $pending['mime_type']
				|| $verified_size !== $pending['size_bytes']
				|| $mime_type !== $pending['mime_type']
				|| $size_bytes !== $pending['size_bytes'];

			if ( $mismatch ) {
				return $this->reject_object( $driver, $key, 'imgsig_upload_mismatch', __( 'The uploaded file does not match what was declared when the upload started.', 'imagina-signatures' ) );
			}

			if ( UploadPolicy::is_vcard( $verified_mime ) ) {
				$head = $driver->read_object_prefix( $key, 64 );
				if ( null === $head || ! UploadPolicy::looks_like_vcard( $head ) ) {
					return $this->reject_object( $driver, $key, 'imgsig_upload_mismatch', __( 'The uploaded file is not a valid vCard.', 'imagina-signatures' ) );
				}
			}
		}

		if ( $verified_size <= 0 || $verified_size > UploadPolicy::max_size_for( $verified_mime ) ) {
			return $this->reject_object( $driver, $key, 'imgsig_invalid_size', __( 'The uploaded file exceeds the configured size limit.', 'imagina-signatures' ) );
		}

		if ( UploadPolicy::exceeds_quota( $user_id, $this->assets->sum_size_by_user( $user_id ), $verified_size ) ) {
			$this->delete_quietly( $driver, $key );
			$this->pending->forget( $key );
			return $this->quota_exceeded_error( $user_id );
		}

		$is_image = UploadPolicy::is_image( $verified_mime );

		$asset = $this->assets->insert(
			[
				'user_id'        => $user_id,
				'storage_driver' => $driver->get_id(),
				'storage_key'    => $key,
				'public_url'     => $driver->get_public_url( $key ),
				'mime_type'      => $verified_mime,
				'size_bytes'     => $verified_size,
				'width'          => $is_image ? $this->dimension( $request->get_param( 'width' ) ) : null,
				'height'         => $is_image ? $this->dimension( $request->get_param( 'height' ) ) : null,
				'hash_sha256'    => $hash,
			]
		);

		$this->pending->forget( $key );

		do_action( 'imgsig/asset/uploaded', $asset );

		$response = rest_ensure_response( $asset->to_array() );
		$response->set_status( 201 );
		return $response;
	}

	/**
	 * Resolves the real type of a multipart upload from its bytes.
	 *
	 * A vCard is recognised by extension / declared type AND must start
	 * with `BEGIN:VCARD`; images go through wp_check_filetype_and_ext()
	 * (which sniffs the image header). The browser-supplied
	 * `$_FILES['type']` is never trusted on its own.
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, mixed> $file `$_FILES`-style entry.
	 *
	 * @return string Canonical accepted type, or '' when unsupported.
	 */
	private function detect_mime_type( array $file ): string {
		$tmp_name  = (string) ( $file['tmp_name'] ?? '' );
		$name      = (string) ( $file['name'] ?? '' );
		$extension = strtolower( pathinfo( $name, PATHINFO_EXTENSION ) );
		$declared  = (string) ( $file['type'] ?? '' );

		if ( 'vcf' === $extension || 'vcard' === $extension || UploadPolicy::is_vcard( $declared ) ) {
			$head = (string) file_get_contents( $tmp_name, false, null, 0, 64 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local upload temp file.
			return UploadPolicy::looks_like_vcard( $head ) ? UploadPolicy::VCARD_MIME : '';
		}

		require_once ABSPATH . 'wp-admin/includes/file.php';
		$check = wp_check_filetype_and_ext( $tmp_name, $name );
		$type  = is_array( $check ) && ! empty( $check['type'] ) ? (string) $check['type'] : '';

		return UploadPolicy::is_image( $type ) ? UploadPolicy::canonical_mime( $type ) : '';
	}

	/**
	 * Size validation for init.
	 *
	 * @param string $mime_type  Canonical type.
	 * @param int    $size_bytes Declared size.
	 *
	 * @return \WP_Error|null
	 */
	private function size_error( string $mime_type, int $size_bytes ): ?\WP_Error {
		$max = UploadPolicy::max_size_for( $mime_type );
		if ( $size_bytes > 0 && $size_bytes <= $max ) {
			return null;
		}

		return new \WP_Error(
			'imgsig_too_large',
			__( 'File size exceeds the configured limit.', 'imagina-signatures' ),
			[
				'status'   => 400,
				'max_size' => $max,
			]
		);
	}

	/**
	 * Quota validation.
	 *
	 * @param int $user_id    User.
	 * @param int $size_bytes Incoming bytes.
	 *
	 * @return \WP_Error|null
	 */
	private function quota_error( int $user_id, int $size_bytes ): ?\WP_Error {
		if ( ! UploadPolicy::exceeds_quota( $user_id, $this->assets->sum_size_by_user( $user_id ), $size_bytes ) ) {
			return null;
		}
		return $this->quota_exceeded_error( $user_id );
	}

	/**
	 * Builds the quota-exceeded error.
	 *
	 * @param int $user_id User.
	 *
	 * @return \WP_Error
	 */
	private function quota_exceeded_error( int $user_id ): \WP_Error {
		$quota = UploadPolicy::user_quota_bytes( $user_id );

		return new \WP_Error(
			'imgsig_quota_exceeded',
			sprintf(
				/* translators: %s: storage quota, e.g. "100 MB". */
				__( 'You have reached your storage limit (%s). Delete unused images to free up space.', 'imagina-signatures' ),
				size_format( $quota )
			),
			[
				'status' => 413,
				'quota'  => $quota,
			]
		);
	}

	/**
	 * Unsupported-type error.
	 *
	 * @return \WP_Error
	 */
	private function unsupported_type_error(): \WP_Error {
		return new \WP_Error(
			'imgsig_unsupported_mime',
			__( 'Unsupported file type.', 'imagina-signatures' ),
			[ 'status' => 400 ]
		);
	}

	/**
	 * Object-missing error for finalize.
	 *
	 * @return \WP_Error
	 */
	private function upload_not_found_error(): \WP_Error {
		return new \WP_Error(
			'imgsig_upload_not_found',
			__( 'No object exists at the reported storage key. Was the upload completed?', 'imagina-signatures' ),
			[ 'status' => 422 ]
		);
	}

	/**
	 * Deletes a rejected object, forgets its pending record, and builds
	 * the 422 error.
	 *
	 * @param StorageDriverInterface $driver  Active driver.
	 * @param string                 $key     Object key.
	 * @param string                 $code    Error code.
	 * @param string                 $message Error message.
	 *
	 * @return \WP_Error
	 */
	private function reject_object( StorageDriverInterface $driver, string $key, string $code, string $message ): \WP_Error {
		$this->delete_quietly( $driver, $key );
		$this->pending->forget( $key );

		return new \WP_Error( $code, $message, [ 'status' => 422 ] );
	}

	/**
	 * Best-effort object delete.
	 *
	 * @param StorageDriverInterface $driver Active driver.
	 * @param string                 $key    Object key.
	 *
	 * @return void
	 */
	private function delete_quietly( StorageDriverInterface $driver, string $key ): void {
		try {
			$driver->delete( $key );
		} catch ( \Throwable $e ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( '[imagina-signatures] could not delete rejected upload: ' . $e->getMessage() );
		}
	}

	/**
	 * Normalises a client-reported image dimension.
	 *
	 * @param mixed $value Raw value.
	 *
	 * @return int|null
	 */
	private function dimension( $value ): ?int {
		if ( null === $value || '' === $value ) {
			return null;
		}
		$int = (int) $value;
		return $int > 0 && $int <= self::MAX_DIMENSION ? $int : null;
	}
}
