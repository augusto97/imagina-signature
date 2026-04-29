<?php
/**
 * Minimal dependency injection container.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

defined( 'ABSPATH' ) || exit;

/**
 * Tiny DI container.
 *
 * Stores factory callables keyed by abstract identifier (typically a class
 * or interface name). Resolution is explicit — there's no reflection or
 * auto-wiring (CLAUDE.md §5.8). Service providers register concrete
 * factories during {@see Plugin::boot()}.
 *
 * Example:
 * ```
 * $container->singleton(
 *     SignatureRepository::class,
 *     static fn ( Container $c ) => new SignatureRepository( $GLOBALS['wpdb'] )
 * );
 * $repo = $container->make( SignatureRepository::class );
 * ```
 *
 * @since 1.0.0
 */
final class Container {

	/**
	 * Map of abstract identifiers to factory callables.
	 *
	 * @var array<string, callable>
	 */
	private array $bindings = [];

	/**
	 * Map of resolved singleton instances, keyed by abstract identifier.
	 *
	 * @var array<string, mixed>
	 */
	private array $instances = [];

	/**
	 * Registers a factory under the given abstract identifier.
	 *
	 * Each call to {@see make()} for this abstract will invoke the factory
	 * and return a fresh instance. Re-binding the same abstract overrides
	 * the previous binding and clears any cached singleton instance.
	 *
	 * @since 1.0.0
	 *
	 * @param string   $abstract Class/interface name or arbitrary identifier.
	 * @param callable $factory  Factory called as `fn ( Container $c ) => ...`.
	 *
	 * @return void
	 */
	public function bind( string $abstract, callable $factory ): void {
		$this->bindings[ $abstract ] = $factory;
		unset( $this->instances[ $abstract ] );
	}

	/**
	 * Registers a shared (singleton) factory.
	 *
	 * The factory runs at most once per container; subsequent {@see make()}
	 * calls return the cached instance.
	 *
	 * @since 1.0.0
	 *
	 * @param string   $abstract Class/interface name or arbitrary identifier.
	 * @param callable $factory  Factory called as `fn ( Container $c ) => ...`.
	 *
	 * @return void
	 */
	public function singleton( string $abstract, callable $factory ): void {
		$this->bindings[ $abstract ] = function ( Container $c ) use ( $abstract, $factory ) {
			if ( ! array_key_exists( $abstract, $this->instances ) ) {
				$this->instances[ $abstract ] = $factory( $c );
			}
			return $this->instances[ $abstract ];
		};
		unset( $this->instances[ $abstract ] );
	}

	/**
	 * Registers an already-constructed instance as a shared binding.
	 *
	 * Useful for objects whose construction happens outside the container
	 * (e.g. globals like `$wpdb`).
	 *
	 * @since 1.0.0
	 *
	 * @param string $abstract Class/interface name or arbitrary identifier.
	 * @param mixed  $instance The pre-constructed object.
	 *
	 * @return void
	 */
	public function instance( string $abstract, $instance ): void {
		$this->instances[ $abstract ] = $instance;
		$this->bindings[ $abstract ]  = static function () use ( $instance ) {
			return $instance;
		};
	}

	/**
	 * Returns true when a binding has been registered for the abstract.
	 *
	 * @since 1.0.0
	 *
	 * @param string $abstract Identifier to check.
	 *
	 * @return bool
	 */
	public function has( string $abstract ): bool {
		return isset( $this->bindings[ $abstract ] );
	}

	/**
	 * Resolves the binding registered under `$abstract`.
	 *
	 * @since 1.0.0
	 *
	 * @param string $abstract Identifier to resolve.
	 *
	 * @return mixed The value produced by the registered factory.
	 *
	 * @throws \RuntimeException When no binding is registered for `$abstract`.
	 */
	public function make( string $abstract ) {
		if ( ! isset( $this->bindings[ $abstract ] ) ) {
			throw new \RuntimeException(
				sprintf( 'No binding registered for "%s".', $abstract )
			);
		}

		return ( $this->bindings[ $abstract ] )( $this );
	}
}
