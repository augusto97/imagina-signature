<?php
/**
 * PHPUnit bootstrap.
 *
 * Loads Brain Monkey for WP function mocking and the plugin's own PSR-4
 * autoloader so tests can resolve `ImaginaSignatures\` classes without
 * touching Composer autoload at runtime.
 *
 * @package ImaginaSignatures
 */

declare(strict_types=1);

// Composer dev dependencies (Brain Monkey, PHPUnit).
require_once __DIR__ . '/../../vendor/autoload.php';

// Minimal stand-ins for the WordPress core classes used in type
// hints / return values. Brain Monkey patches functions but not
// classes, so the controllers need these to even autoload.
require_once __DIR__ . '/wp-stubs.php';

// The plugin's own PSR-4 autoloader.
require_once __DIR__ . '/../../src/Core/Autoloader.php';
\ImaginaSignatures\Core\Autoloader::register( __DIR__ . '/../../src' );
