<?php
/**
 * PlanLimits tests.
 *
 * @package ImaginaSignatures\Tests\Unit\Models
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Models;

use ImaginaSignatures\Models\PlanLimits;
use PHPUnit\Framework\TestCase;

final class PlanLimitsTest extends TestCase {

	public function test_unlimited_returns_max_values(): void {
		$limits = PlanLimits::unlimited();
		$this->assertSame( PHP_INT_MAX, $limits->max_signatures );
		$this->assertSame( PHP_INT_MAX, $limits->max_storage_bytes );
		$this->assertTrue( $limits->allow_premium_templates );
	}

	public function test_from_array_uses_defaults_for_missing_keys(): void {
		$limits = PlanLimits::from_array( [] );
		$this->assertSame( 10, $limits->max_signatures );
		$this->assertTrue( $limits->allow_html_export );
		$this->assertFalse( $limits->allow_premium_templates );
	}

	public function test_to_array_round_trip(): void {
		$source = new PlanLimits( 5, 200, 100, true, false, false, false, false );
		$copy   = PlanLimits::from_array( $source->to_array() );
		$this->assertEquals( $source->to_array(), $copy->to_array() );
	}
}
