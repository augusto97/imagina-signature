<?php
/**
 * Unit tests for the 1.5.0 schema migration (signature link mode).
 *
 * @package ImaginaSignatures\Tests\Unit\Setup
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Setup;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Setup\Migrations\Migration_1_5_0;
use ImaginaSignatures\Setup\SchemaMigrator;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Setup\Migrations\Migration_1_5_0
 * @covers \ImaginaSignatures\Setup\SchemaMigrator
 * @covers \ImaginaSignatures\Models\Signature
 */
final class Migration150Test extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		unset( $GLOBALS['wpdb'] );
		parent::tearDown();
	}

	public function test_adds_link_mode_and_keeps_every_existing_column_and_index(): void {
		$wpdb            = new \wpdb();
		$wpdb->prefix    = 'wp_';
		$GLOBALS['wpdb'] = $wpdb;

		$sql = null;
		Functions\when( 'dbDelta' )->alias(
			static function ( $query ) use ( &$sql ): array {
				$sql = (string) $query;
				return [];
			}
		);

		( new Migration_1_5_0() )->up();

		$this->assertIsString( $sql );
		$this->assertStringContainsString( 'CREATE TABLE wp_imgsig_signatures', $sql );
		$this->assertStringContainsString( "link_mode VARCHAR(20) NOT NULL DEFAULT 'detached'", $sql );
		foreach ( [ 'json_content LONGTEXT NOT NULL', 'html_cache LONGTEXT NULL', 'html_text LONGTEXT NULL', 'html_hash CHAR(64) NULL', 'compiled_at DATETIME NULL', 'template_id BIGINT UNSIGNED NULL', 'updated_at DATETIME NOT NULL' ] as $column ) {
			$this->assertStringContainsString( $column, $sql );
		}
		foreach ( [ 'PRIMARY KEY  (id)', 'KEY idx_user_updated (user_id, updated_at)', 'KEY idx_status (status)', 'KEY idx_template (template_id)', 'KEY idx_template_user (template_id, user_id)', 'KEY idx_template_link (template_id, link_mode)' ] as $index ) {
			$this->assertStringContainsString( $index, $sql );
		}
	}

	public function test_migrator_targets_1_5_0(): void {
		$this->assertSame( '1.5.0', ( new SchemaMigrator() )->target_version() );
	}

	public function test_model_reads_link_mode_only_with_a_template(): void {
		$linked   = Signature::from_row( [ 'id' => 1, 'template_id' => '4', 'link_mode' => 'linked' ] );
		$orphan   = Signature::from_row( [ 'id' => 2, 'template_id' => null, 'link_mode' => 'linked' ] );
		$legacy   = Signature::from_row( [ 'id' => 3, 'template_id' => '4' ] );

		$this->assertTrue( $linked->is_linked() );
		$this->assertSame( 'linked', $linked->to_summary_array()['link_mode'] );
		$this->assertFalse( $orphan->is_linked() );
		$this->assertSame( 'detached', $legacy->link_mode );
	}
}
