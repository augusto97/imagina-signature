<?php
/**
 * Autoloader tests.
 *
 * @package ImaginaSignatures\Tests\Unit\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Core;

use ImaginaSignatures\Core\Autoloader;
use ImaginaSignatures\Core\Container;
use PHPUnit\Framework\TestCase;

final class AutoloaderTest extends TestCase {

	public function test_register_is_idempotent(): void {
		Autoloader::register();
		Autoloader::register();

		$this->assertTrue( class_exists( Container::class ) );
	}

	public function test_load_class_ignores_foreign_namespaces(): void {
		Autoloader::load_class( 'Vendor\\Other\\Thing' );

		$this->assertFalse( class_exists( 'Vendor\\Other\\Thing', false ) );
	}
}
