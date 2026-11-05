<?php
/**
 * Unit tests for template assignment (`POST /admin/templates/:id/assign`)
 * and propagation on template update.
 *
 * @package ImaginaSignatures\Tests\Unit\Api
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Api;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Api\Controllers\TemplatesController;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Models\Template;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Repositories\TemplateRepository;
use ImaginaSignatures\Services\HtmlSanitizer;
use ImaginaSignatures\Services\JsonSchemaValidator;
use ImaginaSignatures\Services\SchemaSanitizer;
use ImaginaSignatures\Services\SignatureService;
use ImaginaSignatures\Services\TemplateAssignmentService;
use ImaginaSignatures\Services\TemplateLink;
use ImaginaSignatures\Services\TemplatePropagator;
use ImaginaSignatures\Services\TemplateService;
use ImaginaSignatures\Tests\Unit\Services\TemplateLinkTest;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../Services/TemplateLinkTest.php';

/**
 * @covers \ImaginaSignatures\Api\Controllers\TemplatesController
 * @covers \ImaginaSignatures\Services\TemplateAssignmentService
 */
final class TemplateAssignTest extends TestCase {

	/** @var array<string, bool> Caps of the current (administrator) user. */
	private array $caps = [];

	/** @var int[] Users that may NOT use signatures. */
	private array $no_use = [];

	/** @var array<int, array<string, mixed>> Rows inserted. */
	private array $inserted = [];

	/** @var array<int, array<string, mixed>> Updates by signature id. */
	private array $updated = [];

	/** @var array<int, Signature> Existing signature per user id. */
	private array $existing = [];

	/** @var array<int, int> Primary signature per user. */
	private array $primary = [];

	/** @var array<int, array<string, mixed>> register_rest_route() calls. */
	private array $routes = [];

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		imgsig_tests_load_kses();

		$this->caps     = [];
		$this->no_use   = [];
		$this->inserted = [];
		$this->updated  = [];
		$this->existing = [];
		$this->primary  = [];
		$this->routes   = [];

		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'sanitize_text_field' )->alias( 'trim' );
		Functions\when( 'sanitize_key' )->alias( 'strtolower' );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'wp_strip_all_tags' )->alias( 'strip_tags' );
		Functions\when( 'is_user_logged_in' )->justReturn( true );
		Functions\when( 'current_user_can' )->alias(
			function ( $cap ): bool {
				return ! empty( $this->caps[ $cap ] );
			}
		);
		Functions\when( 'user_can' )->alias(
			function ( $user_id, $cap ): bool {
				return 'imgsig_use_signatures' === $cap && ! in_array( (int) $user_id, $this->no_use, true );
			}
		);
		Functions\when( 'get_user_meta' )->alias(
			function ( $user_id ) {
				return (string) ( $this->primary[ (int) $user_id ] ?? '' );
			}
		);
		Functions\when( 'update_user_meta' )->alias(
			function ( $user_id, $key, $value ): bool {
				$this->primary[ (int) $user_id ] = (int) $value;
				return true;
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
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	private function template( string $mode = TemplateLink::MODE_LOCKED_DESIGN ): Template {
		return Template::from_row(
			[
				'id'           => 4,
				'slug'         => 'corp',
				'name'         => 'Corporate',
				'json_content' => (string) json_encode( TemplateLinkTest::template( $mode ) ),
			]
		);
	}

	private function controller( ?TemplatePropagator $propagator = null ): TemplatesController {
		$signature_repo = $this->createMock( SignatureRepository::class );
		$signature_repo->method( 'find_latest_by_user_and_template' )->willReturnCallback(
			function ( int $user_id ): ?Signature {
				return $this->existing[ $user_id ] ?? null;
			}
		);
		$signature_repo->method( 'insert' )->willReturnCallback(
			function ( array $data ): Signature {
				$this->inserted[] = $data;
				return Signature::from_row( $data + [ 'id' => 1000 + count( $this->inserted ) ] );
			}
		);
		$signature_repo->method( 'find_owned_by' )->willReturnCallback(
			function ( int $id, int $user_id ): ?Signature {
				foreach ( $this->existing as $signature ) {
					if ( $signature->id === $id && $signature->user_id === $user_id ) {
						return $signature;
					}
				}
				foreach ( $this->inserted as $index => $data ) {
					if ( 1001 + $index === $id && (int) $data['user_id'] === $user_id ) {
						return Signature::from_row( $data + [ 'id' => $id ] );
					}
				}
				return null;
			}
		);
		$signature_repo->method( 'update' )->willReturnCallback(
			function ( int $id, array $data ): Signature {
				$this->updated[ $id ] = $data;
				foreach ( $this->existing as $signature ) {
					if ( $signature->id === $id ) {
						return Signature::from_row( array_merge( (array) $signature, $data ) );
					}
				}
				return Signature::from_row( $data + [ 'id' => $id ] );
			}
		);

		$template_repo = $this->createMock( TemplateRepository::class );
		$template_repo->method( 'find' )->willReturn( $this->template() );

		$signatures = new SignatureService( $signature_repo, new JsonSchemaValidator(), new SchemaSanitizer( new HtmlSanitizer() ), $template_repo );

		return new TemplatesController(
			new TemplateService( $template_repo, new JsonSchemaValidator() ),
			$template_repo,
			$signatures,
			$signature_repo,
			new TemplateAssignmentService( $signatures, $signature_repo ),
			$propagator
		);
	}

	/**
	 * @param array<string, mixed> $params Body.
	 *
	 * @return array<string, mixed>
	 */
	private function assign( array $params ): array {
		$response = $this->controller()->assign( new \WP_REST_Request( [ 'id' => 4 ] + $params ) );
		$this->assertInstanceOf( \WP_REST_Response::class, $response );
		return (array) $response->get_data();
	}

	public function test_assign_requires_the_manage_team_capability(): void {
		$this->controller()->register_routes();
		$route = '/admin/templates/(?P<id>\d+)/assign';
		$this->assertArrayHasKey( $route, $this->routes );
		$permission = $this->routes[ $route ][0]['permission_callback'];

		$this->caps = [ 'imgsig_manage_templates' => true ];
		$denied     = $permission();
		$this->assertInstanceOf( \WP_Error::class, $denied );
		$this->assertSame( 403, $denied->get_error_data()['status'] );

		$this->caps = [ 'imgsig_manage_team' => true ];
		$this->assertTrue( $permission() );
	}

	public function test_linked_mode_creates_linked_signatures_built_from_the_template(): void {
		$result = $this->assign(
			[
				'user_ids' => [ 7, 8, 9 ],
				'mode'     => 'linked',
			]
		);

		$this->assertSame( 3, $result['processed'] );
		$this->assertSame( 3, $result['created'] );
		$this->assertNull( $result['next_offset'] );
		$this->assertSame( [ 7, 8, 9 ], array_map( 'intval', array_column( $this->inserted, 'user_id' ) ) );
		foreach ( $this->inserted as $row ) {
			$this->assertSame( 'linked', $row['link_mode'] );
			$this->assertSame( 4, $row['template_id'] );
			$schema = json_decode( (string) $row['json_content'], true );
			$this->assertSame( 'locked_design', $schema['settings']['employee_mode'] );
			$this->assertTrue( $schema['blocks'][0]['locked'] );
		}
	}

	public function test_copy_mode_creates_detached_copies_and_skips_users_who_have_one(): void {
		$this->existing[8] = Signature::from_row( [ 'id' => 55, 'user_id' => 8, 'template_id' => 4, 'json_content' => '{}' ] );

		$result = $this->assign(
			[
				'user_ids' => [ 7, 8 ],
				'mode'     => 'copy',
			]
		);

		$this->assertSame( 1, $result['created'] );
		$this->assertSame( 1, $result['skipped'] );
		$this->assertCount( 1, $this->inserted );
		$this->assertSame( 'detached', $this->inserted[0]['link_mode'] );
		$this->assertArrayNotHasKey( 'overrides', json_decode( (string) $this->inserted[0]['json_content'], true ) );
	}

	public function test_linked_mode_relinks_an_existing_signature_keeping_its_data(): void {
		$own = [
			'schema_version' => '1.1',
			'meta'           => [ 'created_at' => 'c' ],
			'canvas'         => [ 'width' => 500 ],
			'blocks'         => [],
			'variables'      => [ 'tagline' => 'Mine' ],
			'overrides'      => [ 'bio' => [ 'content' => '<p>Mine</p>' ] ],
		];
		$this->existing[7] = Signature::from_row(
			[
				'id'           => 55,
				'user_id'      => 7,
				'template_id'  => 4,
				'link_mode'    => 'detached',
				'json_content' => (string) json_encode( $own ),
			]
		);

		$result = $this->assign(
			[
				'user_ids'     => [ 7 ],
				'mode'         => 'linked',
				'make_primary' => true,
			]
		);

		$this->assertSame( 1, $result['updated'] );
		$this->assertSame( 'linked', $this->updated[55]['link_mode'] );
		$schema = json_decode( (string) $this->updated[55]['json_content'], true );
		$this->assertSame( 'Mine', $schema['variables']['tagline'] );
		$this->assertSame( '<p>Mine</p>', TemplateLink::index_blocks( $schema['blocks'] )['bio']['block']['content'] );
		$this->assertSame( 55, $this->primary[7] );
	}

	public function test_an_up_to_date_linked_signature_is_skipped(): void {
		$this->existing[7] = Signature::from_row(
			[
				'id'           => 55,
				'user_id'      => 7,
				'template_id'  => 4,
				'link_mode'    => 'linked',
				'json_content' => (string) json_encode( TemplateLink::refresh( TemplateLinkTest::template(), [] ) ),
			]
		);

		$result = $this->assign( [ 'user_ids' => [ 7 ] ] );

		$this->assertSame( 1, $result['skipped'] );
		$this->assertSame( [], $this->updated );
	}

	public function test_users_are_processed_in_chunks_of_50(): void {
		$ids = range( 1, 120 );

		$first = $this->assign( [ 'user_ids' => $ids ] );
		$this->assertSame( 50, $first['processed'] );
		$this->assertSame( 120, $first['total'] );
		$this->assertSame( 50, $first['next_offset'] );

		$last = $this->assign(
			[
				'user_ids' => $ids,
				'offset'   => 100,
			]
		);
		$this->assertSame( 20, $last['processed'] );
		$this->assertNull( $last['next_offset'] );
		$this->assertSame( range( 1, 50 ), array_slice( array_map( 'intval', array_column( $this->inserted, 'user_id' ) ), 0, 50 ) );
	}

	public function test_targets_merge_users_groups_and_role_and_keep_signature_users_only(): void {
		$this->no_use = [ 12 ];
		Functions\when( 'taxonomy_exists' )->justReturn( true );
		Functions\expect( 'get_objects_in_term' )->once()->with( [ 3 ], 'imgsig_group' )->andReturn( [ '11', '12' ] );
		Functions\when( 'get_users' )->justReturn( [ '20', '7' ] );

		$service = new TemplateAssignmentService( $this->createMock( SignatureService::class ), $this->createMock( SignatureRepository::class ) );

		$this->assertSame(
			[ 7, 11, 20 ],
			$service->resolve_user_ids(
				[
					'user_ids'  => [ 7 ],
					'group_ids' => [ 3 ],
					'role'      => 'sales',
				]
			)
		);
	}

	public function test_all_targets_every_signature_user(): void {
		Functions\expect( 'get_users' )->once()->with(
			[
				'capability' => 'imgsig_use_signatures',
				'fields'     => 'ID',
			]
		)->andReturn( [ '9', '3' ] );

		$result = $this->assign(
			[
				'all'  => true,
				'mode' => 'copy',
			]
		);

		$this->assertSame( 2, $result['total'] );
		$this->assertSame( [ 3, 9 ], array_map( 'intval', array_column( $this->inserted, 'user_id' ) ) );
	}

	public function test_groups_are_ignored_when_the_taxonomy_does_not_exist(): void {
		Functions\when( 'taxonomy_exists' )->justReturn( false );
		Functions\expect( 'get_objects_in_term' )->never();

		$service = new TemplateAssignmentService( $this->createMock( SignatureService::class ), $this->createMock( SignatureRepository::class ) );

		$this->assertSame( [], $service->resolve_user_ids( [ 'group_ids' => [ 3 ] ] ) );
	}

	public function test_no_matching_user_is_a_400(): void {
		$this->no_use = [ 7 ];
		$response     = $this->controller()->assign( new \WP_REST_Request( [ 'id' => 4, 'user_ids' => [ 7 ] ] ) );

		$this->assertInstanceOf( \WP_Error::class, $response );
		$this->assertSame( 400, $response->get_error_data()['status'] );
	}

	public function test_legacy_bulk_apply_delegates_in_copy_mode(): void {
		$this->existing[8] = Signature::from_row( [ 'id' => 55, 'user_id' => 8, 'template_id' => 4, 'json_content' => '{}' ] );

		$response = $this->controller()->bulk_apply(
			new \WP_REST_Request(
				[
					'id'            => 4,
					'scope'         => 'users:7,8',
					'skip_existing' => true,
				]
			)
		);

		$this->assertInstanceOf( \WP_REST_Response::class, $response );
		$data = $response->get_data();
		$this->assertSame( 2, $data['targeted'] );
		$this->assertSame( 1, $data['created'] );
		$this->assertSame( 1, $data['skipped'] );
		$this->assertSame( 'detached', $this->inserted[0]['link_mode'] );
	}

	public function test_updating_the_design_propagates_but_metadata_edits_do_not(): void {
		Functions\when( 'sanitize_title' )->alias( 'strtolower' );
		$propagator = $this->createMock( TemplatePropagator::class );
		$propagator->expects( $this->once() )->method( 'propagate' )->with( 4 )->willReturn( [ 'status' => 'done' ] );
		$controller = $this->controller( $propagator );

		$meta_only = $controller->update( new \WP_REST_Request( [ 'id' => 4, 'name' => 'Renamed' ] ) );
		$this->assertArrayNotHasKey( 'propagation', $meta_only->get_data() );

		$design = $controller->update(
			new \WP_REST_Request(
				[
					'id'           => 4,
					'json_content' => TemplateLinkTest::template(),
				]
			)
		);
		$this->assertSame( [ 'status' => 'done' ], $design->get_data()['propagation'] );
	}
}
