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
	 * Constructor is private — this class is a static registry.
	 */
	private function __construct() {}
}
