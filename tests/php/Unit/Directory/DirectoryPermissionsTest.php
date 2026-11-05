<?php
/**
 * REST permission + ownership tests for the directory endpoints and
 * the WP profile screen section.
 *
 * @package ImaginaSignatures\Tests\Unit\Directory
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Directory;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Api\Controllers\GroupsController;
use ImaginaSignatures\Api\Controllers\ProfileController;
use ImaginaSignatures\Api\Controllers\ProfileImportController;
use ImaginaSignatures\Directory\Groups;
use ImaginaSignatures\Directory\ProfileFields;
use ImaginaSignatures\Directory\ProfileScreen;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/DirectoryStubs.php';

/**
 * @covers \ImaginaSignatures\Api\Controllers\ProfileController
 * @covers \ImaginaSignatures\Api\Controllers\GroupsController
 * @covers \ImaginaSignatures\Api\Controllers\ProfileImportController::register_routes
 * @covers \ImaginaSignatures\Directory\ProfileScreen
 */
final class DirectoryPermissionsTest extends TestCase {

	use DirectoryStubs;

	/** @var array<string, array<int, array<string, mixed>>> */
	private array $routes = [];

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_directory();

		$this->routes = [];
		Functions\when( 'register_rest_route' )->alias(
			function ( $namespace, $route, $args ): bool {
				$this->routes[ $route ] = $args;
				return true;
			}
		);

		( new ProfileController() )->register_routes();
		( new GroupsController() )->register_routes();
		( new ProfileImportController() )->register_routes();

		$this->add_user( 5, 'sub@acme.com', [ 'roles' => [ 'subscriber' ] ] );
		$this->add_user( 9, 'other@acme.com' );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		$_POST = [];
		parent::tearDown();
	}

	/**
	 * @return array<int, array{0: string, 1: callable}>
	 */
	private function route_callbacks( bool $admin ): array {
		$out = [];
		foreach ( $this->routes as $route => $handlers ) {
			if ( ( 0 === strpos( $route, '/admin/' ) ) !== $admin ) {
				continue;
			}
			foreach ( $handlers as $handler ) {
				$out[] = [ $route . ' ' . $handler['methods'], $handler['permission_callback'] ];
			}
		}
		return $out;
	}

	public function test_every_route_is_registered_with_a_permission_callback(): void {
		$expected = [
			'/me/profile',
			'/admin/users/(?P<id>\d+)/profile',
			'/admin/profile-fields',
			'/admin/profile-fields/meta-keys',
			'/admin/groups',
			'/admin/groups/(?P<id>\d+)',
			'/admin/groups/(?P<id>\d+)/members',
			'/admin/users',
			'/admin/profiles/import',
		];
		$this->assertSame( $expected, array_keys( $this->routes ) );
		foreach ( $this->routes as $handlers ) {
			foreach ( $handlers as $handler ) {
				$this->assertIsCallable( $handler['permission_callback'] );
			}
		}
	}

	public function test_subscriber_cannot_reach_admin_routes(): void {
		$this->current_user = 5;
		$this->caps         = [ 'imgsig_use_signatures' => true ];

		$admin = $this->route_callbacks( true );
		$this->assertGreaterThanOrEqual( 13, count( $admin ) );
		foreach ( $admin as [ $label, $callback ] ) {
			$result = $callback();
			$this->assertInstanceOf( \WP_Error::class, $result, $label );
			$this->assertSame( 403, $result->get_error_data()['status'], $label );
		}

		foreach ( $this->route_callbacks( false ) as [ $label, $callback ] ) {
			$this->assertTrue( $callback(), $label );
		}
	}

	public function test_logged_out_gets_401_and_team_manager_passes(): void {
		foreach ( array_merge( $this->route_callbacks( true ), $this->route_callbacks( false ) ) as [ $label, $callback ] ) {
			$this->assertSame( 401, $callback()->get_error_data()['status'], $label );
		}

		$this->current_user = 1;
		$this->caps         = [
			'imgsig_use_signatures' => true,
			'imgsig_manage_team'    => true,
		];
		foreach ( $this->route_callbacks( true ) as [ $label, $callback ] ) {
			$this->assertTrue( $callback(), $label );
		}
	}

	public function test_me_profile_only_ever_writes_the_callers_profile(): void {
		$this->current_user = 5;
		$this->caps         = [ 'imgsig_use_signatures' => true ];

		$response = ( new ProfileController() )->update_own(
			new \WP_REST_Request(
				[
					'id'      => 9,
					'user_id' => 9,
					'values'  => [ 'job_title' => 'Intern' ],
				]
			)
		);

		$this->assertInstanceOf( \WP_REST_Response::class, $response );
		$this->assertSame( 5, $response->get_data()['user_id'] );
		$this->assertSame( 'Intern', $this->user_meta[5][ ProfileFields::META_KEY ]['job_title'] );
		$this->assertArrayNotHasKey( 9, $this->user_meta );
	}

	public function test_me_profile_payload_and_validation(): void {
		$this->current_user                                   = 5;
		$this->user_meta[5][ ProfileFields::META_KEY ]        = [ 'pronouns' => 'they/them' ];
		$group                                                = $this->add_term( 'Sales' );
		$this->relationships[5]                               = [ $group ];
		$this->options[ ProfileFields::OPTION ]['mapping']['phone'] = [
			'source'   => 'meta',
			'meta_key' => 'billing_phone',
		];

		$data = ( new ProfileController() )->show_own()->get_data();
		$this->assertSame( 'they/them', $data['values']['pronouns'] );
		$this->assertSame( 'Sales', $data['groups'][0]['name'] );
		$this->assertTrue( $data['fields'][2]['readonly'] );
		$this->assertSame( 'billing_phone', $data['fields'][2]['meta_key'] );
		$this->assertSame( 'sub@acme.com', $data['user']['email'] );

		$bad = ( new ProfileController() )->update_own( new \WP_REST_Request( [ 'values' => 'nope' ] ) );
		$this->assertInstanceOf( \WP_Error::class, $bad );
		$this->assertSame( 400, $bad->get_error_data()['status'] );
	}

	public function test_admin_profile_routes_target_the_given_user(): void {
		$this->current_user = 1;
		$controller         = new ProfileController();

		$response = $controller->update_user(
			new \WP_REST_Request(
				[
					'id'     => 9,
					'values' => [ 'department' => 'Legal' ],
				]
			)
		);
		$this->assertSame( 9, $response->get_data()['user_id'] );
		$this->assertSame( 'Legal', $this->user_meta[9][ ProfileFields::META_KEY ]['department'] );

		$missing = $controller->show_user( new \WP_REST_Request( [ 'id' => 404 ] ) );
		$this->assertInstanceOf( \WP_Error::class, $missing );
		$this->assertSame( 404, $missing->get_error_data()['status'] );
	}

	public function test_profile_fields_endpoint_sanitises_the_config(): void {
		$controller = new ProfileController();
		$data       = $controller->update_fields(
			new \WP_REST_Request(
				[
					'mapping' => [
						'phone' => [
							'source'   => 'meta',
							'meta_key' => 'user_pass',
						],
					],
					'custom'  => [
						[
							'key'   => 'team_code',
							'label' => 'Team code',
						],
					],
				]
			)
		)->get_data();

		$this->assertSame( 'plugin', $data['config']['mapping']['phone']['source'] );
		$this->assertSame( 'team_code', $data['fields'][10]['key'] );
		$this->assertSame( $data['config'], $this->options[ ProfileFields::OPTION ] );
	}

	public function test_groups_controller_crud_and_members(): void {
		$this->current_user = 1;
		$controller         = new GroupsController();

		$created = $controller->create( new \WP_REST_Request( [ 'name' => 'Marketing' ] ) );
		$this->assertSame( 201, $created->get_status() );
		$id = $created->get_data()['id'];

		$members = $controller->set_members(
			new \WP_REST_Request(
				[
					'id'       => $id,
					'user_ids' => [ 5, 9 ],
				]
			)
		)->get_data();
		$this->assertSame( [ 5, 9 ], $members['member_ids'] );
		$this->assertSame( [ 5, 9 ], $members['added'] );

		$bad = $controller->set_members( new \WP_REST_Request( [ 'id' => $id ] ) );
		$this->assertSame( 400, $bad->get_error_data()['status'] );

		$shown = $controller->show( new \WP_REST_Request( [ 'id' => $id ] ) )->get_data();
		$this->assertSame( 2, $shown['member_count'] );

		$this->assertSame( 'Growth', $controller->update( new \WP_REST_Request( [ 'id' => $id, 'name' => 'Growth' ] ) )->get_data()['name'] ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		$this->assertTrue( $controller->delete( new \WP_REST_Request( [ 'id' => $id ] ) )->get_data()['deleted'] );
		$this->assertSame( 404, $controller->show( new \WP_REST_Request( [ 'id' => $id ] ) )->get_error_data()['status'] );
	}

	public function test_user_row_shape(): void {
		$group                  = $this->add_term( 'Ops', [ Groups::META_COLOR => '#00ff00' ] );
		$this->relationships[9] = [ $group ];

		$row = GroupsController::user_row( $this->users[9] );
		$this->assertSame( 9, $row['id'] );
		$this->assertSame( 'other@acme.com', $row['email'] );
		$this->assertSame( [ 'author' ], $row['roles'] );
		$this->assertSame(
			[
				[
					'id'    => $group,
					'name'  => 'Ops',
					'color' => '#00ff00',
				],
			],
			$row['groups']
		);
		$this->assertTrue( $row['can_use'] );
	}

	public function test_profile_screen_edit_rules(): void {
		Functions\when( 'current_user_can' )->alias(
			function ( $cap, ...$args ): bool {
				return ! empty( $this->caps[ $cap ] );
			}
		);

		$this->assertFalse( ProfileScreen::can_edit( 5 ), 'logged out' );

		$this->current_user = 5;
		$this->assertFalse( ProfileScreen::can_edit( 5 ), 'no signature capability' );
		$this->caps['imgsig_use_signatures'] = true;
		$this->assertTrue( ProfileScreen::can_edit( 5 ), 'own profile' );
		$this->assertFalse( ProfileScreen::can_edit( 9 ), 'someone else' );

		$this->caps['edit_user'] = true;
		$this->assertFalse( ProfileScreen::can_edit( 9 ), 'edit_user alone is not enough' );
		$this->caps['imgsig_manage_team'] = true;
		$this->assertTrue( ProfileScreen::can_edit( 9 ) );
		unset( $this->caps['imgsig_manage_team'] );
		$this->caps['edit_users'] = true;
		$this->assertTrue( ProfileScreen::can_edit( 9 ) );
	}

	public function test_profile_screen_save_requires_its_nonce(): void {
		$nonce_ok = false;
		Functions\when( 'wp_unslash' )->returnArg( 1 );
		Functions\when( 'wp_verify_nonce' )->alias(
			function ( $nonce, $action ) use ( &$nonce_ok ) {
				return $nonce_ok && 'good' === $nonce && 'imgsig_profile_update_5' === $action ? 1 : false;
			}
		);
		Functions\when( 'absint' )->alias( static fn ( $v ): int => abs( (int) $v ) );

		$this->current_user = 5;
		$this->caps         = [ 'imgsig_use_signatures' => true ];
		$group              = $this->add_term( 'Sales' );

		$_POST = [
			'imgsig_profile' => [ 'job_title' => 'Lead' ],
			'imgsig_groups'  => [ (string) $group ],
			'imgsig_groups_present' => '1',
		];
		ProfileScreen::save( 5 );
		$this->assertArrayNotHasKey( 5, $this->user_meta, 'no nonce' );

		$_POST['imgsig_profile_nonce'] = 'good';
		ProfileScreen::save( 5 );
		$this->assertArrayNotHasKey( 5, $this->user_meta, 'bad nonce' );

		$nonce_ok = true;
		ProfileScreen::save( 5 );
		$this->assertSame( 'Lead', $this->user_meta[5][ ProfileFields::META_KEY ]['job_title'] );
		$this->assertSame( [], Groups::for_user( 5 ), 'groups need imgsig_manage_team' );

		$this->caps['imgsig_manage_team'] = true;
		ProfileScreen::save( 5 );
		$this->assertSame( [ $group ], Groups::for_user( 5 ) );
	}
}
