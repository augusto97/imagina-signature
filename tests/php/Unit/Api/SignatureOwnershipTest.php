<?php
/**
 * Ownership / IDOR tests for the signature endpoints + list projection.
 *
 * @package ImaginaSignatures\Tests\Unit\Api
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Api;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Api\Controllers\SignaturesController;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Services\SignatureService;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Api\Controllers\SignaturesController
 * @covers \ImaginaSignatures\Api\Middleware\OwnershipCheck
 */
final class SignatureOwnershipTest extends TestCase {

	/** @var array<string, array<int, array<string, mixed>>> */
	private array $routes = [];

	private int $user_id = 5;

	private bool $logged_in = true;

	private bool $can_use = true;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		$this->routes    = [];
		$this->user_id   = 5;
		$this->logged_in = true;
		$this->can_use   = true;

		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'register_rest_route' )->alias(
			function ( $namespace, $route, $args ): void {
				$this->routes[ $route ] = $args;
			}
		);
		Functions\when( 'is_user_logged_in' )->alias(
			function (): bool {
				return $this->logged_in;
			}
		);
		Functions\when( 'current_user_can' )->alias(
			function (): bool {
				return $this->can_use;
			}
		);
		Functions\when( 'get_current_user_id' )->alias(
			function (): int {
				return $this->user_id;
			}
		);
		Functions\when( 'rest_ensure_response' )->alias(
			static function ( $data ) {
				return $data instanceof \WP_REST_Response ? $data : new \WP_REST_Response( $data );
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * Signature 10 belongs to user 5.
	 */
	private function repo(): SignatureRepository {
		$repo = $this->createMock( SignatureRepository::class );
		$repo->method( 'exists_owned_by' )->willReturnCallback(
			static function ( int $id, int $user_id ): bool {
				return 10 === $id && 5 === $user_id;
			}
		);
		return $repo;
	}

	private function controller( ?SignatureRepository $repo = null ): SignaturesController {
		$controller = new SignaturesController(
			$this->createMock( SignatureService::class ),
			$repo ?? $this->repo(),
			$this->createMock( RateLimiter::class )
		);
		$controller->register_routes();
		return $controller;
	}

	/**
	 * @return mixed
	 */
	private function permission( string $route, string $method, int $id ) {
		foreach ( $this->routes[ $route ] as $definition ) {
			if ( false !== strpos( (string) $definition['methods'], $method ) ) {
				return ( $definition['permission_callback'] )( new \WP_REST_Request( [ 'id' => $id ] ) );
			}
		}
		$this->fail( "No {$method} handler on {$route}" );
	}

	/**
	 * @return array<string, array{0: string, 1: string}>
	 */
	public function id_routes(): array {
		return [
			'read'      => [ '/signatures/(?P<id>\d+)', 'GET' ],
			'update'    => [ '/signatures/(?P<id>\d+)', 'PATCH' ],
			'delete'    => [ '/signatures/(?P<id>\d+)', 'DELETE' ],
			'duplicate' => [ '/signatures/(?P<id>\d+)/duplicate', 'POST' ],
		];
	}

	/**
	 * @dataProvider id_routes
	 */
	public function test_owner_is_allowed( string $route, string $method ): void {
		$this->controller();
		$this->assertTrue( $this->permission( $route, $method, 10 ) );
	}

	/**
	 * @dataProvider id_routes
	 */
	public function test_other_users_ids_are_rejected( string $route, string $method ): void {
		$this->controller();
		$this->user_id = 6;

		$result = $this->permission( $route, $method, 10 );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'imgsig_forbidden', $result->get_error_code() );
		$this->assertSame( 403, $result->get_error_data()['status'] );
	}

	/**
	 * @dataProvider id_routes
	 */
	public function test_anonymous_and_capless_callers_are_rejected( string $route, string $method ): void {
		$this->controller();

		$this->logged_in = false;
		$this->assertSame( 401, $this->permission( $route, $method, 10 )->get_error_data()['status'] );

		$this->logged_in = true;
		$this->can_use   = false;
		$this->assertSame( 403, $this->permission( $route, $method, 10 )->get_error_data()['status'] );
	}

	public function test_non_positive_ids_are_rejected_without_a_query(): void {
		$repo = $this->createMock( SignatureRepository::class );
		$repo->expects( $this->never() )->method( 'exists_owned_by' );
		$this->controller( $repo );

		$this->assertInstanceOf( \WP_Error::class, $this->permission( '/signatures/(?P<id>\d+)', 'GET', 0 ) );
	}

	public function test_list_is_a_summary_projection_unless_context_edit(): void {
		$row  = Signature::from_row(
			[
				'id'           => 10,
				'user_id'      => 5,
				'name'         => 'Mine',
				'json_content' => '{"schema_version":"1.0","blocks":[]}',
				'html_cache'   => '<table></table>',
			]
		);
		$repo = $this->createMock( SignatureRepository::class );
		$repo->method( 'count_by_user' )->willReturn( 1 );
		$repo->expects( $this->exactly( 2 ) )->method( 'find_by_user' )->withConsecutive(
			[ 5, $this->callback( static function ( array $args ): bool { return 'summary' === $args['fields']; } ) ],
			[ 5, $this->callback( static function ( array $args ): bool { return 'all' === $args['fields']; } ) ]
		)->willReturn( [ $row ] );

		$controller = $this->controller( $repo );

		$summary = $controller->index( new \WP_REST_Request( [] ) );
		$this->assertArrayNotHasKey( 'json_content', $summary->get_data()[0] );
		$this->assertArrayNotHasKey( 'html_cache', $summary->get_data()[0] );
		$this->assertSame( 'Mine', $summary->get_data()[0]['name'] );
		$this->assertSame( '1', $summary->headers['X-WP-Total'] );

		$full = $controller->index( new \WP_REST_Request( [ 'context' => 'edit' ] ) );
		$this->assertSame( [], $full->get_data()[0]['json_content']['blocks'] );
		$this->assertSame( '<table></table>', $full->get_data()[0]['html_cache'] );
	}
}
