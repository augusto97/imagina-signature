<?php
/**
 * Regression: every shipped storage driver instantiates cleanly.
 *
 * 1.0.29 shipped with `UrlOnlyDriver` missing one of the methods the
 * `StorageDriverInterface` requires (`verify_object_exists`). PHP let
 * the class file parse (no syntax error), but the moment any code
 * path tried to instantiate the class — including the autoloader
 * resolving the FQCN during a routine page load — PHP fataled with
 * "contains 1 abstract method and must therefore be declared abstract
 * or implement the remaining methods". Result: white screen of death
 * on every wp-admin request after activating 1.0.29.
 *
 * This test pins that contract: every driver class under
 * `Storage/Drivers/` MUST be instantiable without arguments (or with
 * a fixture of fake-but-valid config) and MUST satisfy the interface.
 * Adding a new driver in the future without implementing every
 * interface method now breaks this test instead of breaking sites.
 *
 * @package ImaginaSignatures\Tests\Unit\Storage
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Storage;

use ImaginaSignatures\Storage\Contracts\StorageDriverInterface;
use ImaginaSignatures\Storage\Drivers\MediaLibraryDriver;
use ImaginaSignatures\Storage\Drivers\UrlOnlyDriver;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

final class DriversInstantiableTest extends TestCase {

	/**
	 * MediaLibraryDriver takes no constructor arguments and must
	 * instantiate cleanly. Sanity check — fails when the interface
	 * grows a new method that any of the shipped drivers forgets to
	 * implement.
	 */
	public function test_media_library_driver_instantiates(): void {
		$driver = new MediaLibraryDriver();
		$this->assertInstanceOf( StorageDriverInterface::class, $driver );
		$this->assertSame( 'media_library', $driver->get_id() );
	}

	/**
	 * UrlOnlyDriver takes no constructor arguments. Pins the 1.0.29
	 * regression: forgetting `verify_object_exists` made this `new`
	 * call fatal-error and brought down every wp-admin page load.
	 */
	public function test_url_only_driver_instantiates(): void {
		$driver = new UrlOnlyDriver();
		$this->assertInstanceOf( StorageDriverInterface::class, $driver );
		$this->assertSame( 'url_only', $driver->get_id() );
		$this->assertTrue( $driver->is_configured() );
		$this->assertFalse( $driver->supports_presigned_uploads() );
		$this->assertFalse( $driver->verify_object_exists( 'any/key' ) );
	}

	/**
	 * Every concrete (non-abstract) class under `Storage/Drivers/`
	 * must declare an `ID` constant of type string. Future drivers
	 * that forget the constant will fail this test rather than
	 * crash silently in `StorageManager::available_driver_ids()`.
	 */
	public function test_every_driver_has_an_id_constant(): void {
		$driver_dir = __DIR__ . '/../../../../src/Storage/Drivers';
		$files      = glob( $driver_dir . '/*.php' );
		$this->assertNotEmpty( $files, 'No driver files found under Storage/Drivers/.' );

		foreach ( $files as $file ) {
			$basename = basename( $file, '.php' );
			$fqcn     = "ImaginaSignatures\\Storage\\Drivers\\{$basename}";
			$reflect  = new ReflectionClass( $fqcn );

			if ( $reflect->isAbstract() || $reflect->isInterface() ) {
				continue;
			}

			$this->assertTrue(
				$reflect->hasConstant( 'ID' ),
				"{$fqcn} must declare a string `ID` constant."
			);
			$this->assertIsString(
				$reflect->getConstant( 'ID' ),
				"{$fqcn}::ID must be a string."
			);
		}
	}
}
