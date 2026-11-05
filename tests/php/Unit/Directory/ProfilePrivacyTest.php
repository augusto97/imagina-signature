<?php
/**
 * Unit tests for the profile privacy exporter / eraser.
 *
 * @package ImaginaSignatures\Tests\Unit\Directory
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Directory;

use Brain\Monkey;
use ImaginaSignatures\Directory\ProfileFields;
use ImaginaSignatures\Directory\ProfilePrivacy;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/DirectoryStubs.php';

/**
 * @covers \ImaginaSignatures\Directory\ProfilePrivacy
 */
final class ProfilePrivacyTest extends TestCase {

	use DirectoryStubs;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_directory();
		$this->add_user( 5, 'jane@acme.com' );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_registers_exporter_and_eraser(): void {
		$this->assertArrayHasKey( ProfilePrivacy::ID, ProfilePrivacy::register_exporter( [] ) );
		$this->assertArrayHasKey( ProfilePrivacy::ID, ProfilePrivacy::register_eraser( null ) );
	}

	public function test_export_lists_stored_values_and_groups(): void {
		$this->user_meta[5][ ProfileFields::META_KEY ] = [
			'job_title' => 'CTO',
			'mobile'    => '+34 600 000 000',
		];
		$this->relationships[5]                        = [ $this->add_term( 'Sales' ) ];

		$export = ProfilePrivacy::export( 'jane@acme.com' );

		$this->assertTrue( $export['done'] );
		$this->assertSame(
			[
				[
					'name'  => 'Job title',
					'value' => 'CTO',
				],
				[
					'name'  => 'Mobile',
					'value' => '+34 600 000 000',
				],
				[
					'name'  => 'Signature groups',
					'value' => 'Sales',
				],
			],
			$export['data'][0]['data']
		);
		$this->assertSame( [], ProfilePrivacy::export( 'nobody@acme.com' )['data'] );
	}

	public function test_erase_removes_values_and_memberships(): void {
		$this->user_meta[5][ ProfileFields::META_KEY ] = [ 'job_title' => 'CTO' ];
		$this->relationships[5]                        = [ $this->add_term( 'Sales' ) ];

		$this->assertTrue( ProfilePrivacy::erase( 'jane@acme.com' )['items_removed'] );
		$this->assertArrayNotHasKey( ProfileFields::META_KEY, $this->user_meta[5] );
		$this->assertArrayNotHasKey( 5, $this->relationships );
		$this->assertFalse( ProfilePrivacy::erase( 'jane@acme.com' )['items_removed'] );
	}
}
