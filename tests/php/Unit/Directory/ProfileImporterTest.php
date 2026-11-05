<?php
/**
 * Unit tests for the CSV profile import (dry run + apply).
 *
 * @package ImaginaSignatures\Tests\Unit\Directory
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Directory;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Api\Controllers\ProfileImportController;
use ImaginaSignatures\Directory\Groups;
use ImaginaSignatures\Directory\ProfileFields;
use ImaginaSignatures\Directory\ProfileImporter;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/DirectoryStubs.php';

/**
 * @covers \ImaginaSignatures\Directory\ProfileImporter
 * @covers \ImaginaSignatures\Api\Controllers\ProfileImportController
 */
final class ProfileImporterTest extends TestCase {

	use DirectoryStubs;

	private const COLUMNS = [ 'email', 'field:job_title', 'field:phone', 'group', '' ];

	/** @var array<int, array<string, mixed>> */
	private array $inserted = [];

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_directory();

		$this->add_user( 1, 'ana@acme.com' );
		$this->add_user( 2, 'luis@acme.com' );
		$this->user_meta[2][ ProfileFields::META_KEY ] = [ 'job_title' => 'Sales rep' ];

		$this->inserted = [];
		Functions\when( 'wp_roles' )->justReturn(
			(object) [
				'roles' => [
					'administrator' => [
						'name'         => 'Administrator',
						'capabilities' => [ 'manage_options' => true ],
					],
					'shop_manager'  => [
						'name'         => 'Shop manager',
						'capabilities' => [ 'edit_users' => true ],
					],
					'author'        => [
						'name'         => 'Author',
						'capabilities' => [ 'edit_posts' => true ],
					],
					'subscriber'    => [
						'name'         => 'Subscriber',
						'capabilities' => [ 'read' => true ],
					],
				],
			]
		);
		Functions\when( 'wp_generate_password' )->justReturn( 'Gen3rated-Pass' );
		Functions\when( 'username_exists' )->alias(
			function ( $login ) {
				foreach ( $this->users as $user ) {
					if ( isset( $user->user_login ) && $user->user_login === $login ) {
						return $user->ID;
					}
				}
				return false;
			}
		);
		Functions\when( 'wp_insert_user' )->alias(
			function ( array $data ) {
				$this->inserted[] = $data;
				$id               = 100 + count( $this->inserted );
				$this->add_user( $id, $data['user_email'], [ 'user_login' => $data['user_login'] ] );
				return $id;
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * @return array<int, array<int, string>>
	 */
	private function rows(): array {
		return [
			[ 'ana@acme.com', 'CEO', '+34 600 111 222', 'Leadership | Sales', 'ignored' ],
			[ 'LUIS@acme.com', 'Sales rep', '', 'sales', '' ],
			[ 'nobody@acme.com', 'Ghost', '', '', '' ],
			[ 'not-an-email', 'x', '', '', '' ],
			[ '', 'x', '', '', '' ],
		];
	}

	public function test_validate_columns(): void {
		$this->assertSame( '', ProfileImporter::validate_columns( self::COLUMNS ) );
		$this->assertNotSame( '', ProfileImporter::validate_columns( [ 'field:job_title' ] ) );
		$this->assertNotSame( '', ProfileImporter::validate_columns( [ 'email', 'email' ] ) );
		$this->assertNotSame( '', ProfileImporter::validate_columns( [ 'email', 3 ] ) );
	}

	public function test_dry_run_counts_without_writing(): void {
		$sales = $this->add_term( 'Sales' );
		$meta  = $this->user_meta;

		$result = ( new ProfileImporter() )->run( $this->rows(), self::COLUMNS, [ 'create_groups' => true ], true, 200 );

		$this->assertTrue( $result['dry_run'] );
		$this->assertSame( 5, $result['rows'] );
		$this->assertSame( 2, $result['matched'] );
		$this->assertSame( 0, $result['created'] );
		$this->assertSame( [ 'nobody@acme.com' ], $result['unknown'] );
		$this->assertSame( 1, $result['unknown_count'] );
		$this->assertSame( [ 204, 205 ], array_column( $result['invalid'], 'row' ) );
		// Ana: job_title + phone; Luis: unchanged job title, empty phone ignored.
		$this->assertSame( 1, $result['users_changed'] );
		$this->assertSame( 2, $result['field_changes'] );
		// Ana → Leadership (new) + Sales; Luis → Sales.
		$this->assertSame( 3, $result['group_assignments'] );
		$this->assertSame( [ 'Leadership' ], $result['groups_created'] );

		$this->assertSame( $meta, $this->user_meta, 'dry run writes nothing' );
		$this->assertSame( [], Groups::members( $sales ) );
		$this->assertCount( 1, $this->terms );
	}

	public function test_apply_writes_profiles_and_groups(): void {
		$sales = $this->add_term( 'Sales' );

		$result = ( new ProfileImporter() )->run( $this->rows(), self::COLUMNS, [ 'create_groups' => true ], false );

		$this->assertFalse( $result['dry_run'] );
		$this->assertSame( 2, $result['field_changes'] );
		$this->assertSame(
			[
				'job_title' => 'CEO',
				'phone'     => '+34 600 111 222',
			],
			$this->user_meta[1][ ProfileFields::META_KEY ]
		);
		$this->assertSame( 'Sales rep', $this->user_meta[2][ ProfileFields::META_KEY ]['job_title'] );

		$leadership = Groups::find_by_name( 'Leadership' );
		$this->assertGreaterThan( 0, $leadership );
		$this->assertSame( [ 1, 2 ], Groups::members( $sales ) );
		$this->assertSame( [ 1 ], Groups::members( $leadership ) );

		// Re-running changes nothing.
		$again = ( new ProfileImporter() )->run( $this->rows(), self::COLUMNS, [ 'create_groups' => true ], false );
		$this->assertSame( 0, $again['field_changes'] );
		$this->assertSame( 0, $again['group_assignments'] );
		$this->assertSame( [], $again['groups_created'] );
	}

	public function test_missing_groups_are_reported_when_not_created(): void {
		$result = ( new ProfileImporter() )->run( $this->rows(), self::COLUMNS, [], false );
		$this->assertSame( [ 'Leadership', 'Sales' ], $result['groups_missing'] );
		$this->assertSame( 0, $result['group_assignments'] );
		$this->assertCount( 0, $this->terms );
	}

	public function test_fields_mapped_to_other_meta_are_skipped(): void {
		$this->options[ ProfileFields::OPTION ] = [
			'mapping' => [
				'phone' => [
					'source'   => 'meta',
					'meta_key' => 'billing_phone',
				],
			],
		];

		$result = ( new ProfileImporter() )->run( $this->rows(), self::COLUMNS, [], false );

		$this->assertSame( [ 'phone' ], $result['skipped_fields'] );
		$this->assertSame( [ 'job_title' => 'CEO' ], $this->user_meta[1][ ProfileFields::META_KEY ] );
	}

	public function test_create_missing_users(): void {
		$columns = [ 'email', 'field:job_title', '', '', '', 'user:first_name' ];
		$rows    = [ [ 'nobody@acme.com', 'Ghost', '', '', '', 'Nora' ] ];

		$refused = ( new ProfileImporter() )->run(
			$rows,
			$columns,
			[
				'create_missing' => true,
				'role'           => 'administrator',
			],
			false
		);
		$this->assertSame( 0, $refused['invalid'][0]['row'] );
		$this->assertSame( [], $this->inserted );

		$dry = ( new ProfileImporter() )->run(
			$rows,
			$columns,
			[
				'create_missing' => true,
				'role'           => 'subscriber',
			],
			true
		);
		$this->assertSame( 1, $dry['created'] );
		$this->assertSame( 1, $dry['field_changes'] );
		$this->assertSame( [], $this->inserted );

		Functions\expect( 'wp_new_user_notification' )->never();
		$this->add_user( 50, 'taken@acme.com', [ 'user_login' => 'nobody' ] );

		$applied = ( new ProfileImporter() )->run(
			$rows,
			$columns,
			[
				'create_missing' => true,
				'role'           => 'subscriber',
			],
			false
		);
		$this->assertSame( 1, $applied['created'] );
		$this->assertSame( 'nobody2', $this->inserted[0]['user_login'] );
		$this->assertSame( 'subscriber', $this->inserted[0]['role'] );
		$this->assertSame( 'Nora', $this->inserted[0]['first_name'] );
		$this->assertSame( 'Gen3rated-Pass', $this->inserted[0]['user_pass'] );
		$this->assertSame( [ 'job_title' => 'Ghost' ], $this->user_meta[101][ ProfileFields::META_KEY ] );
	}

	public function test_new_user_notification_is_opt_in(): void {
		Functions\expect( 'wp_new_user_notification' )->once()->with( 101, null, 'user' );

		$result = ( new ProfileImporter() )->run(
			[ [ 'new@acme.com' ] ],
			[ 'email' ],
			[
				'create_missing'    => true,
				'role'              => 'author',
				'send_notification' => true,
			],
			false
		);
		$this->assertSame( 1, $result['created'] );
	}

	public function test_assignable_roles_exclude_privileged_ones(): void {
		$this->assertSame( [ 'author', 'subscriber' ], array_column( ProfileImporter::assignable_roles(), 'slug' ) );
	}

	public function test_controller_validates_the_request(): void {
		$controller = new ProfileImportController();

		$too_many = $controller->import(
			new \WP_REST_Request(
				[
					'rows'    => array_fill( 0, 101, [ 'a@b.com' ] ),
					'columns' => [ 'email' ],
				]
			)
		);
		$this->assertSame( 400, $too_many->get_error_data()['status'] );

		$no_email = $controller->import(
			new \WP_REST_Request(
				[
					'rows'    => [ [ 'x' ] ],
					'columns' => [ 'field:job_title' ],
				]
			)
		);
		$this->assertSame( 400, $no_email->get_error_data()['status'] );

		// dry_run defaults to true.
		$data = $controller->import(
			new \WP_REST_Request(
				[
					'rows'    => [ [ 'ana@acme.com', 'Boss' ] ],
					'columns' => [ 'email', 'field:job_title' ],
				]
			)
		)->get_data();
		$this->assertTrue( $data['dry_run'] );
		$this->assertSame( 1, $data['field_changes'] );
		$this->assertArrayNotHasKey( 1, $this->user_meta );

		$meta = $controller->show()->get_data();
		$this->assertSame( 100, $meta['max_rows'] );
		$this->assertCount( 10, $meta['fields'] );
	}
}
