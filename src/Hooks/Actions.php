<?php
/**
 * Catalogue of action hooks exposed by Imagina Signatures.
 *
 * @package ImaginaSignatures\Hooks
 */

declare(strict_types=1);

namespace ImaginaSignatures\Hooks;

defined( 'ABSPATH' ) || exit;

/**
 * Public action hook names emitted by the plugin.
 *
 * The class itself does nothing at runtime — it's a documentation surface
 * and a registry of constants that callers should prefer over hard-coded
 * strings. Each constant carries a docblock describing when the hook
 * fires and what arguments it receives. This file is the "single source
 * of truth" referenced by CLAUDE.md §26.
 *
 * Naming follows CLAUDE.md §5.7: `imgsig/{entity}/{event}`.
 *
 * @since 1.0.0
 */
final class Actions {

	/**
	 * Fires after {@see \ImaginaSignatures\Core\Plugin::boot()} finishes.
	 *
	 * Service providers can hook here to register additional container
	 * bindings or WordPress hooks. The plugin's DI container is passed
	 * as the first argument.
	 *
	 * @since 1.0.0
	 *
	 * @param \ImaginaSignatures\Core\Container $container Plugin DI container.
	 */
	public const PLUGIN_BOOTED = 'imgsig/plugin/booted';

	/**
	 * Fires once after the plugin is activated and {@see \ImaginaSignatures\Core\Installer::install()}
	 * has finished. Triggered from {@see \ImaginaSignatures\Core\Activator::activate()}.
	 *
	 * @since 1.0.0
	 */
	public const PLUGIN_ACTIVATED = 'imgsig/plugin/activated';

	/**
	 * Fires once when the plugin is deactivated, after rewrite rules and
	 * scheduled hooks have been cleaned up.
	 *
	 * @since 1.0.0
	 */
	public const PLUGIN_DEACTIVATED = 'imgsig/plugin/deactivated';

	/**
	 * Fires from `uninstall.php` after every plugin-owned table, option,
	 * capability, and transient has been removed.
	 *
	 * Caveat: during uninstall WordPress does NOT load other plugins, so
	 * listeners attached from another plugin file will not be invoked.
	 * Useful only from mu-plugins or core hooks.
	 *
	 * @since 1.0.0
	 */
	public const PLUGIN_UNINSTALLED = 'imgsig/plugin/uninstalled';

	/**
	 * Fires after every Gmail push attempt for one user — pushed, skipped
	 * or failed. {@see \ImaginaSignatures\Deployment\Gmail\GmailScheduler}
	 * listens to it to retry temporary failures.
	 *
	 * @since 1.3.0
	 *
	 * @param \ImaginaSignatures\Deployment\Gmail\PushResult $result Outcome (`status`, `user_id`, `send_as`, `exception`…).
	 */
	public const GMAIL_PUSH_COMPLETED = 'imgsig/gmail/push_completed';

	/**
	 * Fires after a user's plugin-stored profile values change (REST,
	 * WP profile screen or CSV import). Signatures resolve them as
	 * `{{key}}`, so the user's compiled HTML may now be outdated.
	 *
	 * @since 1.3.0
	 *
	 * @param int      $user_id User.
	 * @param string[] $changed Keys that changed.
	 * @param string   $context `rest` | `profile_screen` | `import`.
	 */
	public const PROFILE_UPDATED = 'imgsig/profile/updated';

	/**
	 * Fires after Settings → Profile fields (mapping / custom fields) is saved
	 * with a change (1.3.0: not on a save that changed nothing).
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed> $config Sanitised `imgsig_profile_fields`.
	 */
	public const PROFILE_FIELDS_CHANGED = 'imgsig/profile/fields_changed';

	/**
	 * Fires after a group is created or updated.
	 *
	 * @since 1.3.0
	 *
	 * @param int    $group_id Group (term id).
	 * @param string $event    `created` | `updated`.
	 */
	public const GROUP_SAVED = 'imgsig/group/saved';

	/**
	 * Fires after a group is deleted.
	 *
	 * @since 1.3.0
	 *
	 * @param int $group_id Deleted group.
	 */
	public const GROUP_DELETED = 'imgsig/group/deleted';

	/**
	 * Fires after users join or leave a group (their effective footer,
	 * targeted campaigns and assigned template may have changed).
	 *
	 * @since 1.3.0
	 *
	 * @param int   $group_id Group.
	 * @param int[] $added    Users added.
	 * @param int[] $removed  Users removed.
	 */
	public const GROUP_MEMBERS_CHANGED = 'imgsig/group/members_changed';

	/**
	 * Fires from {@see \ImaginaSignatures\Storage\StorageManager::save_config()}
	 * when the active storage driver ID changes (e.g. switching from
	 * Media Library to S3).
	 *
	 * Useful for cache invalidation or migration triggers; the manager's
	 * own cache is invalidated before this fires, so listeners can call
	 * `active_driver()` and see the new state.
	 *
	 * @since 1.0.0
	 *
	 * @param string $previous_id Previously-active driver ID.
	 * @param string $new_id      Newly-active driver ID.
	 */
	public const STORAGE_DRIVER_CHANGED = 'imgsig/storage/driver_changed';

	/**
	 * Fires after each chunk (≤ 50 users) of a template assignment —
	 * {@see \ImaginaSignatures\Services\TemplateAssignmentService::assign()}.
	 *
	 * @since 1.3.0
	 *
	 * @param int                  $template_id Template.
	 * @param int[]                $user_ids    Users of this chunk.
	 * @param string               $mode        `linked` or `copy`.
	 * @param array<string, mixed> $result      `{ processed, created, updated, skipped, failed, total, next_offset }`.
	 */
	public const TEMPLATE_ASSIGNED = 'imgsig/template/assigned';

	/**
	 * Fires after a team manager saved another user's signature on their
	 * behalf (`PATCH /signatures/:id` from the Team page's "Edit signature
	 * on their behalf") — {@see \ImaginaSignatures\Team\OnBehalf::announce()}.
	 *
	 * @since 1.3.0
	 *
	 * @param \ImaginaSignatures\Models\Signature $signature The saved signature (owner = `$signature->user_id`).
	 * @param int                                $editor_id User who saved it.
	 * @param string[]                           $fields    Fields that were sent (`json_content`, `name`, `html`…).
	 */
	public const SIGNATURE_EDITED_ON_BEHALF = 'imgsig/signature/edited_on_behalf';

	/**
	 * Fires after stored signature HTML was marked outdated because an
	 * input outside the signature changed (profile, WP user fields,
	 * groups, field mapping, compliance footer, campaigns, brand kit
	 * company data) — {@see \ImaginaSignatures\Services\StaleHtmlMarker}.
	 *
	 * @since 1.3.0
	 *
	 * @param int[]|null $user_ids Owners whose signatures were marked (null = everyone).
	 * @param string     $reason   `profile` | `user` | `group` | `profile_fields` | `site_settings` | `campaign_window`.
	 * @param int        $rows     Rows that were fresh and are now outdated.
	 */
	public const SIGNATURE_HTML_OUTDATED = 'imgsig/signature/html_outdated';

	/**
	 * Fires after `PATCH /admin/site-settings` changed the compliance
	 * footer, the banner campaigns and / or the brand kit (not on a save
	 * that changed nothing).
	 *
	 * @since 1.3.0
	 *
	 * @param string[]             $changed Keys that changed: `compliance_footer`, `banner_campaigns`, `brand_kit`.
	 * @param array<string, mixed> $before  The three settings before the save.
	 * @param array<string, mixed> $after   The three settings after the save.
	 */
	public const SITE_SETTINGS_CHANGED = 'imgsig/site_settings/changed';

	/**
	 * Constructor is private — this class is a static registry.
	 */
	private function __construct() {}
}
