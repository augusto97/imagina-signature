<?php
/**
 * Unit tests for the install reminders.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Deployment\Install\InstallReminders;
use ImaginaSignatures\Deployment\Install\InvitationMailer;
use ImaginaSignatures\Deployment\Install\InvitationQueue;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/DeploymentStubs.php';

/**
 * @covers \ImaginaSignatures\Deployment\Install\InstallReminders
 */
final class InstallRemindersTest extends TestCase {

	use DeploymentStubs;

	/** 2026-11-10 09:00:00 UTC (the daily event's run). */
	private int $now = 1794301200;

	private const SETTINGS = [
		'enabled'    => true,
		'after_days' => 3,
		'max'        => 2,
	];

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_wordpress();
		Functions\when( 'get_users' )->alias(
			function ( array $args ): array {
				$this->assertSame( 'imgsig_deploy_status', $args['meta_key'] );
				$this->assertSame( 'EXISTS', $args['meta_compare'] );
				$ids = [];
				foreach ( $this->meta as $id => $meta ) {
					if ( isset( $meta['imgsig_deploy_status'] ) ) {
						$ids[] = (string) $id;
					}
				}
				return $ids;
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	private function reminders( InvitationQueue $queue ): InstallReminders {
		return new InstallReminders(
			$queue,
			function (): int {
				return $this->now;
			}
		);
	}

	/**
	 * @param array<string, mixed> $install Install channel record.
	 */
	private function status( int $user_id, array $install ): void {
		$this->meta[ $user_id ]['imgsig_deploy_status'] = [ 'install' => $install ];
	}

	public function test_due_after_n_days_until_installed_or_max_reached(): void {
		$s   = self::SETTINGS;
		$now = $this->now;

		// Invited 2 days ago → not yet; 3 days ago (same morning) → due.
		$this->assertFalse( InstallReminders::is_due( [ 'invited_at' => '2026-11-08 09:00:00' ], $s, $now ) );
		$this->assertTrue( InstallReminders::is_due( [ 'invited_at' => '2026-11-07 09:00:00' ], $s, $now ) );
		// Invited later in the day 3 days ago: the half-day slack still sends it today.
		$this->assertTrue( InstallReminders::is_due( [ 'invited_at' => '2026-11-07 16:30:00' ], $s, $now ) );

		// The next reminder counts from the previous one.
		$this->assertFalse(
			InstallReminders::is_due(
				[
					'invited_at'  => '2026-11-01 09:00:00',
					'reminded_at' => '2026-11-09 09:00:00',
					'reminders'   => 1,
				],
				$s,
				$now
			)
		);
		$this->assertTrue(
			InstallReminders::is_due(
				[
					'invited_at'  => '2026-11-01 09:00:00',
					'reminded_at' => '2026-11-07 09:00:00',
					'reminders'   => 1,
				],
				$s,
				$now
			)
		);

		// Max reached, installed, never invited → never.
		$this->assertFalse(
			InstallReminders::is_due(
				[
					'invited_at' => '2026-10-01 09:00:00',
					'reminders'  => 2,
				],
				$s,
				$now
			)
		);
		$this->assertFalse(
			InstallReminders::is_due(
				[
					'invited_at'   => '2026-10-01 09:00:00',
					'installed_at' => '2026-10-02 09:00:00',
				],
				$s,
				$now
			)
		);
		$this->assertFalse( InstallReminders::is_due( [], $s, $now ) );
	}

	public function test_daily_run_queues_due_users_as_a_reminder_job(): void {
		$this->options[ InstallReminders::OPTION ] = self::SETTINGS;
		$this->status( 1, [ 'invited_at' => '2026-11-06 09:00:00' ] );             // Due.
		$this->status( 2, [ 'invited_at' => '2026-11-09 09:00:00' ] );             // Too recent.
		$this->status(
			3,
			[
				'invited_at'   => '2026-11-01 09:00:00',
				'installed_at' => '2026-11-02 09:00:00',
			]
		);                                                                         // Installed.
		$this->status( 4, [] );                                                    // Other channels only.
		$this->meta[4]['imgsig_deploy_status'] = [ 'gmail' => [ 'at' => '2026-11-01 09:00:00' ] ];
		$this->status(
			5,
			[
				'invited_at'  => '2026-10-20 09:00:00',
				'reminded_at' => '2026-11-04 09:00:00',
				'reminders'   => 1,
			]
		);                                                                         // Due (second reminder).

		$queue = $this->createMock( InvitationQueue::class );
		$queue->method( 'is_running' )->willReturn( false );
		$queue->expects( $this->once() )
			->method( 'start' )
			->with( [ 1, 5 ], InvitationMailer::KIND_REMINDER )
			->willReturn( [ 'id' => 'j1' ] );

		$this->assertSame( 2, $this->reminders( $queue )->run() );
	}

	public function test_daily_run_does_nothing_when_disabled_or_busy(): void {
		$this->status( 1, [ 'invited_at' => '2026-11-01 09:00:00' ] );

		$queue = $this->createMock( InvitationQueue::class );
		$queue->expects( $this->never() )->method( 'start' );

		// Disabled by default.
		$this->assertSame( 0, $this->reminders( $queue )->run() );

		$this->options[ InstallReminders::OPTION ] = [ 'max' => 0 ] + self::SETTINGS;
		$this->assertSame( 0, $this->reminders( $queue )->run() );

		$this->options[ InstallReminders::OPTION ] = self::SETTINGS;
		$busy                                      = $this->createMock( InvitationQueue::class );
		$busy->method( 'is_running' )->willReturn( true );
		$busy->expects( $this->never() )->method( 'start' );
		$this->assertSame( 0, $this->reminders( $busy )->run() );
	}

	public function test_settings_default_off_and_are_clamped(): void {
		$this->assertSame(
			[
				'enabled'    => false,
				'after_days' => 3,
				'max'        => 2,
			],
			InstallReminders::settings()
		);

		$saved = InstallReminders::update(
			[
				'enabled'    => '1',
				'after_days' => 500,
				'max'        => -4,
				'evil'       => 'x',
			]
		);
		$this->assertSame(
			[
				'enabled'    => true,
				'after_days' => 60,
				'max'        => 0,
			],
			$saved
		);
		$this->assertSame( $saved, $this->options[ InstallReminders::OPTION ] );

		// Partial update keeps the rest.
		$this->assertSame( 7, InstallReminders::update( [ 'after_days' => '7' ] )['after_days'] );
		$this->assertTrue( InstallReminders::settings()['enabled'] );
		$this->assertFalse( InstallReminders::update( [ 'enabled' => false ] )['enabled'] );
	}
}
