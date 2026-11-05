<?php
/**
 * Unit tests for the Outlook add-in settings option.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment;

use Brain\Monkey;
use Brain\Monkey\Actions;
use ImaginaSignatures\Deployment\OutlookSettings;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/OutlookStubs.php';

/**
 * @covers \ImaginaSignatures\Deployment\OutlookSettings
 */
final class OutlookSettingsTest extends TestCase {

	use OutlookStubs;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_outlook_wp();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_first_read_generates_and_persists_a_key_and_an_id(): void {
		$first = OutlookSettings::get();

		$this->assertFalse( $first['enabled'] );
		$this->assertFalse( $first['replace_client_signature'] );
		$this->assertMatchesRegularExpression( OutlookSettings::KEY_PATTERN, $first['deploy_key'] );
		$this->assertMatchesRegularExpression( OutlookSettings::ID_PATTERN, $first['add_in_id'] );
		$this->assertSame( 1, $first['revision'] );
		$this->assertSame( $first, $this->options[ OutlookSettings::OPTION ] );

		$this->assertSame( $first, OutlookSettings::get(), 'Later reads return the same key and id.' );
	}

	public function test_sanitize_normalises_and_drops_unknown_keys(): void {
		$key = str_repeat( 'AB', 32 );
		$out = OutlookSettings::sanitize(
			[
				'enabled'                  => '1',
				'deploy_key'               => $key,
				'replace_client_signature' => 0,
				'add_in_id'                => '3F2504E0-4F89-41D3-9A0C-0305E82C3301',
				'revision'                 => 999999,
				'extra'                    => 'dropped',
			]
		);

		$this->assertSame( [ 'enabled', 'deploy_key', 'replace_client_signature', 'add_in_id', 'revision' ], array_keys( $out ) );
		$this->assertTrue( $out['enabled'] );
		$this->assertSame( strtolower( $key ), $out['deploy_key'] );
		$this->assertSame( '3f2504e0-4f89-41d3-9a0c-0305e82c3301', $out['add_in_id'] );
		$this->assertSame( 65535, $out['revision'] );

		$broken = OutlookSettings::sanitize(
			[
				'deploy_key' => 'short',
				'add_in_id'  => 'not-a-guid',
				'revision'   => -4,
			]
		);
		$this->assertMatchesRegularExpression( OutlookSettings::KEY_PATTERN, $broken['deploy_key'] );
		$this->assertMatchesRegularExpression( OutlookSettings::ID_PATTERN, $broken['add_in_id'] );
		$this->assertSame( 1, $broken['revision'] );

		$this->assertSame( OutlookSettings::defaults()['enabled'], OutlookSettings::sanitize( 'garbage' )['enabled'] );
	}

	public function test_update_only_touches_the_admin_editable_fields(): void {
		$before = OutlookSettings::get();

		$after = OutlookSettings::update(
			[
				'enabled'                  => 'true',
				'replace_client_signature' => 'yes',
				'deploy_key'               => str_repeat( 'b', 64 ),
				'add_in_id'                => '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
				'revision'                 => 9,
			]
		);

		$this->assertTrue( $after['enabled'] );
		$this->assertTrue( $after['replace_client_signature'] );
		$this->assertSame( $before['deploy_key'], $after['deploy_key'] );
		$this->assertSame( $before['add_in_id'], $after['add_in_id'] );
		$this->assertSame( $before['revision'], $after['revision'] );

		$off = OutlookSettings::update( [ 'enabled' => '0' ] );
		$this->assertFalse( $off['enabled'] );
		$this->assertTrue( $off['replace_client_signature'], 'Fields not sent are kept.' );
	}

	public function test_regenerating_the_key_invalidates_the_old_one_and_bumps_the_revision(): void {
		$before = OutlookSettings::update( [ 'enabled' => true ] );
		Actions\expectDone( 'imgsig/outlook/key_regenerated' )->once()->with( 2 );

		$after = OutlookSettings::regenerate_key();

		$this->assertNotSame( $before['deploy_key'], $after['deploy_key'] );
		$this->assertSame( $before['add_in_id'], $after['add_in_id'], 'The add-in id never changes.' );
		$this->assertSame( 2, $after['revision'] );
		$this->assertTrue( $after['enabled'] );
		$this->assertFalse( OutlookSettings::verify_key( $before['deploy_key'] ) );
		$this->assertTrue( OutlookSettings::verify_key( $after['deploy_key'] ) );
	}

	public function test_verify_key(): void {
		$settings = OutlookSettings::sanitize( [ 'deploy_key' => str_repeat( 'c', 64 ) ] );

		$this->assertTrue( OutlookSettings::verify_key( str_repeat( 'c', 64 ), $settings ) );
		$this->assertTrue( OutlookSettings::verify_key( ' ' . str_repeat( 'C', 64 ) . ' ', $settings ) );
		$this->assertFalse( OutlookSettings::verify_key( str_repeat( 'c', 63 ) . 'd', $settings ) );
		$this->assertFalse( OutlookSettings::verify_key( '', $settings ) );
		$this->assertFalse( OutlookSettings::verify_key( str_repeat( 'c', 63 ), $settings ) );
		$this->assertFalse( OutlookSettings::verify_key( str_repeat( 'c', 64 ), [ 'deploy_key' => '' ] ) );
	}

	public function test_generated_guid_is_v4(): void {
		for ( $i = 0; $i < 20; $i++ ) {
			$this->assertMatchesRegularExpression( OutlookSettings::ID_PATTERN, OutlookSettings::generate_guid() );
		}
		$this->assertNotSame( OutlookSettings::generate_key(), OutlookSettings::generate_key() );
	}
}
