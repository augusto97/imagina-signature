<?php
/**
 * Catalogue of filter hooks exposed by Imagina Signatures.
 *
 * @package ImaginaSignatures\Hooks
 */

declare(strict_types=1);

namespace ImaginaSignatures\Hooks;

defined( 'ABSPATH' ) || exit;

/**
 * Public filter hook names exposed by the plugin.
 *
 * Mirrors {@see Actions} but for filters. Naming follows CLAUDE.md §5.7:
 * `imgsig/{noun}/{adjective}`.
 *
 * @since 1.0.0
 */
final class Filters {

	/**
	 * Filters the list of storage driver IDs available for selection.
	 *
	 * Applied by {@see \ImaginaSignatures\Storage\StorageManager::available_driver_ids()}.
	 * Adding an ID here lets the settings page surface it as a choice; for the
	 * driver to actually work the StorageManager binding must also know how
	 * to construct it (replace the manager binding in the DI container).
	 *
	 * @since 1.0.0
	 *
	 * @param string[] $ids Default list (`['media_library', 's3']`).
	 */
	public const STORAGE_AVAILABLE_DRIVERS = 'imgsig/storage/available_drivers';

	/**
	 * Filters the per-user storage quota in bytes (0 = unlimited).
	 * Checked at /upload/init, /upload/direct and /upload/finalize.
	 *
	 * @since 1.0.40
	 *
	 * @param int $bytes   Default 104857600 (100 MB).
	 * @param int $user_id User.
	 */
	public const STORAGE_USER_QUOTA_BYTES = 'imgsig/storage/user_quota_bytes';

	/**
	 * Filters whether S3 endpoints may resolve to private / loopback
	 * hosts (requests otherwise go through wp_safe_remote_request()).
	 * Enable for self-hosted MinIO on a private network.
	 *
	 * @since 1.0.40
	 *
	 * @param bool   $allow Default false.
	 * @param string $url   Request URL.
	 */
	public const STORAGE_ALLOW_PRIVATE_ENDPOINTS = 'imgsig/storage/allow_private_endpoints';

	/**
	 * Filters the Google Workspace address a user's signature is pushed
	 * to and impersonated as (default: the WordPress user email).
	 *
	 * @since 1.3.0
	 *
	 * @param string   $email Address.
	 * @param \WP_User $user  User.
	 */
	public const GMAIL_USER_EMAIL = 'imgsig/gmail/user_email';

	/**
	 * Filters the HTML written to a user's Gmail signature.
	 *
	 * @since 1.3.0
	 *
	 * @param string                              $html      Compiled signature fragment (`html_cache`).
	 * @param int                                 $user_id   User.
	 * @param \ImaginaSignatures\Models\Signature $signature Primary signature.
	 */
	public const GMAIL_SIGNATURE_HTML = 'imgsig/gmail/signature_html';

	/**
	 * Filters the longest signature (characters, HTML included) pushed to
	 * Gmail; longer ones fail with `too_long` before any API call.
	 *
	 * @since 1.3.0
	 *
	 * @param int $max Default 10000 (Gmail's limit). 0 disables the check.
	 */
	public const GMAIL_MAX_SIGNATURE_LENGTH = 'imgsig/gmail/max_signature_length';

	/**
	 * Filters the maximum image upload size in bytes (vCards are fixed
	 * at 64 KB).
	 *
	 * @since 1.0.0
	 *
	 * @param int $max_size Default 5 MB.
	 */
	public const UPLOAD_MAX_SIZE = 'imgsig/upload/max_size';

	/**
	 * Filters the maximum width (px) of images stored by the Media
	 * Library driver; wider uploads are downscaled.
	 *
	 * @since 1.0.40
	 *
	 * @param int $width Default 1600.
	 */
	public const UPLOAD_MAX_IMAGE_WIDTH = 'imgsig/upload/max_image_width';

	/**
	 * Filters how many upload calls (init / direct / finalize) a user may
	 * make per minute.
	 *
	 * @since 1.0.40
	 *
	 * @param int $max     Default 30.
	 * @param int $user_id User.
	 */
	public const UPLOAD_RATE_LIMIT_PER_MINUTE = 'imgsig/upload/rate_limit_per_minute';

	/**
	 * Filters any rate limit's maximum hits per fixed window (0 disables).
	 *
	 * @since 1.0.40
	 *
	 * @param int    $max            Default maximum.
	 * @param string $action         `signatures_create` | `signatures_update` | `signatures_duplicate`
	 *                               | `signatures_test_send` | `signatures_test_send_site` | `upload`.
	 * @param int    $user_id        User id, 0 for site-wide buckets.
	 * @param int    $window_seconds Window length.
	 */
	public const RATE_LIMIT_MAX = 'imgsig/rate_limit/max';

	/**
	 * Filters the site-wide cap on test-send emails per hour.
	 *
	 * @since 1.0.40
	 *
	 * @param int $max Default 100 (0 disables the site-wide cap).
	 */
	public const MAIL_TEST_SEND_SITE_MAX = 'imgsig/mail/test_send_site_max';

	/**
	 * Filters the signature / template schema limits.
	 *
	 * @since 1.0.40
	 *
	 * @param array{max_bytes: int, max_depth: int, max_blocks: int} $limits Defaults 262144, 4, 200.
	 */
	public const SCHEMA_LIMITS = 'imgsig/schema/limits';

	/**
	 * Filters a user's resolved profile values (after the source mapping)
	 * — the `{{job_title}}`, `{{phone}}`, … system variables.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, string> $values  Key => value ('' when missing).
	 * @param int                   $user_id User.
	 */
	public const PROFILE_VALUES = 'imgsig/profile/values';

	/**
	 * Filters the URL protocols accepted in signature HTML and URL fields
	 * (script-capable schemes are always refused).
	 *
	 * @since 1.0.40
	 *
	 * @param string[] $protocols Default `http`, `https`, `mailto`, `tel`.
	 */
	public const SANITIZER_ALLOWED_PROTOCOLS = 'imgsig/sanitizer/allowed_protocols';

	/**
	 * Filters the user meta keys whose change marks the owner's compiled
	 * signature HTML as outdated (default: `first_name`, `last_name` and
	 * every meta key a profile field reads). Add the keys an
	 * `imgsig/editor/system_variables` callback reads; `imgsig_*` keys are
	 * ignored.
	 *
	 * @since 1.3.0
	 *
	 * @param string[] $keys Meta keys.
	 */
	public const SIGNATURE_STALE_META_KEYS = 'imgsig/signature/stale_meta_keys';

	/**
	 * Constructor is private — this class is a static registry.
	 */
	private function __construct() {}
}
