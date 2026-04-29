<?php
/**
 * DTO describing a presigned upload URL.
 *
 * @package ImaginaSignatures\Storage\Dto
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage\Dto;

defined( 'ABSPATH' ) || exit;

/**
 * Result of `StorageDriverInterface::get_presigned_upload_url()`.
 *
 * Sent to the editor so it can `PUT` (or `POST`) the file straight to the
 * storage backend, bypassing PHP entirely. Includes the URL, the HTTP
 * method, the headers the backend will require, and the eventual public
 * URL once the upload finalises.
 *
 * Public, immutable, value-object semantics — same rationale as
 * {@see UploadResult}.
 *
 * @since 1.0.0
 */
final class PresignedResult {

	/**
	 * Pre-signed URL the browser should call.
	 *
	 * @var string
	 */
	public string $url;

	/**
	 * HTTP method to use against the URL (`PUT` for direct uploads).
	 *
	 * @var string
	 */
	public string $method;

	/**
	 * Headers the browser must send with the upload request.
	 *
	 * Keys are header names; values are header values.
	 *
	 * @var array<string, string>
	 */
	public array $headers;

	/**
	 * Final storage key for the uploaded object.
	 *
	 * @var string
	 */
	public string $key;

	/**
	 * Unix timestamp (UTC) at which the URL stops being valid.
	 *
	 * @var int
	 */
	public int $expires_at;

	/**
	 * Maximum number of bytes the browser is allowed to upload.
	 *
	 * Enforced by the backend via signature scope on providers that
	 * support it; otherwise a soft limit the editor honours client-side.
	 *
	 * @var int
	 */
	public int $max_size;

	/**
	 * Public URL the asset will be reachable at after the upload completes.
	 *
	 * @var string
	 */
	public string $public_url;

	/**
	 * @param string                $url        Presigned URL.
	 * @param string                $method     HTTP method (`PUT`/`POST`).
	 * @param array<string, string> $headers    Headers required by the backend.
	 * @param string                $key        Final storage key.
	 * @param int                   $expires_at Unix timestamp.
	 * @param int                   $max_size   Maximum allowed bytes.
	 * @param string                $public_url Final public URL.
	 */
	public function __construct(
		string $url,
		string $method,
		array $headers,
		string $key,
		int $expires_at,
		int $max_size,
		string $public_url
	) {
		$this->url        = $url;
		$this->method     = $method;
		$this->headers    = $headers;
		$this->key        = $key;
		$this->expires_at = $expires_at;
		$this->max_size   = $max_size;
		$this->public_url = $public_url;
	}

	/**
	 * @since 1.0.0
	 *
	 * @return array<string, mixed>
	 */
	public function to_array(): array {
		return [
			'url'        => $this->url,
			'method'     => $this->method,
			'headers'    => $this->headers,
			'key'        => $this->key,
			'expires_at' => $this->expires_at,
			'max_size'   => $this->max_size,
			'public_url' => $this->public_url,
		];
	}
}
