<?php
/**
 * Smoke tests for the PSR-4 autoloader.
 *
 * @package ImaginaSignatures\Tests\Unit\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Core;

use ImaginaSignatures\Core\Autoloader;
use ImaginaSignatures\Core\Plugin;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Core\Autoloader
 */
final class AutoloaderTest extends TestCase {

	/**
	 * The autoloader resolves a known plugin class.
	 *
	 * Bootstrap registers the autoloader against `src/`, so requesting any
	 * `ImaginaSignatures\*` class should load successfully.
	 */
	public function test_resolves_namespaced_class(): void {
		$this->assertTrue(
			class_exists( Plugin::class, true ),
			'Plugin class should be auto-loaded by the PSR-4 autoloader.'
		);
	}

	/**
	 * The autoloader silently passes on classes outside its prefix so other
	 * autoloaders (composer, WP, third parties) keep working.
	 */
	public function test_ignores_classes_outside_prefix(): void {
		$this->assertFalse(
			class_exists( 'Vendor\\NotMine\\Random\\Foo' . uniqid(), true ),
			'Autoloader should not claim classes outside the ImaginaSignatures prefix.'
		);
	}

	/**
	 * Calling register() more than once is a no-op (idempotent).
	 */
	public function test_register_is_idempotent(): void {
		$before = count( spl_autoload_functions() ?: [] );

		// Bootstrap already registered it; this call should NOT add another.
		Autoloader::register( __DIR__ );

		$after = count( spl_autoload_functions() ?: [] );

		$this->assertSame(
			$before,
			$after,
			'register() should not register a second autoloader on subsequent calls.'
		);
	}
}
