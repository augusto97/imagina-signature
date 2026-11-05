<?php
/**
 * Upload policy: allowed types, sizes, quotas and storage paths.
 *
 * @package ImaginaSignatures\Storage
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage;

defined( 'ABSPATH' ) || exit;

/**
 * Single source of truth for what the plugin accepts as an upload and
 * where it lands — shared by the REST upload flow and the storage
 * drivers so `/upload/init`, `/upload/direct` and `/upload/finalize`
 * can never disagree.
 *
 *  - Types: PNG, JPEG, WebP, GIF images (SVG deliberately excluded,
 *    CLAUDE.md §19.4) and vCards (`text/vcard`, alias `text/x-vcard`,
 *    extension `.vcf`).
 *  - Sizes: images up to `imgsig/upload/max_size` (5 MB); vCards up to
 *    64 KB.
 *  - Quota: per-user total of stored bytes, default 100 MB
 *    (`imgsig/storage/user_quota_bytes`).
 *  - Paths never expose the WordPress user id or the original
 *    filename: each user gets a random directory token (user meta
 *    `imgsig_upload_token`) and files get random / content-hash names.
 *
 * @since 1.0.40
 */
final class UploadPolicy {

	/**
	 * Raster image types accepted for upload.
	 *
	 * @var string[]
	 */
	public const IMAGE_MIMES = [ 'image/png', 'image/jpeg', 'image/webp', 'image/gif' ];

	/**
	 * Canonical vCard type.
	 */
	public const VCARD_MIME = 'text/vcard';

	/**
	 * Accepted vCard type aliases (canonicalised to {@see VCARD_MIME}).
	 *
	 * @var string[]
	 */
	public const VCARD_ALIASES = [ 'text/vcard', 'text/x-vcard', 'text/directory' ];

	/**
	 * Maximum vCard size in bytes.
	 */
	public const VCARD_MAX_BYTES = 65536;

	/**
	 * Default per-user storage quota (bytes).
	 */
	public const DEFAULT_USER_QUOTA = 104857600;

	/**
	 * User meta key holding the per-user random directory token.
	 */
	public const TOKEN_META_KEY = 'imgsig_upload_token';

	/**
	 * Strict storage-key alphabet: no `..`, no leading slash, no `//`.
	 */
	private const KEY_PATTERN = '#^(?!/)(?!.*\.\.)(?!.*//)[A-Za-z0-9._/\-]{1,512}$#';

	/**
	 * Extension for each accepted type.
	 *
	 * @var array<string, string>
	 */
	private const EXTENSIONS = [
		'image/png'  => 'png',
		'image/jpeg' => 'jpg',
		'image/webp' => 'webp',
		'image/gif'  => 'gif',
		'text/vcard' => 'vcf',
	];

	/**
	 * Normalises a declared mime type: lower-case, parameters stripped,
	 * vCard aliases folded onto `text/vcard`. Returns '' when the type
	 * isn't accepted at all.
	 *
	 * @since 1.0.40
	 *
	 * @param string $mime Declared / detected type.
	 *
	 * @return string
	 */
	public static function canonical_mime( string $mime ): string {
		$mime = strtolower( trim( (string) strtok( $mime, ';' ) ) );

		if ( in_array( $mime, self::VCARD_ALIASES, true ) ) {
			return self::VCARD_MIME;
		}

		if ( 'image/jpg' === $mime || 'image/pjpeg' === $mime ) {
			$mime = 'image/jpeg';
		}

		return in_array( $mime, self::IMAGE_MIMES, true ) ? $mime : '';
	}

	/**
	 * True when the (canonical) type is accepted.
	 *
	 * @since 1.0.40
	 *
	 * @param string $mime Type.
	 *
	 * @return bool
	 */
	public static function is_allowed( string $mime ): bool {
		return '' !== self::canonical_mime( $mime );
	}

	/**
	 * True for the vCard type (any alias).
	 *
	 * @since 1.0.40
	 *
	 * @param string $mime Type.
	 *
	 * @return bool
	 */
	public static function is_vcard( string $mime ): bool {
		return self::VCARD_MIME === self::canonical_mime( $mime );
	}

	/**
	 * True for an accepted raster image type.
	 *
	 * @since 1.0.40
	 *
	 * @param string $mime Type.
	 *
	 * @return bool
	 */
	public static function is_image( string $mime ): bool {
		return in_array( self::canonical_mime( $mime ), self::IMAGE_MIMES, true );
	}

	/**
	 * Maximum upload size for a type, in bytes.
	 *
	 * @since 1.0.40
	 *
	 * @param string $mime Type.
	 *
	 * @return int
	 */
	public static function max_size_for( string $mime ): int {
		if ( self::is_vcard( $mime ) ) {
			return self::VCARD_MAX_BYTES;
		}

		/**
		 * Filters the maximum image upload size in bytes.
		 *
		 * @since 1.0.0
		 *
		 * @param int $max_size Default 5 MB.
		 */
		return (int) apply_filters( 'imgsig/upload/max_size', 5 * MB_IN_BYTES );
	}

	/**
	 * File extension for a type ('' when not accepted).
	 *
	 * @since 1.0.40
	 *
	 * @param string $mime Type.
	 *
	 * @return string
	 */
	public static function extension_for( string $mime ): string {
		return self::EXTENSIONS[ self::canonical_mime( $mime ) ] ?? '';
	}

	/**
	 * True when the bytes look like a vCard (`BEGIN:VCARD`, optionally
	 * after a UTF-8 BOM / leading whitespace).
	 *
	 * @since 1.0.40
	 *
	 * @param string $bytes File head (the first few dozen bytes are enough).
	 *
	 * @return bool
	 */
	public static function looks_like_vcard( string $bytes ): bool {
		if ( 0 === strncmp( $bytes, "\xEF\xBB\xBF", 3 ) ) {
			$bytes = substr( $bytes, 3 );
		}
		return 0 === strncasecmp( ltrim( $bytes ), 'BEGIN:VCARD', 11 );
	}

	/**
	 * Per-user storage quota in bytes (0 = unlimited).
	 *
	 * @since 1.0.40
	 *
	 * @param int $user_id User.
	 *
	 * @return int
	 */
	public static function user_quota_bytes( int $user_id ): int {
		/**
		 * Filters the per-user storage quota.
		 *
		 * @since 1.0.40
		 *
		 * @param int $bytes   Default 100 MB. Return 0 for unlimited.
		 * @param int $user_id User the quota applies to.
		 */
		return max( 0, (int) apply_filters( 'imgsig/storage/user_quota_bytes', self::DEFAULT_USER_QUOTA, $user_id ) );
	}

	/**
	 * True when storing `$incoming` more bytes would exceed the quota.
	 *
	 * @since 1.0.40
	 *
	 * @param int $user_id  User.
	 * @param int $used     Bytes the user already stores.
	 * @param int $incoming Bytes about to be stored.
	 *
	 * @return bool
	 */
	public static function exceeds_quota( int $user_id, int $used, int $incoming ): bool {
		$quota = self::user_quota_bytes( $user_id );
		return $quota > 0 && ( $used + $incoming ) > $quota;
	}

	/**
	 * True when a storage key matches the strict key alphabet.
	 *
	 * @since 1.0.40
	 *
	 * @param string $key Storage key.
	 *
	 * @return bool
	 */
	public static function is_valid_key( string $key ): bool {
		return 1 === preg_match( self::KEY_PATTERN, $key );
	}

	/**
	 * Returns (creating on first use) the user's random directory token.
	 *
	 * @since 1.0.40
	 *
	 * @param int $user_id User.
	 *
	 * @return string 16 lowercase hex chars.
	 */
	public static function user_token( int $user_id ): string {
		$token = (string) get_user_meta( $user_id, self::TOKEN_META_KEY, true );
		if ( 1 === preg_match( '/^[a-f0-9]{16}$/', $token ) ) {
			return $token;
		}

		$token = bin2hex( random_bytes( 8 ) );
		update_user_meta( $user_id, self::TOKEN_META_KEY, $token );
		return $token;
	}

	/**
	 * Storage-key prefix owned by a user (`u/{token}/`).
	 *
	 * @since 1.0.40
	 *
	 * @param int $user_id User.
	 *
	 * @return string
	 */
	public static function key_prefix( int $user_id ): string {
		return 'u/' . self::user_token( $user_id ) . '/';
	}

	/**
	 * True when `$key` was minted for `$user_id` — current `u/{token}/`
	 * keys, or legacy `users/{id}/` keys from before 1.0.40.
	 *
	 * @since 1.0.40
	 *
	 * @param string $key     Storage key.
	 * @param int    $user_id User.
	 *
	 * @return bool
	 */
	public static function key_belongs_to( string $key, int $user_id ): bool {
		if ( ! self::is_valid_key( $key ) ) {
			return false;
		}
		return 0 === strpos( $key, self::key_prefix( $user_id ) )
			|| 0 === strpos( $key, 'users/' . $user_id . '/' );
	}

	/**
	 * Mints a fresh object key for a browser-direct upload:
	 * `u/{token}/{random}.{ext}` — no user id, no original filename.
	 *
	 * @since 1.0.40
	 *
	 * @param int    $user_id User.
	 * @param string $mime    Accepted type.
	 *
	 * @return string
	 */
	public static function new_object_key( int $user_id, string $mime ): string {
		return self::key_prefix( $user_id ) . bin2hex( random_bytes( 16 ) ) . '.' . self::extension_for( $mime );
	}

	/**
	 * Content-hash based filename (`{sha256[0..32]}.{ext}`).
	 *
	 * @since 1.0.40
	 *
	 * @param string $sha256 Hex SHA-256 of the content.
	 * @param string $mime   Accepted type.
	 *
	 * @return string
	 */
	public static function hashed_filename( string $sha256, string $mime ): string {
		$hash = 1 === preg_match( '/^[a-f0-9]{64}$/', $sha256 ) ? substr( $sha256, 0, 32 ) : bin2hex( random_bytes( 16 ) );
		return $hash . '.' . self::extension_for( $mime );
	}

	/**
	 * Normalises a client-reported SHA-256 (lower-case hex or '').
	 *
	 * @since 1.0.40
	 *
	 * @param string $hash Candidate.
	 *
	 * @return string
	 */
	public static function normalise_hash( string $hash ): string {
		$hash = strtolower( trim( $hash ) );
		return 1 === preg_match( '/^[a-f0-9]{64}$/', $hash ) ? $hash : '';
	}
}
