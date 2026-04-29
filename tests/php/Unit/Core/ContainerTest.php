<?php
/**
 * Container tests.
 *
 * @package ImaginaSignatures\Tests\Unit\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Core;

use ImaginaSignatures\Core\Container;
use PHPUnit\Framework\TestCase;

final class ContainerTest extends TestCase {

	public function test_bind_invokes_factory_on_every_make(): void {
		$container = new Container();
		$count     = 0;

		$container->bind(
			'thing',
			static function () use ( &$count ) {
				$count++;
				return new \stdClass();
			}
		);

		$first  = $container->make( 'thing' );
		$second = $container->make( 'thing' );

		$this->assertNotSame( $first, $second );
		$this->assertSame( 2, $count );
	}

	public function test_singleton_returns_same_instance(): void {
		$container = new Container();
		$count     = 0;

		$container->singleton(
			'thing',
			static function () use ( &$count ) {
				$count++;
				return new \stdClass();
			}
		);

		$first  = $container->make( 'thing' );
		$second = $container->make( 'thing' );

		$this->assertSame( $first, $second );
		$this->assertSame( 1, $count );
	}

	public function test_instance_registers_existing_object(): void {
		$container = new Container();
		$object    = new \stdClass();

		$container->instance( 'thing', $object );

		$this->assertTrue( $container->has( 'thing' ) );
		$this->assertSame( $object, $container->make( 'thing' ) );
	}

	public function test_make_throws_for_unknown_binding(): void {
		$container = new Container();

		$this->expectException( \RuntimeException::class );
		$container->make( 'missing' );
	}
}
