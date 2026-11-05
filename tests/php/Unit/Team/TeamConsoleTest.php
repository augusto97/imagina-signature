<?php
/**
 * Unit tests for GET /admin/team (TeamDirectory + controller).
 *
 * @package ImaginaSignatures\Tests\Unit\Team
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Team;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Api\Controllers\TeamConsoleController;
use ImaginaSignatures\Deployment\Gmail\GmailSettings;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Repositories\TemplateRepository;
use ImaginaSignatures\Team\TeamDirectory;
use PHPUnit\Framework\TestCase;

if ( ! defined( 'ARRAY_A' ) ) {
	define( 'ARRAY_A', 'ARRAY_A' );
}

/**
 * Answers the one usermeta SELECT of TeamDirectory::plugin_meta().
 */
final class Imgsig_Team_Wpdb extends \wpdb { // phpcs:ignore

	/** @var array<int, array<string, mixed>> */
	public array $meta_rows = [];

	/** @var array<int, array{sql: string, args: array<int, mixed>}> */
	public array $prepared = [];

	/** @var int */
	public int $selects = 0;

	/**
	 * @param string $query   SQL.
	 * @param mixed  ...$args Values.
	 * @return string
	 */
	public function prepare( $query, ...$args ) {
		$this->prepared[] = [
			'sql'  => (string) $query,
			'args' => $args,
		];
		return (string) $query;
	}

	/**
	 * @param string|null $query  SQL.
	 * @param string      $output Output.
	 * @return array<int, array<string, mixed>>
	 */
	public function get_results( $query = null, $output = 'OBJECT' ) {
		++$this->selects;
		$args = end( $this->prepared )['args'];
		$ids  = array_slice( $args, 2 );
		return array_values(
			array_filter(
				$this->meta_rows,
				static function ( array $row ) use ( $ids ): bool {
					return in_array( (int) $row['user_id'], $ids, true );
				}
			)
		);
	}
}

/**
 * @covers \ImaginaSignatures\Team\TeamDirectory
 * @covers \ImaginaSignatures\Api\Controllers\TeamConsoleController
 */
final class TeamConsoleTest extends TestCase {

	/** @var array<int, \WP_User> */
	private array $users = [];

	/** @var array<int, array<string, mixed>> Every get_users() call. */
	private array $user_queries = [];

	/** @var int[] Users of group 4. */
	private array $group_members = [];

	/** @var array<string, bool> */
	private array $caps = [];

	/** @var int */
	private int $summary_calls = 0;

	private Imgsig_Team_Wpdb $wpdb;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->users         = [];
		$this->user_queries  = [];
		$this->group_members = [ 2, 3 ];
		$this->caps          = [];
		$this->summary_calls = 0;
		$this->wpdb          = new Imgsig_Team_Wpdb();

		foreach ( [ 1 => 'Ana', 2 => 'Bea', 3 => 'Carlos', 4 => 'Dani' ] as $id => $name ) {
			$user                = new \WP_User(
				[
					'ID'           => $id,
					'display_name' => $name,
					'user_email'   => strtolower( $name ) . '@acme.test',
				]
			);
			$user->roles         = [ 'author' ];
			$this->users[ $id ] = $user;
		}

		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'is_user_logged_in' )->justReturn( true );
		Functions\when( 'current_user_can' )->alias(
			function ( $cap ): bool {
				return ! empty( $this->caps[ $cap ] );
			}
		);
		Functions\when( 'get_users' )->alias(
			function ( array $args ) {
				$this->user_queries[] = $args;
				if ( 'ID' === ( $args['fields'] ?? '' ) ) {
					$ids = array_keys( $this->users );
					if ( isset( $args['include'] ) ) {
						$ids = array_values( array_intersect( $ids, $args['include'] ) );
					}
					return array_map( 'strval', $ids );
				}
				$out = [];
				foreach ( $args['include'] as $id ) {
					$out[] = $this->users[ $id ];
				}
				return $out;
			}
		);
		Functions\when( 'get_objects_in_term' )->alias(
			function () {
				return $this->group_members;
			}
		);
		Functions\when( 'get_terms' )->justReturn(
			[
				(object) [
					'term_id'     => 4,
					'name'        => 'Sales',
					'slug'        => 'sales',
					'description' => '',
					'count'       => 2,
				],
			]
		);
		Functions\when( 'wp_get_object_terms' )->alias(
			static function ( $ids ) {
				return in_array( 2, (array) $ids, true )
					? [
						(object) [
							'object_id' => 2,
							'term_id'   => 4,
						],
					]
					: [];
			}
		);
		Functions\when( 'get_term_meta' )->justReturn( '' );
		Functions\when( 'is_wp_error' )->justReturn( false );
		Functions\when( 'get_avatar_url' )->alias(
			static function ( $id ): string {
				return 'https://avatars.test/' . $id;
			}
		);
		Functions\when( 'user_can' )->justReturn( true );
		Functions\when( 'maybe_unserialize' )->returnArg( 1 );
		Functions\when( 'get_option' )->alias(
			static function ( $name, $fallback = false ) {
				return 'imgsig_outlook' === $name ? [ 'enabled' => true ] : $fallback;
			}
		);
		Functions\when( 'rest_ensure_response' )->alias(
			static function ( $data ) {
				return $data instanceof \WP_REST_Response ? $data : new \WP_REST_Response( $data );
			}
		);
		// The listing must never fall back to per-user meta reads.
		Functions\expect( 'get_user_meta' )->never();

		$this->wpdb->meta_rows = [
			[
				'user_id'    => 2,
				'meta_key'   => 'imgsig_primary_signature',
				'meta_value' => '21',
			],
			[
				'user_id'    => 2,
				'meta_key'   => 'imgsig_deploy_status',
				'meta_value' => [
					'gmail'   => [
						'hash' => 'h-21',
						'at'   => '2026-11-05 09:00:00',
					],
					'install' => [
						'installed_at' => '2026-11-04 09:00:00',
						'hash'         => 'h-21',
					],
				],
			],
			[
				'user_id'    => 3,
				'meta_key'   => 'imgsig_deploy_status',
				'meta_value' => [ 'gmail' => [ 'error' => 'Delegation is missing.' ] ],
			],
		];
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	private function directory(): TeamDirectory {
		$signatures = $this->createMock( SignatureRepository::class );
		$signatures->method( 'summaries_for_users' )->willReturnCallback(
			function ( array $ids ): array {
				++$this->summary_calls;
				$rows = [
					2 => [
						Signature::from_row(
							[
								'id'          => 22,
								'user_id'     => 2,
								'name'        => 'Newer draft',
								'has_html'    => 1,
								'html_hash'   => 'h-22',
								'compiled_at' => '2026-11-05 10:00:00',
								'updated_at'  => '2026-11-05 10:00:00',
							]
						),
						Signature::from_row(
							[
								'id'          => 21,
								'user_id'     => 2,
								'name'        => 'Main',
								'status'      => 'ready',
								'template_id' => 9,
								'link_mode'   => 'linked',
								'has_html'    => 1,
								'html_hash'   => 'h-21',
								'compiled_at' => '2026-11-04 10:00:00',
								'updated_at'  => '2026-11-04 10:00:00',
							]
						),
					],
					3 => [
						Signature::from_row(
							[
								'id'          => 31,
								'user_id'     => 3,
								'name'        => 'Carlos',
								'has_html'    => 1,
								'html_hash'   => 'h-31',
								'compiled_at' => null,
								'updated_at'  => '2026-11-04 10:00:00',
							]
						),
					],
				];
				return array_intersect_key( $rows, array_flip( $ids ) );
			}
		);
		$signatures->method( 'count_stale' )->willReturn( 5 );

		$templates = $this->createMock( TemplateRepository::class );
		$templates->expects( $this->atMost( 1 ) )->method( 'names_by_ids' )->willReturnCallback(
			static function ( array $ids ): array {
				return in_array( 9, $ids, true ) ? [ 9 => 'Corporate' ] : [];
			}
		);

		$gmail = $this->createMock( GmailSettings::class );
		$gmail->method( 'is_configured' )->willReturn( true );
		$gmail->method( 'auto_push' )->willReturn( false );

		return new TeamDirectory( $signatures, $templates, $gmail, $this->wpdb );
	}

	public function test_rows_carry_user_signature_html_and_channel_state_in_constant_queries(): void {
		$result = $this->directory()->query( [] );

		$this->assertSame( 4, $result['total'] );
		$this->assertSame( [ 'Ana', 'Bea', 'Carlos', 'Dani' ], array_column( $result['items'], 'display_name' ) );
		$this->assertSame( 1, $this->summary_calls, 'One signatures query per 500 users.' );
		$this->assertSame( 1, $this->wpdb->selects, 'One usermeta query per 500 users.' );
		$this->assertCount( 2, $this->user_queries, 'Candidate ids + the page users.' );
		$this->assertSame( 'imgsig_use_signatures', $this->user_queries[0]['capability'] );

		$bea = $result['items'][1];
		$this->assertSame( 2, $bea['id'] );
		$this->assertSame( 'bea@acme.test', $bea['email'] );
		$this->assertSame( 'https://avatars.test/2', $bea['avatar'] );
		$this->assertSame( [ 'Sales' ], array_column( $bea['groups'], 'name' ) );
		$this->assertSame( 2, $bea['signature_count'] );
		$this->assertSame( 21, $bea['primary']['id'], 'The marked primary, not the newest draft.' );
		$this->assertSame( 'linked', $bea['primary']['link'] );
		$this->assertSame( 'Corporate', $bea['primary']['template_name'] );
		$this->assertSame( 'fresh', $bea['html']['state'] );
		$this->assertSame( 'pushed', $bea['gmail']['state'] );
		$this->assertSame( 'never', $bea['outlook']['state'] );
		$this->assertSame( 'installed', $bea['install']['state'] );

		$carlos = $result['items'][2];
		$this->assertSame( 'outdated', $carlos['html']['state'] );
		$this->assertSame( 'failed', $carlos['gmail']['state'] );
		$this->assertSame( 'Delegation is missing.', $carlos['gmail']['message'] );

		$this->assertNull( $result['items'][0]['primary'] );

		$this->assertSame( 4, $result['summary']['users'] );
		$this->assertSame( 2, $result['summary']['without_signature'] );
		$this->assertSame( 1, $result['summary']['outdated_html'] );
		$this->assertSame( 1, $result['summary']['gmail_pushed'] );
		$this->assertSame( 1, $result['summary']['installed'] );
		$this->assertSame( 5, $result['summary']['stale_signatures'] );
		$this->assertTrue( $result['channels']['gmail']['configured'] );
		$this->assertTrue( $result['channels']['outlook']['enabled'] );
	}

	public function test_state_filter_and_pagination_apply_after_the_counters(): void {
		$result = $this->directory()->query(
			[
				'state'    => 'no_signature',
				'per_page' => 1,
				'page'     => 2,
			]
		);

		$this->assertSame( 2, $result['total'] );
		$this->assertSame( 2, $result['total_pages'] );
		$this->assertSame( [ 'Dani' ], array_column( $result['items'], 'display_name' ) );
		$this->assertSame( 4, $result['summary']['users'], 'Counters ignore the state filter.' );
	}

	public function test_group_and_search_narrow_the_scope(): void {
		$result = $this->directory()->query(
			[
				'group'  => 4,
				'search' => 'ac',
			]
		);

		$this->assertSame( [ 2, 3 ], $this->user_queries[0]['include'] );
		$this->assertSame( '*ac*', $this->user_queries[0]['search'] );
		$this->assertSame( 2, $result['summary']['users'] );

		$this->group_members = [];
		$empty               = $this->directory()->query( [ 'group' => 4 ] );
		$this->assertSame( 0, $empty['total'] );
		$this->assertSame( [], $empty['items'] );
	}

	public function test_unknown_state_means_everyone(): void {
		$this->assertSame( 4, $this->directory()->query( [ 'state' => 'bogus' ] )['total'] );
	}

	public function test_route_requires_manage_team_and_sets_pagination_headers(): void {
		$routes = [];
		Functions\when( 'register_rest_route' )->alias(
			static function ( $namespace, $route, $args ) use ( &$routes ): bool {
				$routes[ $route ] = $args;
				return true;
			}
		);
		$controller = new TeamConsoleController( $this->directory() );
		$controller->register_routes();

		$permission = $routes['/admin/team'][0]['permission_callback'];
		$this->caps = [
			'imgsig_manage_storage' => true,
			'imgsig_use_signatures' => true,
		];
		$this->assertInstanceOf( \WP_Error::class, $permission() );
		$this->caps = [ 'imgsig_manage_team' => true ];
		$this->assertTrue( $permission() );

		$response = $controller->index( new \WP_REST_Request( [ 'per_page' => 3 ] ) );
		$this->assertSame( '4', $response->headers['X-WP-Total'] );
		$this->assertSame( '2', $response->headers['X-WP-TotalPages'] );
		$this->assertCount( 3, $response->get_data()['items'] );
	}
}
