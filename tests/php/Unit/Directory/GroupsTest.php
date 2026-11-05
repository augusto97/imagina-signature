<?php
/**
 * Unit tests for groups: CRUD, membership and footer overrides.
 *
 * @package ImaginaSignatures\Tests\Unit\Directory
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Directory;

use Brain\Monkey;
use Brain\Monkey\Actions;
use ImaginaSignatures\Directory\Groups;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/DirectoryStubs.php';

/**
 * @covers \ImaginaSignatures\Directory\Groups
 */
final class GroupsTest extends TestCase {

	use DirectoryStubs;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_directory();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_create_sanitises_and_formats(): void {
		Actions\expectDone( 'imgsig/group/saved' )->once();

		$group = Groups::create(
			[
				'name'                       => '  <b>Sales</b> ',
				'description'                => 'EMEA team',
				'color'                      => '#FF0000',
				'template_id'                => '12',
				'compliance_footer_override' => [
					'enabled' => true,
					'html'    => '<p onclick="steal()">Legal</p><script></script>',
				],
			]
		);

		$this->assertIsArray( $group );
		$this->assertSame( 'Sales', $group['name'] );
		$this->assertSame( 'EMEA team', $group['description'] );
		$this->assertSame( '#ff0000', $group['color'] );
		$this->assertSame( 12, $group['template_id'] );
		$this->assertSame(
			[
				'enabled' => true,
				'html'    => '<p>Legal</p>',
			],
			$group['compliance_footer_override']
		);
		$this->assertSame( 0, $group['member_count'] );
	}

	public function test_create_defaults_and_errors(): void {
		$group = Groups::create(
			[
				'name'  => 'Support',
				'color' => 'red',
			]
		);
		$this->assertSame( Groups::DEFAULT_COLOR, $group['color'] );
		$this->assertNull( $group['template_id'] );
		$this->assertFalse( $group['compliance_footer_override']['enabled'] );

		$empty = Groups::create( [ 'name' => '   ' ] );
		$this->assertInstanceOf( \WP_Error::class, $empty );
		$this->assertSame( 400, $empty->get_error_data()['status'] );

		$dupe = Groups::create( [ 'name' => 'support' ] );
		$this->assertInstanceOf( \WP_Error::class, $dupe );
		$this->assertSame( 'imgsig_group_exists', $dupe->get_error_code() );
		$this->assertSame( 409, $dupe->get_error_data()['status'] );
	}

	public function test_update_is_partial_and_clears_template(): void {
		$id = $this->add_term(
			'Legal',
			[
				Groups::META_COLOR    => '#123456',
				Groups::META_TEMPLATE => 4,
			]
		);

		$group = Groups::update(
			$id,
			[
				'description' => 'Counsel',
				'template_id' => null,
			]
		);

		$this->assertSame( 'Legal', $group['name'] );
		$this->assertSame( 'Counsel', $group['description'] );
		$this->assertSame( '#123456', $group['color'] );
		$this->assertNull( $group['template_id'] );

		$this->assertInstanceOf( \WP_Error::class, Groups::update( 999, [ 'name' => 'x' ] ) );
		$this->assertSame( 404, Groups::update( 999, [] )->get_error_data()['status'] );
	}

	public function test_delete(): void {
		$id                    = $this->add_term( 'Temp' );
		$this->relationships[5] = [ $id ];
		Actions\expectDone( 'imgsig/group/deleted' )->once()->with( $id );

		$this->assertTrue( Groups::delete( $id ) );
		$this->assertNull( Groups::get( $id ) );
		$this->assertSame( [], Groups::for_user( 5 ) );
		$this->assertInstanceOf( \WP_Error::class, Groups::delete( $id ) );
	}

	public function test_set_members_replaces_the_list_and_ignores_unknown_users(): void {
		$this->add_user( 1, 'a@x.com' );
		$this->add_user( 2, 'b@x.com' );
		$this->add_user( 3, 'c@x.com' );
		$id                     = $this->add_term( 'Ops' );
		$this->relationships[1] = [ $id ];

		Actions\expectDone( 'imgsig/group/members_changed' )->once()->with( $id, [ 2, 3 ], [ 1 ] );

		$result = Groups::set_members( $id, [ 3, '2', 2, 99, 'x', -1 ] );

		$this->assertSame(
			[
				'added'   => [ 2, 3 ],
				'removed' => [ 1 ],
			],
			$result
		);
		$this->assertSame( [ 2, 3 ], Groups::members( $id ) );
		$this->assertSame( 2, Groups::get( $id )['member_count'] );
		$this->assertInstanceOf( \WP_Error::class, Groups::set_members( 999, [ 1 ] ) );
	}

	public function test_for_user_is_alphabetical_and_for_users_batches(): void {
		$zeta                   = $this->add_term( 'Zeta' );
		$alpha                  = $this->add_term( 'alpha' );
		$this->relationships[4] = [ $zeta, $alpha ];
		$this->relationships[6] = [ $zeta ];

		$this->assertSame( [ $alpha, $zeta ], Groups::for_user( 4 ) );
		$this->assertSame(
			[
				4 => [ $alpha, $zeta ],
				6 => [ $zeta ],
			],
			Groups::for_users( [ 4, 6, 8 ] )
		);
		$this->assertSame( [], Groups::for_user( 0 ) );
	}

	public function test_set_user_groups_and_add_member(): void {
		$a = $this->add_term( 'A' );
		$b = $this->add_term( 'B' );
		$this->add_user( 9, 'z@x.com' );

		Groups::set_user_groups( 9, [ $b, 777, $a ] );
		$this->assertSame( [ $a, $b ], Groups::for_user( 9 ) );

		$this->assertFalse( Groups::add_member( 9, $a ), 'already a member' );
		Groups::set_user_groups( 9, [] );
		$this->assertTrue( Groups::add_member( 9, $a ) );
		$this->assertSame( [ $a ], Groups::for_user( 9 ) );
	}

	public function test_find_by_name_is_case_insensitive(): void {
		$id = $this->add_term( 'Customer Success' );
		$this->assertSame( $id, Groups::find_by_name( 'customer success' ) );
		$this->assertSame( $id, Groups::find_by_name( 'customer-success' ) );
		$this->assertSame( 0, Groups::find_by_name( 'Nope' ) );
	}

	public function test_effective_footer_prefers_the_first_group_override(): void {
		$global = [
			'enabled' => true,
			'html'    => '<p>Global</p>',
		];
		$beta   = $this->add_term(
			'Beta',
			[
				Groups::META_FOOTER => [
					'enabled' => true,
					'html'    => '<p>Beta</p>',
				],
			]
		);
		$alpha  = $this->add_term(
			'Alpha',
			[
				Groups::META_FOOTER => [
					'enabled' => false,
					'html'    => '<p>Alpha (off)</p>',
				],
			]
		);
		$aaa    = $this->add_term(
			'Aaa',
			[
				Groups::META_FOOTER => [
					'enabled' => true,
					'html'    => '',
				],
			]
		);

		// No groups → global.
		$this->assertSame( $global, Groups::effective_compliance_footer( 1, $global ) );

		// Alpha's override is disabled → Beta wins.
		$this->relationships[1] = [ $beta, $alpha ];
		$this->assertSame(
			[
				'enabled' => true,
				'html'    => '<p>Beta</p>',
			],
			Groups::effective_compliance_footer( 1, $global )
		);

		// An enabled override with empty HTML suppresses the footer.
		$this->relationships[1][] = $aaa;
		$this->assertSame(
			[
				'enabled' => false,
				'html'    => '',
			],
			Groups::effective_compliance_footer( 1, $global )
		);
	}
}
