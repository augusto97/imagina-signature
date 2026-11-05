<?php
/**
 * Unit tests for the install channel record and the
 * `imgsig/deploy/primary_html_changed` handling.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment;

use Brain\Monkey;
use ImaginaSignatures\Deployment\DeploymentStatus;
use ImaginaSignatures\Deployment\Install\InstallService;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Services\SignatureService;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/DeploymentStubs.php';

/**
 * @covers \ImaginaSignatures\Deployment\Install\InstallService
 */
final class InstallServiceTest extends TestCase {

	use DeploymentStubs;

	private int $now = 1793865600; // 2026-11-05 08:00:00 UTC.

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_wordpress();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	private function service( ?Signature $primary = null ): InstallService {
		$signatures = $this->createMock( SignatureService::class );
		$signatures->method( 'primary_for_user' )->willReturn( $primary );
		return new InstallService(
			$signatures,
			function (): int {
				return $this->now;
			}
		);
	}

	/**
	 * @return array<string, mixed>
	 */
	private function record( int $user_id ): array {
		return DeploymentStatus::get( $user_id )['install'] ?? [];
	}

	public function test_state_reflects_invited_installed_and_outdated(): void {
		$this->assertSame( 'none', InstallService::state( [], 'h1' ) );
		$this->assertSame( 'invited', InstallService::state( [ 'invited_at' => '2026-11-01 10:00:00', 'hash' => 'h1' ], 'h1' ) );
		$this->assertSame(
			'installed',
			InstallService::state(
				[
					'installed_at' => '2026-11-02 10:00:00',
					'hash'         => 'h1',
				],
				'h1'
			)
		);
		$this->assertSame(
			'outdated',
			InstallService::state(
				[
					'installed_at' => '2026-11-02 10:00:00',
					'hash'         => 'h1',
				],
				'h2'
			)
		);
		$this->assertSame( 'outdated', InstallService::state( [ 'installed_at' => '2026-11-02 10:00:00' ], null ) );
	}

	public function test_any_compiled_server_html_is_deployable(): void {
		$this->assertTrue( InstallService::is_deployable( self::signature( 3 ) ) );
		// Outdated HTML keeps being served until a browser recompiles it.
		$this->assertTrue( InstallService::is_deployable( self::signature( 3, false ) ), 'stale HTML' );
		$this->assertFalse( InstallService::is_deployable( self::never_compiled( 3 ) ), 'never compiled' );
		$this->assertFalse( InstallService::is_deployable( self::signature( 3, true, '   ' ) ), 'blank HTML' );
		$this->assertFalse( InstallService::is_deployable( null ) );
	}

	public function test_is_fresh_also_requires_html_newer_than_the_last_change(): void {
		$this->assertTrue( InstallService::is_fresh( self::signature( 3 ) ) );
		$this->assertFalse( InstallService::is_fresh( self::signature( 3, false ) ) );
		$this->assertFalse( InstallService::is_fresh( self::never_compiled( 3 ) ) );
		$this->assertFalse( InstallService::is_fresh( null ) );
	}

	public function test_summary_flags_outdated_html_that_is_still_served(): void {
		$summary = $this->service( self::signature( 3, false ) )->summary( 3 );
		$this->assertTrue( $summary['ready'] );
		$this->assertTrue( $summary['outdated'] );

		$summary = $this->service( self::signature( 3 ) )->summary( 3 );
		$this->assertTrue( $summary['ready'] );
		$this->assertFalse( $summary['outdated'] );

		$summary = $this->service( self::never_compiled( 3 ) )->summary( 3 );
		$this->assertFalse( $summary['ready'] );
		$this->assertFalse( $summary['outdated'] );
	}

	public function test_mark_installed_records_hash_client_and_time(): void {
		$signature = self::signature( 3 );
		$record    = $this->service( $signature )->mark_installed( 3, $signature, 'gmail' );

		$this->assertSame( '2026-11-05 08:00:00', $record['installed_at'] );
		$this->assertSame( $record['installed_at'], $record['at'] );
		$this->assertSame( $signature->html_hash, $record['hash'] );
		$this->assertSame( 'gmail', $record['client'] );
		$this->assertSame( 'installed', InstallService::state( $record, $signature->html_hash ) );

		$other = $this->service( $signature )->mark_installed( 4, $signature, '<script>' );
		$this->assertSame( 'other', $other['client'] );
	}

	public function test_invitation_after_an_install_does_not_overwrite_the_installed_hash(): void {
		$old     = self::signature( 3, true, '<table><tr><td>Old</td></tr></table>' );
		$new     = self::signature( 3, true, '<table><tr><td>New</td></tr></table>' );
		$service = $this->service( $new );

		$service->mark_contacted( 3, $old, false );
		$this->assertSame( $old->html_hash, $this->record( 3 )['hash'], 'before any install, hash = invited version' );

		$service->mark_installed( 3, $old );
		$service->mark_contacted( 3, $new, false );

		$record = $this->record( 3 );
		$this->assertSame( $old->html_hash, $record['hash'] );
		$this->assertSame( $new->html_hash, $record['invited_hash'] );
		$this->assertSame( 'outdated', InstallService::state( $record, $new->html_hash ) );
	}

	public function test_reminders_increment_and_an_invitation_resets_them(): void {
		$signature = self::signature( 3 );
		$service   = $this->service( $signature );

		$service->mark_contacted( 3, $signature, false );
		$service->mark_contacted( 3, $signature, true );
		$service->mark_contacted( 3, $signature, true );
		$this->assertSame( 2, $this->record( 3 )['reminders'] );
		$this->assertSame( '2026-11-05 08:00:00', $this->record( 3 )['reminded_at'] );

		$service->mark_contacted( 3, $signature, false );
		$this->assertSame( 0, $this->record( 3 )['reminders'] );
		$this->assertNull( $this->record( 3 )['reminded_at'] );
	}

	public function test_primary_html_change_marks_an_installed_user_outdated(): void {
		$installed = self::signature( 3, true, '<table><tr><td>v1</td></tr></table>' );
		$changed   = self::signature( 3, true, '<table><tr><td>v2</td></tr></table>' );
		$service   = $this->service( $changed );
		$service->mark_installed( 3, $installed );

		$this->now += 3600;
		$service->on_primary_html_changed( 3, $changed );

		$record = $this->record( 3 );
		$this->assertSame( '2026-11-05 09:00:00', $record['outdated_at'] );
		$this->assertSame( $installed->html_hash, $record['hash'], 'the installed hash is kept: the mismatch IS the signal' );
		$this->assertSame( 'outdated', InstallService::state( $record, $changed->html_hash ) );

		// Going back to the installed HTML clears the flag.
		$service->on_primary_html_changed( 3, $installed );
		$this->assertNull( $this->record( 3 )['outdated_at'] );
	}

	public function test_primary_html_change_ignores_users_who_never_installed(): void {
		$service = $this->service();
		$service->mark_contacted( 5, self::signature( 5 ), false );
		$before = $this->record( 5 );

		$service->on_primary_html_changed( 5, self::signature( 5, true, '<table><tr><td>v2</td></tr></table>' ) );
		$service->on_primary_html_changed( 6, self::signature( 6 ) );
		$service->on_primary_html_changed( 0, null );

		$this->assertSame( $before, $this->record( 5 ) );
		$this->assertSame( [], $this->record( 6 ) );
	}

	public function test_opened_at_is_throttled_to_once_an_hour(): void {
		$service = $this->service();
		$service->mark_opened( 3 );
		$first = $this->record( 3 )['opened_at'];

		$this->now += 600;
		$service->mark_opened( 3 );
		$this->assertSame( $first, $this->record( 3 )['opened_at'] );

		$this->now += 3600;
		$service->mark_opened( 3 );
		$this->assertSame( '2026-11-05 09:10:00', $this->record( 3 )['opened_at'] );
	}
}
