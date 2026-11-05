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
use Brain\Monkey\Actions;
use Brain\Monkey\Functions;
use ImaginaSignatures\Api\Controllers\TeamSignaturesController;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Services\HtmlSanitizer;
use ImaginaSignatures\Services\JsonSchemaValidator;
use ImaginaSignatures\Services\RenderInputs;
use ImaginaSignatures\Services\SchemaSanitizer;
use ImaginaSignatures\Services\SignatureService;
use ImaginaSignatures\Tests\Unit\Settings\BrandKitStubs;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../Settings/BrandKitStubs.php';

/**
 * @covers \ImaginaSignatures\Api\Controllers\TeamSignaturesController
 * @covers \ImaginaSignatures\Services\SignatureService::store_html
 * @covers \ImaginaSignatures\Services\RenderInputs
 */
final class TeamSignaturesControllerTest extends TestCase {

	use BrandKitStubs;

	/** @var array<string, bool> */
	private array $caps = [];

	/** @var array<int, array<string, mixed>> */
	private array $routes = [];

	/** @var array<string, mixed>|null */
	private ?array $written = null;

	/** @var array<string, mixed> Stored options. */
	private array $options = [];

	/** @var string html_hash of the stored row. */
	private string $stored_hash = 'old-hash';

	/** @var array<int, int[]> User => group ids. */
	private array $user_groups = [];

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
		$this->options     = [];
		$this->stored_hash = 'old-hash';
		// Ana (3) is in group 4; the administrator (1) in none.
		$this->user_groups = [ 3 => [ 4 ] ];
		Functions\when( 'get_option' )->alias(
			function ( $name, $default = false ) {
				return array_key_exists( $name, $this->options ) ? $this->options[ $name ] : $default;
			}
		);
		Functions\when( 'get_current_user_id' )->justReturn( 1 );
		Functions\when( 'sanitize_key' )->alias(
			static function ( $key ): string {
				return (string) preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $key ) );
			}
		);
		Functions\when( 'wp_get_object_terms' )->alias(
			function ( $user_id ) {
				return $this->user_groups[ (int) $user_id ] ?? [];
			}
		);
		Functions\when( 'get_term_meta' )->alias(
			static function ( $term_id, $key ) {
				return 4 === (int) $term_id && 'imgsig_footer_override' === $key
					? [
						'enabled' => true,
						'html'    => '<p>Sales legal notice</p>',
					]
					: '';
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
				'status'       => 'ready',
				'json_content' => '{"schema_version":"1.1","meta":{},"canvas":{},"blocks":[],"variables":{}}',
				'html_cache'   => '<table></table>',
				'html_hash'    => $this->stored_hash,
				'compiled_at'  => '2026-11-05 09:00:00',
				'updated_at'   => '2026-11-05 10:00:00',
			]
		);
	}

	/**
	 * @param array<string, mixed> $params Request params.
	 *
	 * @return mixed
	 */
	private function store( array $params ) {
		return $this->controller()->store_html( new \WP_REST_Request( $params + [ 'id' => 5 ] ) );
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
						'status'      => 'ready',
						'html_cache'  => $data['html_cache'] ?? null,
						'html_hash'   => $data['html_hash'] ?? $this->stored_hash,
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
					'status'      => 'ready',
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
		$this->assertSame( '1.1', $data['json_content']['schema_version'] );
		$this->assertSame( 'https://example.com/wp-content/plugins/imagina-signatures/assets', $data['pluginUrl'] );
		$this->assertContains( 'job_title', array_column( $data['profileFields'], 'key' ) );
		$this->assertMatchesRegularExpression( '/^[a-f0-9]{64}$/', $data['inputs_hash'] );
	}

	public function test_render_context_uses_the_owners_group_footer_and_targeted_campaigns(): void {
		$this->options['imgsig_compliance_footer'] = [
			'enabled' => true,
			'html'    => '<p>Global notice</p>',
		];
		$this->options['imgsig_banner_campaigns']  = [
			self::campaign( 'everyone', [] ),
			self::campaign( 'sales', [ 4 ] ),
			self::campaign( 'support', [ 9 ] ),
		];

		$data = $this->controller()->render_context( new \WP_REST_Request( [ 'id' => 5 ] ) )->get_data();

		// Ana's group 4 overrides the footer and is targeted by "sales" —
		// even though the administrator viewing the console is in no group.
		$this->assertSame(
			[
				'enabled' => true,
				'html'    => '<p>Sales legal notice</p>',
			],
			$data['complianceFooter']
		);
		$this->assertSame( [ 'everyone', 'sales' ], array_column( $data['bannerCampaigns'], 'id' ) );
	}

	public function test_store_refuses_html_compiled_from_inputs_that_changed_meanwhile(): void {
		$context = $this->controller()->render_context( new \WP_REST_Request( [ 'id' => 5 ] ) )->get_data();

		// Ana leaves her group (footer override) while the browser compiles.
		$this->user_groups = [];

		$response = $this->store(
			[
				'html'                 => '<table></table>',
				'expected_updated_at'  => '2026-11-05 10:00:00',
				'expected_inputs_hash' => $context['inputs_hash'],
			]
		);
		$this->assertInstanceOf( \WP_Error::class, $response );
		$this->assertSame( 409, $response->get_error_data()['status'] );
		$this->assertSame( 'inputs_changed', $response->get_error_data()['reason'] );
		$this->assertNull( $this->written );

		$fresh    = $this->controller()->render_context( new \WP_REST_Request( [ 'id' => 5 ] ) )->get_data();
		$response = $this->store(
			[
				'html'                 => '<table></table>',
				'expected_updated_at'  => '2026-11-05 10:00:00',
				'expected_inputs_hash' => $fresh['inputs_hash'],
			]
		);
		$this->assertInstanceOf( \WP_REST_Response::class, $response );
	}

	public function test_inputs_fingerprint_ignores_labels_and_order_but_not_values(): void {
		$inputs = [
			'systemVariables'  => [
				'job_title'       => 'CEO',
				'wp_display_name' => 'Ana',
			],
			'complianceFooter' => [
				'enabled' => false,
				'html'    => '',
			],
			'bannerCampaigns'  => [],
			'profileFields'    => [
				[
					'key'   => 'job_title',
					'label' => 'Job title',
				],
			],
			'locale'           => 'es_ES',
		];

		$relabelled                              = $inputs;
		$relabelled['profileFields'][0]['label'] = 'Cargo';
		$reordered                               = $inputs;
		$reordered['systemVariables']            = array_reverse( $inputs['systemVariables'], true );
		$promoted                                = $inputs;
		$promoted['systemVariables']['job_title'] = 'CTO';

		$this->assertSame( RenderInputs::fingerprint( $inputs ), RenderInputs::fingerprint( $relabelled ) );
		$this->assertSame( RenderInputs::fingerprint( $inputs ), RenderInputs::fingerprint( $reordered ) );
		$this->assertNotSame( RenderInputs::fingerprint( $inputs ), RenderInputs::fingerprint( $promoted ) );
	}

	public function test_a_recompiled_primary_with_new_html_fires_the_deploy_hook(): void {
		// Signature 5 is Ana's marked primary.
		Functions\when( 'get_user_meta' )->alias(
			static function ( $user_id, $key ) {
				return 3 === (int) $user_id && 'imgsig_primary_signature' === $key ? 5 : '';
			}
		);
		Actions\expectDone( 'imgsig/deploy/primary_html_changed' )->once()->with( 3, \Mockery::type( Signature::class ) );

		$response = $this->store( [ 'html' => '<table role="presentation"><tr><td>Ana López</td></tr></table>' ] );

		$this->assertInstanceOf( \WP_REST_Response::class, $response );
	}

	public function test_a_recompile_that_produces_the_same_html_deploys_nothing(): void {
		Functions\when( 'get_user_meta' )->alias(
			static function ( $user_id, $key ) {
				return 3 === (int) $user_id && 'imgsig_primary_signature' === $key ? 5 : '';
			}
		);
		$html              = '<table role="presentation"><tr><td>Ana</td></tr></table>';
		$this->stored_hash = hash( 'sha256', ( new HtmlSanitizer() )->sanitize_email_document( $html ) );
		Actions\expectDone( 'imgsig/deploy/primary_html_changed' )->never();

		$response = $this->store( [ 'html' => $html ] );

		$this->assertInstanceOf( \WP_REST_Response::class, $response );
		$this->assertFalse( $response->get_data()['html_stale'] );
	}

	/**
	 * @param int[] $groups Targeted groups.
	 *
	 * @return array<string, mixed>
	 */
	private static function campaign( string $id, array $groups ): array {
		return [
			'id'         => $id,
			'name'       => $id,
			'enabled'    => true,
			'image_url'  => 'https://cdn.acme.test/' . $id . '.png',
			'link_url'   => '',
			'alt'        => '',
			'width'      => 600,
			'start_date' => '',
			'end_date'   => '',
			'groups'     => $groups,
		];
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
