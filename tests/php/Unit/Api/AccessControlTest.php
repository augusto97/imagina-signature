<?php
/**
 * Unit tests for read-side access control fixes (templates, site
 * settings, frontend-access PATCH merge).
 *
 * @package ImaginaSignatures\Tests\Unit\Api
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Api;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Api\Controllers\FrontendAccessController;
use ImaginaSignatures\Api\Controllers\SiteSettingsController;
use ImaginaSignatures\Api\Controllers\TemplatesController;
use ImaginaSignatures\Models\Template;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Repositories\TemplateRepository;
use ImaginaSignatures\Services\JsonSchemaValidator;
use ImaginaSignatures\Services\SignatureService;
use ImaginaSignatures\Services\TemplateService;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Api\Controllers\TemplatesController::show
 * @covers \ImaginaSignatures\Api\Controllers\SiteSettingsController::show
 * @covers \ImaginaSignatures\Api\Controllers\FrontendAccessController::update
 * @covers \ImaginaSignatures\Frontend\FrontendAccess::update
 */
final class AccessControlTest extends TestCase {

	/** @var array<string, bool> */
	private array $caps = [];

	/** @var array<int, string> */
	private array $roles = [ 'subscriber' ];

	/** @var array<string, mixed> */
	private array $options = [];

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		$this->caps    = [];
		$this->roles   = [ 'subscriber' ];
		$this->options = [];

		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'sanitize_key' )->alias(
			static function ( $key ): string {
				return (string) preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $key ) );
			}
		);
		Functions\when( 'current_user_can' )->alias(
			function ( $cap ): bool {
				return ! empty( $this->caps[ $cap ] );
			}
		);
		Functions\when( 'wp_get_current_user' )->alias(
			function () {
				return (object) [ 'roles' => $this->roles ];
			}
		);
		Functions\when( 'get_option' )->alias(
			function ( $name, $default = false ) {
				return array_key_exists( $name, $this->options ) ? $this->options[ $name ] : $default;
			}
		);
		Functions\when( 'update_option' )->alias(
			function ( $name, $value ): bool {
				$this->options[ $name ] = $value;
				return true;
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
	 * @param array<int, string> $visible_to_roles Scope.
	 */
	private function templates_controller( array $visible_to_roles ): TemplatesController {
		$repo = $this->createMock( TemplateRepository::class );
		$repo->method( 'find' )->willReturn(
			Template::from_row(
				[
					'id'               => 3,
					'slug'             => 'exec',
					'name'             => 'Executive',
					'json_content'     => '{}',
					'visible_to_roles' => implode( ',', $visible_to_roles ),
				]
			)
		);

		return new TemplatesController(
			new TemplateService( $repo, new JsonSchemaValidator() ),
			$repo,
			$this->createMock( SignatureService::class ),
			$this->createMock( SignatureRepository::class )
		);
	}

	public function test_template_show_hides_role_scoped_templates_from_other_roles(): void {
		$result = $this->templates_controller( [ 'editor' ] )->show( new \WP_REST_Request( [ 'id' => 3 ] ) );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'imgsig_not_found', $result->get_error_code() );
		$this->assertSame( 404, $result->get_error_data()['status'] );
	}

	public function test_template_show_allows_matching_role_unscoped_and_managers(): void {
		$this->roles = [ 'editor' ];
		$this->assertInstanceOf( \WP_REST_Response::class, $this->templates_controller( [ 'editor', 'author' ] )->show( new \WP_REST_Request( [ 'id' => 3 ] ) ) );

		$this->roles = [ 'subscriber' ];
		$this->assertInstanceOf( \WP_REST_Response::class, $this->templates_controller( [] )->show( new \WP_REST_Request( [ 'id' => 3 ] ) ) );

		$this->caps['imgsig_manage_templates'] = true;
		$this->assertInstanceOf( \WP_REST_Response::class, $this->templates_controller( [ 'editor' ] )->show( new \WP_REST_Request( [ 'id' => 3 ] ) ) );
	}

	public function test_site_settings_show_only_active_campaigns_to_non_admins(): void {
		Functions\when( 'current_time' )->justReturn( '2026-06-15' );
		Functions\when( 'esc_url_raw' )->returnArg( 1 );
		Functions\when( 'sanitize_text_field' )->alias( 'trim' );

		$this->options['imgsig_banner_campaigns'] = [
			[
				'id'        => 'live',
				'name'      => 'Summer',
				'enabled'   => true,
				'image_url' => 'https://cdn.example.com/a.png',
			],
			[
				'id'        => 'draft',
				'name'      => 'Secret launch',
				'enabled'   => false,
				'image_url' => 'https://cdn.example.com/b.png',
			],
			[
				'id'         => 'future',
				'name'       => 'Q4 pricing',
				'enabled'    => true,
				'image_url'  => 'https://cdn.example.com/c.png',
				'start_date' => '2026-10-01',
			],
		];

		$controller = new SiteSettingsController();

		$ids = array_column( $controller->show()->get_data()['banner_campaigns'], 'id' );
		$this->assertSame( [ 'live' ], $ids );

		$this->caps['imgsig_manage_storage'] = true;
		$ids                                 = array_column( $controller->show()->get_data()['banner_campaigns'], 'id' );
		$this->assertSame( [ 'live', 'draft', 'future' ], $ids );
	}

	public function test_frontend_access_patch_keeps_omitted_fields(): void {
		Functions\when( 'wp_roles' )->justReturn(
			(object) [
				'roles' => [
					'administrator' => [ 'name' => 'Administrator' ],
					'subscriber'    => [ 'name' => 'Subscriber' ],
					'customer'      => [ 'name' => 'Customer' ],
				],
			]
		);
		Functions\when( 'get_role' )->justReturn( null );
		Functions\when( 'translate_user_role' )->returnArg( 1 );
		Functions\when( 'home_url' )->alias(
			static function ( $path = '' ): string {
				return 'https://example.com' . $path;
			}
		);
		Functions\when( 'esc_url_raw' )->returnArg( 1 );
		Functions\when( 'rest_sanitize_boolean' )->alias(
			static function ( $value ): bool {
				return filter_var( $value, FILTER_VALIDATE_BOOLEAN );
			}
		);
		Functions\when( 'flush_rewrite_rules' )->justReturn( null );
		Functions\when( 'add_rewrite_rule' )->justReturn( null );

		$this->options['imgsig_frontend_access'] = [
			'enabled' => true,
			'slug'    => 'firmas',
			'roles'   => [ 'subscriber', 'customer' ],
		];

		$controller = new FrontendAccessController();

		// Slug-only PATCH: enabled + roles must survive.
		$data = $controller->update( new \WP_REST_Request( [ 'slug' => 'my-signatures' ] ) )->get_data();
		$this->assertTrue( $data['enabled'] );
		$this->assertSame( 'my-signatures', $data['slug'] );
		$this->assertSame( [ 'subscriber', 'customer' ], $data['roles'] );

		// Explicit values still apply.
		$data = $controller->update(
			new \WP_REST_Request(
				[
					'enabled' => false,
					'roles'   => [],
				]
			)
		)->get_data();
		$this->assertFalse( $data['enabled'] );
		$this->assertSame( [], $data['roles'] );
		$this->assertSame( 'my-signatures', $data['slug'] );
	}
}
