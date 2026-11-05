<?php
/**
 * Unit tests for the team console endpoints (stale list, render
 * context, storing HTML compiled by an administrator).
 *
 * @package ImaginaSignatures\Tests\Unit\Api
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Api;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Api\Controllers\TeamSignaturesController;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Services\HtmlSanitizer;
use ImaginaSignatures\Services\JsonSchemaValidator;
use ImaginaSignatures\Services\SchemaSanitizer;
use ImaginaSignatures\Services\SignatureService;
use ImaginaSignatures\Tests\Unit\Settings\BrandKitStubs;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../Settings/BrandKitStubs.php';

/**
 * @covers \ImaginaSignatures\Api\Controllers\TeamSignaturesController
 * @covers \ImaginaSignatures\Services\SignatureService::store_html
 */
final class TeamSignaturesControllerTest extends TestCase {

	use BrandKitStubs;

	/** @var array<string, bool> */
	private array $caps = [];

	/** @var array<int, array<string, mixed>> */
	private array $routes = [];

	/** @var array<string, mixed>|null */
	private ?array $written = null;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		imgsig_tests_load_kses();
		$this->stub_sanitizers();
		$this->caps    = [];
		$this->routes  = [];
		$this->written = null;

		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'wp_strip_all_tags' )->alias( 'strip_tags' );
		Functions\when( 'get_option' )->alias(
			static function ( $name, $default = false ) {
				return $default;
			}
		);
		Functions\when( 'current_time' )->justReturn( '2026-11-05' );
		Functions\when( 'get_user_locale' )->justReturn( 'es_ES' );
		// SystemVariables adds imgsig_assets_url (template placeholder art).
		if ( ! defined( 'IMGSIG_FILE' ) ) {
			define( 'IMGSIG_FILE', '/var/www/wp-content/plugins/imagina-signatures/imagina-signatures.php' );
		}
		Functions\when( 'plugins_url' )->justReturn( 'https://example.com/wp-content/plugins/imagina-signatures/assets' );
		Functions\when( 'untrailingslashit' )->alias(
			static function ( $value ): string {
				return rtrim( (string) $value, '/\\' );
			}
		);
		Functions\when( 'get_user_meta' )->justReturn( '' );
		Functions\when( 'is_user_logged_in' )->justReturn( true );
		Functions\when( 'current_user_can' )->alias(
			function ( $cap ): bool {
				return ! empty( $this->caps[ $cap ] );
			}
		);
		Functions\when( 'rest_ensure_response' )->alias(
			static function ( $data ) {
				return $data instanceof \WP_REST_Response ? $data : new \WP_REST_Response( $data );
			}
		);
		Functions\when( 'register_rest_route' )->alias(
			function ( $namespace, $route, $args ): bool {
				$this->routes[ $route ] = $args;
				return true;
			}
		);
		// The administrator viewing the console…
		Functions\when( 'wp_get_current_user' )->justReturn(
			new \WP_User(
				[
					'ID'           => 1,
					'display_name' => 'Admin Person',
					'user_email'   => 'admin@acme.test',
				]
			)
		);
		// …and the employee who owns signature 5.
		Functions\when( 'get_userdata' )->alias(
			static function ( $user_id ) {
				return 3 === (int) $user_id
					? new \WP_User(
						[
							'ID'           => 3,
							'display_name' => 'Ana Employee',
							'user_email'   => 'ana@acme.test',
							'first_name'   => 'Ana',
						]
					)
					: false;
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	private function row(): Signature {
		return Signature::from_row(
			[
				'id'           => 5,
				'user_id'      => 3,
				'name'         => 'Ana main',
				'template_id'  => 4,
				'link_mode'    => 'linked',
				'json_content' => '{"schema_version":"1.1","meta":{},"canvas":{},"blocks":[],"variables":{}}',
				'html_cache'   => '<table></table>',
				'compiled_at'  => '2026-11-05 09:00:00',
				'updated_at'   => '2026-11-05 10:00:00',
			]
		);
	}

	private function controller(): TeamSignaturesController {
		$repo = $this->createMock( SignatureRepository::class );
		$repo->method( 'find' )->willReturnCallback(
			function ( int $id ): ?Signature {
				return 5 === $id ? $this->row() : null;
			}
		);
		$repo->method( 'find_owned_by' )->willReturnCallback(
			function ( int $id, int $user_id ): ?Signature {
				return 5 === $id && 3 === $user_id ? $this->row() : null;
			}
		);
		$repo->method( 'update' )->willReturnCallback(
			function ( int $id, array $data ): Signature {
				$this->written = $data;
				return Signature::from_row(
					[
						'id'          => $id,
						'user_id'     => 3,
						'html_cache'  => $data['html_cache'] ?? null,
						'compiled_at' => '2026-11-05 11:00:00',
						'updated_at'  => '2026-11-05 11:00:00',
					]
				);
			}
		);
		$repo->method( 'find_stale' )->willReturn( [ $this->row() ] );
		$repo->method( 'count_stale' )->willReturn( 41 );

		return new TeamSignaturesController(
			$repo,
			new SignatureService( $repo, new JsonSchemaValidator(), new SchemaSanitizer( new HtmlSanitizer() ) )
		);
	}

	public function test_every_route_requires_manage_team(): void {
		$this->controller()->register_routes();
		$this->assertCount( 3, $this->routes );

		foreach ( $this->routes as $route => $args ) {
			$permission = $args[0]['permission_callback'];

			$this->caps = [ 'imgsig_manage_templates' => true, 'imgsig_use_signatures' => true ];
			$this->assertInstanceOf( \WP_Error::class, $permission(), $route );

			$this->caps = [ 'imgsig_manage_team' => true ];
			$this->assertTrue( $permission(), $route );
		}
	}

	public function test_stale_lists_summaries_with_pagination_headers(): void {
		$response = $this->controller()->stale( new \WP_REST_Request( [ 'per_page' => 20 ] ) );

		$this->assertSame(
			[
				[
					'id'          => 5,
					'user_id'     => 3,
					'name'        => 'Ana main',
					'template_id' => 4,
					'link_mode'   => 'linked',
					'status'      => 'draft',
					'updated_at'  => '2026-11-05 10:00:00',
					'compiled_at' => '2026-11-05 09:00:00',
				],
			],
			$response->get_data()
		);
		$this->assertSame( '41', $response->headers['X-WP-Total'] ?? null );
		$this->assertSame( '3', $response->headers['X-WP-TotalPages'] ?? null );
	}

	public function test_render_context_carries_the_target_users_system_variables(): void {
		$response = $this->controller()->render_context( new \WP_REST_Request( [ 'id' => 5 ] ) );

		$this->assertInstanceOf( \WP_REST_Response::class, $response );
		$data = $response->get_data();
		$this->assertSame( 'Ana Employee', $data['systemVariables']['wp_display_name'] );
		$this->assertSame( 'ana@acme.test', $data['systemVariables']['wp_email'] );
		$this->assertSame( 'Ana', $data['systemVariables']['wp_first_name'] );
		$this->assertArrayHasKey( 'company_name', $data['systemVariables'] );
		$this->assertSame( 'es_ES', $data['locale'] );
		$this->assertSame( '2026-11-05 10:00:00', $data['updated_at'] );
		$this->assertSame( [ 'enabled' => false, 'html' => '' ], $data['complianceFooter'] );
		$this->assertSame( [], $data['bannerCampaigns'] );
		$this->assertSame( '1.1', $data['json_content']['schema_version'] );
	}

	public function test_render_context_of_a_missing_signature_is_404(): void {
		$response = $this->controller()->render_context( new \WP_REST_Request( [ 'id' => 99 ] ) );

		$this->assertInstanceOf( \WP_Error::class, $response );
		$this->assertSame( 404, $response->get_error_data()['status'] );
	}

	public function test_html_is_stored_through_the_signature_service(): void {
		$response = $this->controller()->store_html(
			new \WP_REST_Request(
				[
					'id'                  => 5,
					'html'                => '<table role="presentation"><tr><td>Ana<script>x()</script></td></tr></table>',
					'text'                => 'Ana',
					'expected_updated_at' => '2026-11-05 10:00:00',
				]
			)
		);

		$this->assertInstanceOf( \WP_REST_Response::class, $response );
		$this->assertIsArray( $this->written );
		$this->assertStringNotContainsString( '<script', (string) $this->written['html_cache'] );
		$this->assertSame( hash( 'sha256', (string) $this->written['html_cache'] ), $this->written['html_hash'] );
		$this->assertSame( 'Ana', $this->written['html_text'] );
		$this->assertArrayNotHasKey( 'json_content', $this->written );
		$this->assertFalse( $response->get_data()['html_stale'] );
	}

	public function test_html_compiled_from_an_older_design_is_a_conflict(): void {
		$response = $this->controller()->store_html(
			new \WP_REST_Request(
				[
					'id'                  => 5,
					'html'                => '<table></table>',
					'expected_updated_at' => '2026-11-05 08:00:00',
				]
			)
		);

		$this->assertInstanceOf( \WP_Error::class, $response );
		$this->assertSame( 409, $response->get_error_data()['status'] );
		$this->assertNull( $this->written );
	}
}
