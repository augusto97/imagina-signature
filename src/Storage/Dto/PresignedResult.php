<?php
/**
 * Result returned by drivers that issue presigned URLs.
 *
 * @package ImaginaSignatures\Storage\Dto
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage\Dto;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Immutable DTO describing a presigned upload URL.
 *
 * @since 1.0.0
 */
final class PresignedResult {

	public string $upload_url;
	public string $public_url;
	public string $storage_key;
	public string $method;
	/** @var array<string, string> */
	public array $headers;
	public int $expires_at;

	/**
	 * @param string                $upload_url  URL to PUT/POST the file to.
	 * @param string                $public_url  Resulting public URL.
	 * @param string                $storage_key Object key.
	 * @param string                $method      HTTP method ('PUT' typically).
	 * @param array<string, string> $headers     Headers the client must include.
	 * @param int                   $expires_at  UNIX timestamp when the URL expires.
	 */
	public function __construct(
		string $upload_url,
		string $public_url,
		string $storage_key,
		string $method,
		array $headers,
		int $expires_at
	) {
		$this->upload_url  = $upload_url;
		$this->public_url  = $public_url;
		$this->storage_key = $storage_key;
		$this->method      = $method;
		$this->headers     = $headers;
		$this->expires_at  = $expires_at;
	}

	/**
	 * Serializes to a frontend-friendly payload.
	 *
	 * @return array<string, mixed>
	 */
	public function to_array(): array {
		return [
			'upload_url'  => $this->upload_url,
			'public_url'  => $this->public_url,
			'storage_key' => $this->storage_key,
			'method'      => $this->method,
			'headers'     => $this->headers,
			'expires_at'  => $this->expires_at,
		];
	}
}
