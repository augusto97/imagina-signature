<?php
/**
 * "Edit on behalf": a team manager reads / saves another user's
 * signature; nobody else can, and destructive routes stay owner-only.
 *
 * @package ImaginaSignatures\Tests\Unit\Api
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Api;

use Brain\Monkey;
use Brain\Monkey\Actions;
use Brain\Monkey\Functions;
use ImaginaSignatures\Admin\EditorAssetEnqueuer;
use ImaginaSignatures\Admin\Pages\EditorPage;
use ImaginaSignatures\Api\Controllers\SignaturesController;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Services\SignatureService;
use ImaginaSignatures\Tests\Unit\Settings\BrandKitStubs;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../Settings/BrandKitStubs.php';

/**
 * @covers \ImaginaSignatures\Api\Controllers\SignaturesController
 * @covers \ImaginaSignatures\Api\Middleware\OwnershipCheck
 * @covers \ImaginaSignatures\Team\OnBehalf
 * @covers \ImaginaSignatures\Admin\EditorAssetEnqueuer::on_behalf_owner
 * @covers \ImaginaSignatures\Admin\EditorAssetEnqueuer::owner_context
 * @covers \ImaginaSignatures\Admin\Pages\EditorPage
 */
final class EditOnBehalfTest extends TestCase {

	use BrandKitStubs;

	/** Signature 10 belongs to María (user 5). */
	private const SIGNATURE = 10;
	private const OWNER     = 5;
	private const MANAGER   = 6;

	/** @var array<string, array<int, array<string, mixed>>> */
	private array $routes = [];

	private int $user_id = self::MANAGER;

	/** @var array<string, bool> */
	private array $caps = [];

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_sanitizers();
		$this->routes  = [];
		$this->user_id = self::MANAGER;
		$this->caps    = [];

		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'esc_html__' )->returnArg( 1 );
		Functions\when( 'register_rest_route' )->alias(
			function ( $namespace, $route, $args ): void {
				$this->routes[ $route ] = $args;
			}
		);
		Functions\when( 'is_user_logged_in' )->justReturn( true );
		Functions\when( 'current_user_can' )->alias(
			function ( $cap ): bool {
				return ! empty( $this->caps[ $cap ] );
			}
		);
		Functions\when( 'get_current_user_id' )->alias(
			function (): int {
				return $this->user_id;
			}
		);
		Functions\when( 'get_userdata' )->alias(
			static function ( $id ) {
				return self::OWNER === (int) $id
					? new \WP_User(
						[
							'ID'           => self::OWNER,
							'display_name' => 'María López',
							'user_email'   => 'maria@acme.test',
							'first_name'   => 'María',
						]
					)
					: false;
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

	private function as_owner(): void {
		$this->user_id = self::OWNER;
		$this->caps    = [ 'imgsig_use_signatures' => true ];
	}

	private function as_manager(): void {
		$this->user_id = self::MANAGER;
		$this->caps    = [
			'imgsig_use_signatures' => true,
			'imgsig_manage_team'    => true,
		];
	}

	private function as_other_user(): void {
		$this->user_id = self::MANAGER;
		// Even a template / storage administrator isn't a team manager.
		$this->caps = [
			'imgsig_use_signatures'   => true,
			'imgsig_manage_templates' => true,
			'imgsig_manage_storage'   => true,
		];
	}

	private function repo(): SignatureRepository {
		$repo = $this->createMock( SignatureRepository::class );
		$repo->method( 'exists_owned_by' )->willReturnCallback(
			static function ( int $id, int $user_id ): bool {
				return self::SIGNATURE === $id && self::OWNER === $user_id;
			}
		);
		$repo->method( 'owner_of' )->willReturnCallback(
			static function ( int $id ): int {
				return self::SIGNATURE === $id ? self::OWNER : 0;
			}
		);
		$repo->method( 'find_owned_by' )->willReturnCallback(
			static function ( int $id, int $user_id ): ?Signature {
				return self::SIGNATURE === $id && self::OWNER === $user_id ? self::row() : null;
			}
		);
		return $repo;
	}

	private static function row(): Signature {
		return Signature::from_row(
			[
				'id'           => self::SIGNATURE,
				'user_id'      => self::OWNER,
				'name'         => 'María',
				'json_content' => '{"schema_version":"1.1","blocks":[]}',
			]
		);
	}

	private function controller( ?SignatureService $service = null ): SignaturesController {
		$controller = new SignaturesController(
			$service ?? $this->createMock( SignatureService::class ),
			$this->repo(),
			$this->createMock( RateLimiter::class )
		);
		$controller->register_routes();
		return $controller;
	}

	/**
	 * @return mixed
	 */
	private function permission( string $route, string $method, int $id = self::SIGNATURE ) {
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
	public function read_write_routes(): array {
		return [
			'read'   => [ '/signatures/(?P<id>\d+)', 'GET' ],
			'update' => [ '/signatures/(?P<id>\d+)', 'PATCH' ],
			'post'   => [ '/signatures/(?P<id>\d+)', 'POST' ],
		];
	}

	/**
	 * @return array<string, array{0: string, 1: string}>
	 */
	public function owner_only_routes(): array {
		return [
			'delete'    => [ '/signatures/(?P<id>\d+)', 'DELETE' ],
			'duplicate' => [ '/signatures/(?P<id>\d+)/duplicate', 'POST' ],
			'primary'   => [ '/signatures/(?P<id>\d+)/primary', 'POST' ],
		];
	}

	/**
	 * @dataProvider read_write_routes
	 */
	public function test_team_manager_may_read_and_save_someone_elses_signature( string $route, string $method ): void {
		$this->controller();
		$this->as_manager();
		$this->assertTrue( $this->permission( $route, $method ) );
	}

	/**
	 * @dataProvider read_write_routes
	 */
	public function test_without_manage_team_another_users_signature_stays_forbidden( string $route, string $method ): void {
		$this->controller();
		$this->as_other_user();

		$result = $this->permission( $route, $method );
		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 403, $result->get_error_data()['status'] );
	}

	/**
	 * @dataProvider read_write_routes
	 */
	public function test_manage_team_without_use_signatures_is_refused_before_ownership( string $route, string $method ): void {
		$this->controller();
		$this->caps = [ 'imgsig_manage_team' => true ];
		$this->assertSame( 403, $this->permission( $route, $method )->get_error_data()['status'] );
	}

	/**
	 * @dataProvider read_write_routes
	 */
	public function test_a_missing_signature_is_refused_even_for_a_team_manager( string $route, string $method ): void {
		$this->controller();
		$this->as_manager();
		$this->assertInstanceOf( \WP_Error::class, $this->permission( $route, $method, 999 ) );
	}

	/**
	 * @dataProvider owner_only_routes
	 */
	public function test_delete_duplicate_and_primary_stay_with_the_owner( string $route, string $method ): void {
		$this->controller();

		$this->as_manager();
		$this->assertInstanceOf( \WP_Error::class, $this->permission( $route, $method ) );

		$this->as_owner();
		$this->assertTrue( $this->permission( $route, $method ) );
	}

	public function test_anonymous_callers_get_401(): void {
		$this->controller();
		Functions\when( 'is_user_logged_in' )->justReturn( false );
		$this->assertSame( 401, $this->permission( '/signatures/(?P<id>\d+)', 'GET' )->get_error_data()['status'] );
	}

	public function test_saving_on_behalf_writes_the_owners_row_without_link_restrictions_and_is_announced(): void {
		$this->as_manager();
		$service = $this->createMock( SignatureService::class );
		$service->expects( $this->once() )->method( 'update' )
			->with( self::SIGNATURE, self::OWNER, $this->arrayHasKey( 'json_content' ), true )
			->willReturn( self::row() );
		$service->method( 'last_sanitization_notes' )->willReturn( [] );
		Actions\expectDone( 'imgsig/signature/edited_on_behalf' )->once()
			->with( \Mockery::type( Signature::class ), self::MANAGER, [ 'json_content', 'html' ] );

		$response = $this->controller( $service )->update(
			new \WP_REST_Request(
				[
					'id'           => self::SIGNATURE,
					'json_content' => [ 'schema_version' => '1.1' ],
					'html'         => '<table></table>',
				]
			)
		);

		$this->assertTrue( $response->get_data()['on_behalf'] );
	}

	public function test_the_owners_own_save_is_untrusted_and_not_announced(): void {
		$this->as_owner();
		$service = $this->createMock( SignatureService::class );
		$service->expects( $this->once() )->method( 'update' )
			->with( self::SIGNATURE, self::OWNER, [ 'name' => 'Mine' ], false )
			->willReturn( self::row() );
		$service->method( 'last_sanitization_notes' )->willReturn( [] );
		Actions\expectDone( 'imgsig/signature/edited_on_behalf' )->never();

		$response = $this->controller( $service )->update(
			new \WP_REST_Request(
				[
					'id'   => self::SIGNATURE,
					'name' => 'Mine',
				]
			)
		);

		$this->assertArrayNotHasKey( 'on_behalf', $response->get_data() );
	}

	public function test_read_on_behalf_returns_the_owners_row_flagged(): void {
		$this->as_manager();
		$data = $this->controller()->show( new \WP_REST_Request( [ 'id' => self::SIGNATURE ] ) )->get_data();
		$this->assertSame( self::OWNER, $data['user_id'] );
		$this->assertTrue( $data['on_behalf'] );

		$this->as_other_user();
		$this->assertInstanceOf( \WP_Error::class, $this->controller()->show( new \WP_REST_Request( [ 'id' => self::SIGNATURE ] ) ) );
	}

	public function test_editor_bootstrap_compiles_with_the_owners_inputs(): void {
		$this->as_manager();
		$this->stub_bootstrap_inputs();

		$owner = EditorAssetEnqueuer::on_behalf_owner( self::SIGNATURE, $this->repo() );
		$this->assertInstanceOf( \WP_User::class, $owner );
		$this->assertSame( self::OWNER, $owner->ID );

		$viewer  = new \WP_User(
			[
				'ID'           => self::MANAGER,
				'display_name' => 'Admin Person',
			]
		);
		$context = EditorAssetEnqueuer::owner_context( self::SIGNATURE, $viewer, $owner, [ 'brand_kit' => null, 'compliance_footer' => [ 'enabled' => false, 'html' => '' ] ] );

		$this->assertSame( 'María López', $context['systemVariables']['wp_display_name'] );
		$this->assertSame( 'maria@acme.test', $context['systemVariables']['wp_email'] );
		$this->assertSame( 'pt_BR', $context['signatureLocale'], "The output language is the owner's." );
		$this->assertSame(
			[
				'userId'      => self::OWNER,
				'displayName' => 'María López',
				'email'       => 'maria@acme.test',
			],
			$context['onBehalfOf']
		);
		$this->assertStringContainsString( 'page=imagina-signatures-team', $context['signaturesUrl'] );
		$this->assertStringContainsString( 'profile=5', $context['profileUrl'] );

		$own = EditorAssetEnqueuer::owner_context( self::SIGNATURE, $viewer, null, [ 'brand_kit' => null, 'compliance_footer' => [ 'enabled' => false, 'html' => '' ] ] );
		$this->assertSame( 'Admin Person', $own['systemVariables']['wp_display_name'] );
		$this->assertNull( $own['onBehalfOf'] );
	}

	public function test_editor_bootstrap_has_no_owner_without_manage_team_or_for_own_signatures(): void {
		$this->as_other_user();
		$this->assertNull( EditorAssetEnqueuer::on_behalf_owner( self::SIGNATURE, $this->repo() ) );

		$this->as_owner();
		$this->assertNull( EditorAssetEnqueuer::on_behalf_owner( self::SIGNATURE, $this->repo() ) );
		$this->assertNull( EditorAssetEnqueuer::on_behalf_owner( 0, $this->repo() ) );
	}

	public function test_editor_page_opens_for_a_team_manager_and_refuses_others(): void {
		Functions\when( 'wp_die' )->alias(
			static function ( $message ): void {
				throw new \RuntimeException( 'wp_die: ' . $message );
			}
		);
		$page = new EditorPage( $this->repo() );
		$_GET['id'] = (string) self::SIGNATURE; // phpcs:ignore WordPress.Security.NonceVerification

		try {
			$this->as_manager();
			ob_start();
			$page->render();
			$this->assertStringContainsString( 'imagina-editor-root', (string) ob_get_clean() );

			$this->as_other_user();
			$this->expectException( \RuntimeException::class );
			$page->render();
		} finally {
			unset( $_GET['id'] );
		}
	}

	/**
	 * Stand-ins for what RenderInputs reads (no group, no campaign).
	 */
	private function stub_bootstrap_inputs(): void {
		if ( ! defined( 'IMGSIG_FILE' ) ) {
			define( 'IMGSIG_FILE', '/var/www/wp-content/plugins/imagina-signatures/imagina-signatures.php' );
		}
		Functions\when( 'get_option' )->alias(
			static function ( $name, $default = false ) {
				return $default;
			}
		);
		Functions\when( 'get_user_meta' )->justReturn( '' );
		Functions\when( 'wp_get_object_terms' )->justReturn( [] );
		Functions\when( 'current_time' )->justReturn( '2026-11-05' );
		Functions\when( 'get_user_locale' )->alias(
			static function ( $user_id ): string {
				return self::OWNER === (int) $user_id ? 'pt_BR' : 'es_ES';
			}
		);
		Functions\when( 'plugins_url' )->justReturn( 'https://example.com/wp-content/plugins/imagina-signatures/assets' );
		Functions\when( 'untrailingslashit' )->alias(
			static function ( $value ): string {
				return rtrim( (string) $value, '/\\' );
			}
		);
		Functions\when( 'admin_url' )->alias(
			static function ( $path = '' ): string {
				return 'https://example.com/wp-admin/' . $path;
			}
		);
	}
}
