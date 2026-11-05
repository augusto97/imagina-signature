<?php
/**
 * Unit tests for the invitation queue (WP-Cron batches).
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Deployment\Install\InstallService;
use ImaginaSignatures\Deployment\Install\InvitationMailer;
use ImaginaSignatures\Deployment\Install\InvitationQueue;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Services\SignatureService;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/DeploymentStubs.php';

/**
 * @covers \ImaginaSignatures\Deployment\Install\InvitationQueue
 */
final class InvitationQueueTest extends TestCase {

	use DeploymentStubs;

	/** @var array<int, array{0: int, 1: string, 2: array<int, mixed>}> */
	private array $scheduled = [];

	/** @var array<int, array<int, mixed>> */
	private array $sent = [];

	/** @var array<int, Signature|null> */
	private array $primaries = [];

	/** @var int[] Recipients wp_mail() refuses. */
	private array $failing = [];

	private int $now = 1793865600;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_wordpress();
		$this->scheduled = [];
		$this->sent      = [];
		$this->primaries = [];
		$this->failing   = [];

		Functions\when( 'wp_schedule_single_event' )->alias(
			function ( $ts, $hook, $args = [] ): bool {
				$this->scheduled[] = [ (int) $ts, (string) $hook, (array) $args ];
				return true;
			}
		);
		Functions\when( 'wp_next_scheduled' )->justReturn( false );
		Functions\when( 'wp_unschedule_hook' )->justReturn( 0 );
		Functions\when( 'home_url' )->alias(
			static function ( $path = '' ): string {
				return 'https://example.com' . $path;
			}
		);
		Functions\when( 'esc_url_raw' )->returnArg( 1 );
		$this->options['permalink_structure'] = '/%postname%/';
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	private function queue(): InvitationQueue {
		$signatures = $this->createMock( SignatureService::class );
		$signatures->method( 'primary_for_user' )->willReturnCallback(
			function ( int $user_id ): ?Signature {
				return $this->primaries[ $user_id ] ?? null;
			}
		);
		$clock   = function (): int {
			return $this->now;
		};
		$service = new InstallService( $signatures, $clock );

		$mailer = $this->createMock( InvitationMailer::class );
		$mailer->method( 'send' )->willReturnCallback(
			function ( $user, string $url, string $kind, string $message = '', $reply_to = null ): bool {
				$this->sent[] = [ (int) $user->ID, $url, $kind, $message, $reply_to ];
				return ! in_array( (int) $user->ID, $this->failing, true );
			}
		);

		return new InvitationQueue( $service, $mailer, $clock );
	}

	private function ready_users( int $from, int $to ): array {
		$ids = [];
		for ( $id = $from; $id <= $to; $id++ ) {
			$this->add_user( $id );
			$this->primaries[ $id ] = self::signature( $id );
			$ids[]                  = $id;
		}
		return $ids;
	}

	/**
	 * Runs the most recently scheduled batch event.
	 */
	private function run_scheduled( InvitationQueue $queue ): void {
		$event = array_pop( $this->scheduled );
		$this->assertNotNull( $event, 'a batch should be scheduled' );
		$this->assertSame( InvitationQueue::BATCH_HOOK, $event[1] );
		$queue->run_batch( ...$event[2] );
	}

	public function test_start_dedupes_queues_and_schedules_a_single_event_for_the_job(): void {
		$progress = $this->queue()->start( [ 3, 3, '4', 0, -1, 5 ], InvitationMailer::KIND_INVITE, '<b>Hola</b> equipo', 1 );

		$this->assertSame( 3, $progress['total'] );
		$this->assertTrue( $progress['running'] );
		$this->assertSame( 0, $progress['percent'] );
		$this->assertArrayNotHasKey( 'message', $progress );
		$this->assertSame( [ 3, 4, 5 ], $this->options[ InvitationQueue::OPTION ]['pending'] );
		$this->assertSame( 'Hola equipo', $this->options[ InvitationQueue::OPTION ]['message'] );

		$this->assertCount( 1, $this->scheduled );
		[ $ts, $hook, $args ] = $this->scheduled[0];
		$this->assertSame( $this->now, $ts );
		$this->assertSame( InvitationQueue::BATCH_HOOK, $hook );
		$this->assertSame( [ $progress['id'] ], $args );

		$this->assertNull( $this->queue()->start( [ 6 ], InvitationMailer::KIND_INVITE ), 'one run at a time' );
		$this->assertNull( ( new InvitationQueue( $this->createMock( InstallService::class ), $this->createMock( InvitationMailer::class ) ) )->start( [], 'invite' ) );
	}

	public function test_batches_of_fifty_are_chained_until_everyone_is_emailed(): void {
		$queue = $this->queue();
		$queue->start( $this->ready_users( 1, 120 ), InvitationMailer::KIND_INVITE, 'Bienvenidos', 1 );
		array_pop( $this->scheduled );
		$job_id = $this->options[ InvitationQueue::OPTION ]['id'];

		$queue->run_batch( $job_id );
		$this->assertCount( 50, $this->sent );
		$this->assertSame( 50, $queue->progress()['sent'] );
		$this->assertCount( 1, $this->scheduled, 'the next batch is chained' );
		$this->assertSame( [ $job_id ], $this->scheduled[0][2] );

		$this->run_scheduled( $queue );
		$this->assertCount( 100, $this->sent );
		$this->assertSame( 83, $queue->progress()['percent'] );

		$this->run_scheduled( $queue );
		$this->assertCount( 120, $this->sent );
		$this->assertSame( [], $this->scheduled, 'nothing left to chain' );

		$progress = $queue->progress();
		$this->assertSame( 'done', $progress['status'] );
		$this->assertFalse( $progress['running'] );
		$this->assertSame( 100, $progress['percent'] );
		$this->assertSame( 0, $progress['pending'] );
		$this->assertNotNull( $progress['finished_at'] );

		// Emails carry the personal link, the message and the sender.
		[ $user_id, $url, $kind, $message ] = $this->sent[0];
		$this->assertSame( 1, $user_id );
		$this->assertMatchesRegularExpression( '#^https://example.com/signatures/install/[a-f0-9]{64}/$#', $url );
		$this->assertSame( 'invite', $kind );
		$this->assertSame( 'Bienvenidos', $message );

		// DeploymentStatus 'install' { invited_at, hash }.
		$record = $this->meta[1]['imgsig_deploy_status']['install'];
		$this->assertSame( '2026-11-05 08:00:00', $record['invited_at'] );
		$this->assertSame( $this->primaries[1]->html_hash, $record['hash'] );
		$this->assertSame( 0, $record['reminders'] );
	}

	public function test_batch_size_is_filterable(): void {
		Functions\when( 'apply_filters' )->alias(
			static function ( $hook, $value ) {
				return 'imgsig/deploy/invitation_batch_size' === $hook ? 2 : $value;
			}
		);
		$queue = $this->queue();
		$queue->start( $this->ready_users( 1, 5 ), InvitationMailer::KIND_INVITE );
		$this->run_scheduled( $queue );
		$this->assertCount( 2, $this->sent );
	}

	public function test_users_without_a_ready_signature_are_skipped_and_reported(): void {
		$this->ready_users( 1, 2 );
		$this->add_user( 3 );                                        // No primary signature.
		$this->add_user( 4 );
		$this->primaries[4] = self::signature( 4, false );           // Stale HTML.
		$this->add_user( 5, [ 'user_email' => 'not-an-email' ] );
		$this->primaries[5] = self::signature( 5 );
		$this->add_user( 6, [], [] );                                 // Lost access.
		$this->primaries[6] = self::signature( 6 );
		$this->ready_users( 7, 7 );
		$this->failing = [ 7 ];

		$queue = $this->queue();
		$queue->start( [ 1, 2, 3, 4, 5, 6, 7, 99 ], InvitationMailer::KIND_INVITE );
		$this->run_scheduled( $queue );

		$this->assertSame( [ 1, 2, 7 ], array_column( $this->sent, 0 ) );

		$progress = $queue->progress();
		$this->assertSame( 2, $progress['sent'] );
		$this->assertSame( 1, $progress['failed'] );
		$this->assertSame( 5, $progress['skipped'] );
		$this->assertSame( 'done', $progress['status'] );

		$reasons = array_column( $progress['report'], 'reason', 'user_id' );
		$this->assertSame(
			[
				3  => 'no_signature',
				4  => 'not_ready',
				5  => 'no_email',
				6  => 'no_access',
				7  => 'mail_failed',
				99 => 'no_user',
			],
			$reasons
		);
		$names = array_column( $progress['report'], 'name', 'user_id' );
		$this->assertSame( 'User 3', $names[3] );

		// Skipped / failed users get no "invited" record.
		foreach ( [ 3, 4, 5, 6, 7 ] as $id ) {
			$this->assertArrayNotHasKey( 'imgsig_deploy_status', $this->meta[ $id ] ?? [] );
		}
	}

	public function test_reminders_skip_users_who_installed_meanwhile(): void {
		$this->ready_users( 1, 2 );
		$this->meta[2]['imgsig_deploy_status'] = [
			'install' => [
				'invited_at'   => '2026-11-01 08:00:00',
				'installed_at' => '2026-11-03 08:00:00',
				'hash'         => 'x',
			],
		];

		$queue = $this->queue();
		$queue->start( [ 1, 2 ], InvitationMailer::KIND_REMINDER, 'ignored for reminders' );
		$this->assertSame( '', $this->options[ InvitationQueue::OPTION ]['message'] );
		$this->run_scheduled( $queue );

		$this->assertSame( [ 1 ], array_column( $this->sent, 0 ) );
		$this->assertSame( 'reminder', $this->sent[0][2] );
		$this->assertSame( 1, $this->meta[1]['imgsig_deploy_status']['install']['reminders'] );
		$this->assertSame( 'already_installed', $queue->progress()['report'][0]['reason'] );
	}

	public function test_cancel_stops_the_run_and_a_late_batch_sends_nothing(): void {
		$queue = $this->queue();
		$queue->start( $this->ready_users( 1, 10 ), InvitationMailer::KIND_INVITE );

		$progress = $queue->cancel();
		$this->assertSame( 'cancelled', $progress['status'] );
		$this->assertSame( 0, $progress['pending'] );

		$this->run_scheduled( $queue );
		$this->assertSame( [], $this->sent );
		$this->assertNotNull( $queue->start( [ 1 ], InvitationMailer::KIND_INVITE ), 'a new run can start' );
	}

	public function test_a_batch_for_another_job_or_while_locked_does_nothing(): void {
		$queue = $this->queue();
		$queue->start( $this->ready_users( 1, 3 ), InvitationMailer::KIND_INVITE );

		$queue->run_batch( 'j-some-old-job' );
		$this->assertSame( [], $this->sent );

		$this->options[ InvitationQueue::LOCK_OPTION ] = $this->now - 30;
		$queue->run_batch( $this->options[ InvitationQueue::OPTION ]['id'] );
		$this->assertSame( [], $this->sent, 'another runner holds the lock' );

		$this->options[ InvitationQueue::LOCK_OPTION ] = $this->now - 3600;
		$queue->run_batch( $this->options[ InvitationQueue::OPTION ]['id'] );
		$this->assertCount( 3, $this->sent, 'an abandoned lock is taken over' );
		$this->assertArrayNotHasKey( InvitationQueue::LOCK_OPTION, $this->options, 'the lock is released' );
	}

	public function test_ensure_scheduled_rearms_a_broken_chain(): void {
		$queue = $this->queue();
		$queue->start( $this->ready_users( 1, 3 ), InvitationMailer::KIND_INVITE );
		$this->scheduled = [];

		$queue->ensure_scheduled();
		$this->assertCount( 1, $this->scheduled );

		$queue->cancel();
		$this->scheduled = [];
		$queue->ensure_scheduled();
		$this->assertSame( [], $this->scheduled );
	}
}
