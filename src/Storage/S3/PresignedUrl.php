<?php
/**
 * Presigned URL builder for S3-compatible PUT uploads.
 *
 * @package ImaginaSignatures\Storage\S3
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage\S3;

defined( 'ABSPATH' ) || exit;

/**
 * Builds presigned URLs the editor can `PUT` to directly from the browser.
 *
 * Thin facade over {@see SigV4Signer::presign_url()} that knows how to
 * compose the final S3-compatible URL (path-style: `endpoint/bucket/key`)
 * and which extra query parameters to fold into the signature.
 *
 * Path-style is used for compatibility — every supported provider
 * (R2, Bunny, S3, B2, Spaces, Wasabi, MinIO) accepts it; virtual-hosted
 * style is provider-specific.
 *
 * @since 1.0.0
 */
final class PresignedUrl {

	/**
	 * Default validity for a presigned URL.
	 *
	 * Matches the upload-init flow: the editor receives a URL and starts
	 * the PUT immediately, so a few minutes is plenty.
	 */
	public const DEFAULT_EXPIRES_SECONDS = 300;

	/**
	 * Underlying signer.
	 *
	 * @var SigV4Signer
	 */
	private SigV4Signer $signer;

	/**
	 * Endpoint URL, with no trailing slash (e.g. `https://s3.us-east-1.amazonaws.com`).
	 *
	 * @var string
	 */
	private string $endpoint;

	/**
	 * Bucket name.
	 *
	 * @var string
	 */
	private string $bucket;

	/**
	 * @param SigV4Signer $signer   Configured SigV4 signer.
	 * @param string      $endpoint Endpoint URL (with scheme, no trailing slash).
	 * @param string      $bucket   Bucket name.
	 */
	public function __construct( SigV4Signer $signer, string $endpoint, string $bucket ) {
		$this->signer   = $signer;
		$this->endpoint = rtrim( $endpoint, '/' );
		$this->bucket   = $bucket;
	}

	/**
	 * Returns a presigned URL for a `PUT` upload.
	 *
	 * `content-type` is a SIGNED header: the storage provider rejects
	 * the PUT unless the browser sends exactly `Content-Type:
	 * {$content_type}`, so a URL minted for `image/png` can't be used to
	 * store `text/html`. (Size can't be bound by a presigned PUT; the
	 * finalize step HEADs the object and enforces it.) Extra
	 * Content-Disposition or cache headers MUST be added to
	 * `$extra_query` so they participate in the signature.
	 *
	 * @since 1.0.0
	 *
	 * @param string                $key             Object key (e.g. `users/42/avatar.png`).
	 * @param string                $content_type    Content-Type the browser will send.
	 * @param int                   $expires_seconds Validity window.
	 * @param array<string, string> $extra_query     Extra signed query parameters.
	 *
	 * @return string Presigned URL.
	 */
	public function for_put(
		string $key,
		string $content_type,
		int $expires_seconds = self::DEFAULT_EXPIRES_SECONDS,
		array $extra_query = []
	): string {
		$extra_query['x-amz-acl'] = $extra_query['x-amz-acl'] ?? 'private';

		$signed_headers = '' !== $content_type ? [ 'content-type' => $content_type ] : [];

		$url = $this->build_object_url( $key );

		return $this->signer->presign_url( 'PUT', $url, $expires_seconds, $extra_query, null, $signed_headers );
	}

	/**
	 * Returns the eventual public URL once the upload finalises.
	 *
	 * @since 1.0.0
	 *
	 * @param string $key Object key.
	 *
	 * @return string
	 */
	public function public_url_for( string $key ): string {
		return $this->build_object_url( $key );
	}

	/**
	 * Builds a path-style object URL (no query string, no signature).
	 *
	 * @since 1.0.0
	 *
	 * @param string $key Object key.
	 *
	 * @return string
	 */
	private function build_object_url( string $key ): string {
		// Path-style: /{bucket}/{key}
		// rawurlencode each path segment separately so `/` inside the key
		// is preserved as a delimiter.
		$encoded_key = implode(
			'/',
			array_map(
				static function ( string $segment ): string {
					return rawurlencode( rawurldecode( $segment ) );
				},
				explode( '/', ltrim( $key, '/' ) )
			)
		);

		return sprintf(
			'%s/%s/%s',
			$this->endpoint,
			rawurlencode( $this->bucket ),
			$encoded_key
		);
	}
}
