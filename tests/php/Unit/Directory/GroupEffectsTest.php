<?php
/**
 * Unit tests for what groups change elsewhere: banner campaign
 * targeting and the compliance footer served to signature users.
 *
 * @package ImaginaSignatures\Tests\Unit\Directory
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Directory;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Api\Controllers\SiteSettingsController;
use ImaginaSignatures\Directory\Groups;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/DirectoryStubs.php';

/**
 * @covers \ImaginaSignatures\Api\Controllers\SiteSettingsController::active_banner_campaigns
 * @covers \ImaginaSignatures\Api\Controllers\SiteSettingsController::show
 */
final class GroupEffectsTest extends TestCase {

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

	public function test_campaigns_target_groups(): void {
		Functions\when( 'current_time' )->justReturn( '2026-06-15' );
		$sales = $this->add_term( 'Sales' );
		$legal = $this->add_term( 'Legal' );

		$this->options[ SiteSettingsController::OPT_BANNER_CAMPAIGNS ] = [
			[
				'id'        => 'all',
				'enabled'   => true,
				'image_url' => 'https://cdn.example.com/all.png',
			],
			[
				'id'        => 'sales',
				'enabled'   => true,
				'image_url' => 'https://cdn.example.com/sales.png',
				'groups'    => [ (string) $sales, 'junk', 0, $sales ],
			],
			[
				'id'        => 'legal',
				'enabled'   => true,
				'image_url' => 'https://cdn.example.com/legal.png',
				'groups'    => [ $legal ],
			],
		];

		$stored = SiteSettingsController::current_banner_campaigns();
		$this->assertSame( [], $stored[0]['groups'] );
		$this->assertSame( [ $sales ], $stored[1]['groups'] );

		$this->relationships[5] = [ $sales ];
		$this->assertSame( [ 'all', 'sales' ], array_column( SiteSettingsController::active_banner_campaigns( 5 ), 'id' ) );

		$this->assertSame( [ 'all' ], array_column( SiteSettingsController::active_banner_campaigns( 6 ), 'id' ) );

		// Default: the current user.
		$this->current_user     = 7;
		$this->relationships[7] = [ $legal, $sales ];
		$this->assertSame( [ 'all', 'sales', 'legal' ], array_column( SiteSettingsController::active_banner_campaigns(), 'id' ) );
	}

	public function test_site_settings_show_gives_signature_users_their_effective_footer(): void {
		$this->options[ SiteSettingsController::OPT_COMPLIANCE_FOOTER ] = [
			'enabled' => true,
			'html'    => '<p>Global</p>',
		];
		Functions\when( 'current_time' )->justReturn( '2026-06-15' );
		$GLOBALS['wpdb'] = new \wpdb();

		$group                  = $this->add_term(
			'EU',
			[
				Groups::META_FOOTER => [
					'enabled' => true,
					'html'    => '<p>EU</p>',
				],
			]
		);
		$this->current_user     = 5;
		$this->relationships[5] = [ $group ];

		$data = ( new SiteSettingsController() )->show()->get_data();
		$this->assertSame( '<p>EU</p>', $data['compliance_footer']['html'] );

		// Admins see (and edit) the global footer.
		$this->caps['imgsig_manage_storage'] = true;
		$data                                = ( new SiteSettingsController() )->show()->get_data();
		$this->assertSame( '<p>Global</p>', $data['compliance_footer']['html'] );

		unset( $GLOBALS['wpdb'] );
	}
}
