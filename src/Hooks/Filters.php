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
 * Mirrors {@see Actions} but for filters. Sprint 1 does not yet expose
 * any filters — the catalogue starts empty and grows as Sprints 2+
 * introduce them. Naming follows CLAUDE.md §5.7: `imgsig/{noun}/{adjective}`.
 *
 * @since 1.0.0
 */
final class Filters {

	/**
	 * Constructor is private — this class is a static registry.
	 */
	private function __construct() {}
}
