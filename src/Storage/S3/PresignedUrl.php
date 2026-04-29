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
	 * Browsers are expected to use the URL with a single `Content-Type`
	 * header matching `$content_type` and the binary body. Extra
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

		// Some providers (R2, MinIO) require Content-Type to participate in
		// the signature even for unsigned-payload PUTs. Folding it into the
		// query string instead of headers keeps the browser request simpler.
		if ( '' !== $content_type && ! isset( $extra_query['Content-Type'] ) ) {
			// Note: for browser PUTs the Content-Type header is what matters;
			// keeping it out of extra_query avoids it being doubly enforced.
			unset( $extra_query['Content-Type'] );
		}

		$url = $this->build_object_url( $key );

		return $this->signer->presign_url( 'PUT', $url, $expires_seconds, $extra_query );
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
