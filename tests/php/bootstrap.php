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

// The plugin's own PSR-4 autoloader.
require_once __DIR__ . '/../../src/Core/Autoloader.php';
\ImaginaSignatures\Core\Autoloader::register( __DIR__ . '/../../src' );
