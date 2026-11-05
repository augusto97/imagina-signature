<?php
/**
 * Auto-push debounce, retries, daily sync batching.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment\Gmail
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment\Gmail;

use Brain\Monkey;
use ImaginaSignatures\Deployment\Gmail\GmailException;
use ImaginaSignatures\Deployment\Gmail\GmailPusher;
use ImaginaSignatures\Deployment\Gmail\GmailScheduler;
use ImaginaSignatures\Deployment\Gmail\GmailSettings;
use ImaginaSignatures\Deployment\Gmail\GmailUserDirectory;
use ImaginaSignatures\Deployment\Gmail\PushResult;
use ImaginaSignatures\Models\Signature;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/GmailTestHarness.php';

/**
 * @covers \ImaginaSignatures\Deployment\Gmail\GmailScheduler
 */
final class GmailSchedulerTest extends TestCase {

	use GmailTestHarness;

	/** @var int[] */
	private array $owners = [];

	/** @var int[] User IDs pushed by the mocked pusher. */
	private array $pushed = [];

	/** @var callable(int): string Status per user. */
	private $status_for;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->set_up_harness();
		$this->status_for = static function (): string {
			return PushResult::PUSHED;
		};
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * @param GmailSettings|null $settings Settings (default: connected, auto-push + daily sync on).
	 */
	private function scheduler( ?GmailSettings $settings = null ): GmailScheduler {
		$settings = $settings ?? $this->configured_settings(
			[
				'auto_push'  => true,
				'daily_sync' => true,
			]
		);

		$pusher = $this->createMock( GmailPusher::class );
		$pusher->method( 'push_user' )->willReturnCallback(
			function ( int $user_id ): PushResult {
				$this->pushed[] = $user_id;
				return new PushResult( $user_id, ( $this->status_for )( $user_id ) );
			}
		);

		$users = $this->createMock( GmailUserDirectory::class );
		$users->method( 'owner_ids_after' )->willReturnCallback(
			function ( int $after, int $limit ): array {
				$ids = array_values(
					array_filter(
						$this->owners,
						static function ( int $id ) use ( $after ): bool {
							return $id > $after;
						}
					)
				);
				return array_slice( $ids, 0, $limit );
			}
		);

		return new GmailScheduler( $settings, $pusher, $users );
	}

	/**
	 * @return array<int, array{hook: string, timestamp: int, args: array<int, mixed>, recurrence: string}>
	 */
	private function events( string $hook ): array {
		return array_values(
			array_filter(
				$this->cron,
				static function ( array $event ) use ( $hook ): bool {
					return $event['hook'] === $hook;
				}
			)
		);
	}

	private function retry_result( int $user_id, int $retries, int $retry_after = 0 ): PushResult {
		$result          = PushResult::failed(
			$user_id,
			new GmailException( GmailException::SERVER_ERROR, 'temporary', 503, true, $retry_after )
		);
		$result->retries = $retries;
		return $result;
	}

	public function test_boot_listens_to_the_primary_html_action_and_cron_hooks(): void {
		$scheduler = $this->scheduler();
		$scheduler->boot();

		$this->assertNotFalse( has_action( 'imgsig/deploy/primary_html_changed', [ $scheduler, 'on_primary_html_changed' ] ) );
		$this->assertNotFalse( has_action( 'imgsig/gmail/push_completed', [ $scheduler, 'maybe_schedule_retry' ] ) );
		$this->assertNotFalse( has_action( GmailScheduler::PUSH_HOOK, [ $scheduler, 'run_scheduled_push' ] ) );
		$this->assertNotFalse( has_action( GmailScheduler::DAILY_HOOK, [ $scheduler, 'run_daily_sync' ] ) );
		$this->assertNotFalse( has_action( GmailScheduler::BATCH_HOOK, [ $scheduler, 'run_sync_batch' ] ) );
	}

	public function test_primary_html_change_schedules_one_debounced_push_per_user(): void {
		$scheduler = $this->scheduler();
		$signature = Signature::from_row(
			[
				'id'      => 1,
				'user_id' => 5,
			]
		);

		$scheduler->on_primary_html_changed( 5, $signature );
		$scheduler->on_primary_html_changed( 5, $signature );
		$scheduler->on_primary_html_changed( '5', $signature );

		$events = $this->events( GmailScheduler::PUSH_HOOK );
		$this->assertCount( 1, $events );
		$this->assertSame( [ 5 ], $events[0]['args'] );
		$this->assertEqualsWithDelta( time() + 60, $events[0]['timestamp'], 2 );

		$scheduler->on_primary_html_changed( 6, $signature );
		$this->assertCount( 2, $this->events( GmailScheduler::PUSH_HOOK ) );

		// Once the pending event has run, the next change schedules again.
		$this->cron = [];
		$scheduler->on_primary_html_changed( 5, $signature );
		$this->assertCount( 1, $this->events( GmailScheduler::PUSH_HOOK ) );
	}

	public function test_nothing_is_scheduled_without_auto_push_or_credentials(): void {
		$this->scheduler( $this->configured_settings( [ 'auto_push' => false ] ) )->on_primary_html_changed( 5 );
		$this->scheduler( new GmailSettings( $this->encryption() ) )->on_primary_html_changed( 5 );
		$this->scheduler()->on_primary_html_changed( 0 );

		$this->assertSame( [], $this->events( GmailScheduler::PUSH_HOOK ) );
	}

	public function test_scheduled_push_runs_the_pusher(): void {
		$this->scheduler()->run_scheduled_push( '12' );
		$this->assertSame( [ 12 ], $this->pushed );
	}

	public function test_temporary_failures_are_retried_with_backoff(): void {
		$scheduler = $this->scheduler();

		$scheduler->maybe_schedule_retry( $this->retry_result( 5, 1 ) );
		$this->assertEqualsWithDelta( time() + 300, $this->events( GmailScheduler::PUSH_HOOK )[0]['timestamp'], 2 );

		$this->cron = [];
		$scheduler->maybe_schedule_retry( $this->retry_result( 5, 3 ) );
		$this->assertEqualsWithDelta( time() + 1200, $this->events( GmailScheduler::PUSH_HOOK )[0]['timestamp'], 2 );

		$this->cron = [];
		$scheduler->maybe_schedule_retry( $this->retry_result( 5, 1, 3600 ) );
		$this->assertEqualsWithDelta( time() + 3600, $this->events( GmailScheduler::PUSH_HOOK )[0]['timestamp'], 2, 'Retry-After wins' );

		$this->cron = [];
		$scheduler->maybe_schedule_retry( $this->retry_result( 5, GmailScheduler::MAX_RETRIES + 1 ) );
		$scheduler->maybe_schedule_retry( PushResult::failed( 5, new GmailException( GmailException::DELEGATION_MISSING, 'no' ) ) );
		$scheduler->maybe_schedule_retry( new PushResult( 5, PushResult::PUSHED ) );
		$this->assertSame( [], $this->cron );
	}

	public function test_an_edit_pulls_a_pending_retry_forward(): void {
		$scheduler = $this->scheduler();
		$scheduler->maybe_schedule_retry( $this->retry_result( 5, 2 ) );

		$scheduler->on_primary_html_changed( 5 );

		$events = $this->events( GmailScheduler::PUSH_HOOK );
		$this->assertCount( 1, $events );
		$this->assertEqualsWithDelta( time() + 60, $events[0]['timestamp'], 2 );
	}

	public function test_daily_event_follows_the_settings(): void {
		$settings = $this->configured_settings( [ 'daily_sync' => true ] );
		$this->scheduler( $settings )->ensure_daily_schedule();

		$daily = $this->events( GmailScheduler::DAILY_HOOK );
		$this->assertCount( 1, $daily );
		$this->assertSame( 'daily', $daily[0]['recurrence'] );

		// Idempotent.
		$this->scheduler( $settings )->ensure_daily_schedule();
		$this->assertCount( 1, $this->events( GmailScheduler::DAILY_HOOK ) );

		$this->cron[] = [
			'hook'       => GmailScheduler::BATCH_HOOK,
			'timestamp'  => time() + 60,
			'args'       => [],
			'recurrence' => '',
		];
		$settings->save( null, [ 'daily_sync' => false ] );
		$this->scheduler( new GmailSettings( $this->encryption() ) )->ensure_daily_schedule();
		$this->assertSame( [], $this->events( GmailScheduler::DAILY_HOOK ) );
		$this->assertSame( [], $this->events( GmailScheduler::BATCH_HOOK ) );
	}

	public function test_turning_auto_push_off_drops_pending_pushes(): void {
		$settings  = $this->configured_settings( [ 'auto_push' => true ] );
		$scheduler = $this->scheduler( $settings );
		$scheduler->on_primary_html_changed( 5 );
		$before = $settings->public_view();

		$settings->save( null, [ 'auto_push' => false ] );
		$this->scheduler( new GmailSettings( $this->encryption() ) )->sync_with_settings( $before );

		$this->assertSame( [], $this->events( GmailScheduler::PUSH_HOOK ) );
	}

	public function test_daily_sync_runs_in_batches_of_20_calls_with_a_cursor(): void {
		$this->owners = range( 101, 125 );
		$scheduler    = $this->scheduler();

		$scheduler->run_daily_sync();

		$this->assertSame( range( 101, 120 ), $this->pushed );
		$state = $this->options[ GmailScheduler::SYNC_OPTION ];
		$this->assertTrue( $state['running'] );
		$this->assertSame( 120, $state['after'] );
		$this->assertSame( 20, $state['pushed'] );
		$this->assertCount( 1, $this->events( GmailScheduler::BATCH_HOOK ) );

		$this->cron = [];
		$scheduler->run_sync_batch();

		$this->assertSame( range( 101, 125 ), $this->pushed );
		$state = $this->options[ GmailScheduler::SYNC_OPTION ];
		$this->assertFalse( $state['running'] );
		$this->assertSame( 25, $state['scanned'] );
		$this->assertSame( 25, $state['pushed'] );
		$this->assertNotSame( '', $state['finished_at'] );
		$this->assertSame( [], $this->events( GmailScheduler::BATCH_HOOK ) );

		// A finished pass does nothing until the next daily run.
		$scheduler->run_sync_batch();
		$this->assertCount( 25, $this->pushed );
	}

	public function test_up_to_date_users_do_not_count_towards_the_batch(): void {
		$this->owners     = range( 1, 60 );
		$this->status_for = static function ( int $user_id ): string {
			return 0 === $user_id % 2 ? PushResult::UP_TO_DATE : PushResult::ERROR;
		};

		$this->scheduler()->run_daily_sync();

		// 20 calls (odd users) reached at user 39; evens in between were free.
		$this->assertSame( range( 1, 39 ), $this->pushed );
		$state = $this->options[ GmailScheduler::SYNC_OPTION ];
		$this->assertSame( 20, $state['failed'] );
		$this->assertSame( 0, $state['pushed'] );
	}

	public function test_daily_sync_is_a_no_op_when_disabled(): void {
		$this->owners = [ 1, 2 ];
		$this->scheduler( $this->configured_settings( [ 'daily_sync' => false ] ) )->run_daily_sync();

		$this->assertSame( [], $this->pushed );
		$this->assertArrayNotHasKey( GmailScheduler::SYNC_OPTION, $this->options );
	}

	public function test_a_running_pass_is_resumed_not_restarted(): void {
		$this->options[ GmailScheduler::SYNC_OPTION ] = [
			'running'    => true,
			'after'      => 50,
			'started_at' => gmdate( 'Y-m-d H:i:s', time() - 600 ),
		];
		$this->owners                                 = range( 1, 60 );

		$this->scheduler()->run_daily_sync();

		$this->assertSame( [], $this->pushed );
		$this->assertCount( 1, $this->events( GmailScheduler::BATCH_HOOK ) );
		$this->assertSame( 50, $this->options[ GmailScheduler::SYNC_OPTION ]['after'] );
	}

	public function test_unschedule_all_clears_every_gmail_event(): void {
		foreach ( [ GmailScheduler::PUSH_HOOK, GmailScheduler::DAILY_HOOK, GmailScheduler::BATCH_HOOK, 'imgsig_daily_cleanup' ] as $hook ) {
			$this->cron[] = [
				'hook'       => $hook,
				'timestamp'  => time(),
				'args'       => GmailScheduler::PUSH_HOOK === $hook ? [ 3 ] : [],
				'recurrence' => '',
			];
		}

		GmailScheduler::unschedule_all();

		$this->assertSame( [ 'imgsig_daily_cleanup' ], array_column( $this->cron, 'hook' ) );
	}
}
