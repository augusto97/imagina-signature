<?php
/**
 * SchemaMigrator structure smoke tests.
 *
 * Real DB integration is covered by manual activation testing on a
 * WordPress install.
 *
 * @package ImaginaSignatures\Tests\Unit\Setup
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Setup;

use ImaginaSignatures\Setup\SchemaMigrator;
use PHPUnit\Framework\TestCase;

final class SchemaMigratorTest extends TestCase {

	public function test_latest_version_matches_known_target(): void {
		$migrator = new SchemaMigrator();
		$this->assertSame( '1.1.0', $migrator->latest_version() );
	}
}
