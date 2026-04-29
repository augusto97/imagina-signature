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
	 * Constructor is private — this class is a static registry.
	 */
	private function __construct() {}
}
