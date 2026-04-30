<?php
/**
 * Integration test for SignaturesController.
 *
 * Verifies that {@see SignaturesController::register_routes()} wires
 * the right paths, methods, and permission_callbacks against the
 * REST router. Uses Brain Monkey to capture register_rest_route
 * calls; no real WordPress runtime required.
 *
 * Full end-to-end testing (request → handler → response, against an
 * actual WP_REST_Server) is out of scope for the Brain Monkey-based
 * harness — that needs wp-tests-lib and lands as a follow-up.
 *
 * @package ImaginaSignatures\Tests\Integration
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Integration;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Api\Controllers\SignaturesController;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Services\SignatureService;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Api\Controllers\SignaturesController
 */
final class SignaturesControllerTest extends TestCase {

	/**
	 * Captured `register_rest_route` calls from the test under run.
	 *
	 * @var array<int, array<string, mixed>>
	 */
	private array $registered = [];

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		$this->registered = [];

		// __() pass-through so localised strings don't blow up.
		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'esc_html__' )->returnArg( 1 );

		// Capture register_rest_route invocations.
		Functions\when( 'register_rest_route' )->alias(
			function ( $namespace, $route, $args ): void {
				$this->registered[] = [
					'namespace' => $namespace,
					'route'     => $route,
					'args'      => $args,
				];
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * Builds a controller backed by mocked dependencies.
	 */
	private function controller(): SignaturesController {
		$service = $this->createMock( SignatureService::class );
		$repo    = $this->createMock( SignatureRepository::class );
		$rl      = $this->createMock( RateLimiter::class );

		return new SignaturesController( $service, $repo, $rl );
	}

	public function test_registers_collection_endpoint(): void {
		$this->controller()->register_routes();

		$routes = array_map(
			static function ( array $entry ): string {
				return (string) $entry['route'];
			},
			$this->registered
		);

		$this->assertContains( '/signatures', $routes );
	}

	public function test_registers_item_endpoint_with_id_parameter(): void {
		$this->controller()->register_routes();

		$routes = array_map(
			static function ( array $entry ): string {
				return (string) $entry['route'];
			},
			$this->registered
		);

		$this->assertContains( '/signatures/(?P<id>\d+)', $routes );
	}

	public function test_registers_duplicate_endpoint(): void {
		$this->controller()->register_routes();

		$routes = array_map(
			static function ( array $entry ): string {
				return (string) $entry['route'];
			},
			$this->registered
		);

		$this->assertContains( '/signatures/(?P<id>\d+)/duplicate', $routes );
	}

	public function test_uses_correct_namespace(): void {
		$this->controller()->register_routes();

		$namespaces = array_unique(
			array_map(
				static function ( array $entry ): string {
					return (string) $entry['namespace'];
				},
				$this->registered
			)
		);

		$this->assertSame( [ 'imagina-signatures/v1' ], array_values( $namespaces ) );
	}

	public function test_every_route_has_a_permission_callback(): void {
		$this->controller()->register_routes();

		foreach ( $this->registered as $entry ) {
			foreach ( (array) $entry['args'] as $route_args ) {
				$this->assertArrayHasKey(
					'permission_callback',
					$route_args,
					sprintf( 'Route %s is missing permission_callback', $entry['route'] )
				);
				$this->assertIsCallable( $route_args['permission_callback'] );
			}
		}
	}

	public function test_collection_route_supports_get_and_post(): void {
		$this->controller()->register_routes();

		$entry = $this->find_route( '/signatures' );
		$this->assertNotNull( $entry );

		$methods = array_map(
			static function ( array $args ): string {
				return (string) $args['methods'];
			},
			$entry['args']
		);

		$this->assertContains( 'GET', $methods );
		$this->assertContains( 'POST', $methods );
	}

	public function test_item_route_supports_get_patch_delete(): void {
		$this->controller()->register_routes();

		$entry = $this->find_route( '/signatures/(?P<id>\d+)' );
		$this->assertNotNull( $entry );

		$methods = array_map(
			static function ( array $args ): string {
				return (string) $args['methods'];
			},
			$entry['args']
		);

		$this->assertContains( 'GET', $methods );
		$this->assertContains( 'PATCH', $methods );
		$this->assertContains( 'DELETE', $methods );
	}

	/**
	 * @return array<string, mixed>|null
	 */
	private function find_route( string $route ): ?array {
		foreach ( $this->registered as $entry ) {
			if ( $route === $entry['route'] ) {
				return $entry;
			}
		}
		return null;
	}
}
