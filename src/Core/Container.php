<?php
/**
 * Lightweight dependency-injection container.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Simple service container with bind / singleton semantics.
 *
 * The container intentionally does not auto-resolve dependencies via reflection;
 * services are registered explicitly through factory closures so behavior stays
 * predictable across PHP versions and hosting environments.
 *
 * @since 1.0.0
 */
final class Container {

	/**
	 * Factory closures keyed by abstract identifier.
	 *
	 * @var array<string, callable>
	 */
	private array $bindings = [];

	/**
	 * Cached singleton instances.
	 *
	 * @var array<string, mixed>
	 */
	private array $instances = [];

	/**
	 * Registers a transient binding (factory invoked on every `make`).
	 *
	 * @since 1.0.0
	 *
	 * @param string   $abstract Identifier (typically a FQCN).
	 * @param callable $factory  Factory receiving the container as argument.
	 */
	public function bind( string $abstract, callable $factory ): void {
		$this->bindings[ $abstract ] = $factory;
		unset( $this->instances[ $abstract ] );
	}

	/**
	 * Registers a shared (singleton) binding.
	 *
	 * @since 1.0.0
	 *
	 * @param string   $abstract Identifier (typically a FQCN).
	 * @param callable $factory  Factory receiving the container as argument.
	 */
	public function singleton( string $abstract, callable $factory ): void {
		$this->bindings[ $abstract ] = function ( Container $c ) use ( $abstract, $factory ) {
			if ( ! array_key_exists( $abstract, $this->instances ) ) {
				$this->instances[ $abstract ] = $factory( $c );
			}
			return $this->instances[ $abstract ];
		};
	}

	/**
	 * Registers an existing instance under an identifier.
	 *
	 * @since 1.0.0
	 *
	 * @param string $abstract Identifier.
	 * @param mixed  $instance Instance to share.
	 */
	public function instance( string $abstract, $instance ): void {
		$this->instances[ $abstract ] = $instance;
		$this->bindings[ $abstract ]  = static fn() => $instance;
	}

	/**
	 * Resolves a binding.
	 *
	 * @since 1.0.0
	 *
	 * @param string $abstract Identifier.
	 *
	 * @return mixed
	 *
	 * @throws \RuntimeException When no binding exists for the identifier.
	 */
	public function make( string $abstract ) {
		if ( ! isset( $this->bindings[ $abstract ] ) ) {
			throw new \RuntimeException( sprintf( 'No binding registered for [%s].', $abstract ) );
		}
		return ( $this->bindings[ $abstract ] )( $this );
	}

	/**
	 * Whether a binding has been registered.
	 *
	 * @since 1.0.0
	 *
	 * @param string $abstract Identifier.
	 *
	 * @return bool
	 */
	public function has( string $abstract ): bool {
		return isset( $this->bindings[ $abstract ] );
	}
}
