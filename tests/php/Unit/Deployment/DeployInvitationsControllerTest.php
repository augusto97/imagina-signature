<?php
/**
 * Unit tests for the invitations REST endpoints.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Api\Controllers\DeployInvitationsController;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Deployment\Install\InstallReminders;
use ImaginaSignatures\Deployment\Install\InvitationQueue;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/DeploymentStubs.php';

/**
 * @covers \ImaginaSignatures\Api\Controllers\DeployInvitationsController
 */
final class DeployInvitationsControllerTest extends TestCase {

	use DeploymentStubs;

	private bool $groups = false;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_wordpress();
		$this->groups = false;

		Functions\when( 'rest_ensure_response' )->alias(
			static function ( $data ) {
				return $data instanceof \WP_REST_Response ? $data : new \WP_REST_Response( $data );
			}
		);
		Functions\when( 'rest_sanitize_boolean' )->alias(
			static function ( $value ): bool {
				return in_array( $value, [ true, 1, '1', 'true' ], true );
			}
		);
		Functions\when( 'get_current_user_id' )->justReturn( 1 );
		Functions\when( 'get_users' )->alias(
			function ( array $args ): array {
				$this->assertSame( 'imgsig_use_signatures', $args['capability'] );
				return [ '2', '3', '4' ];
			}
		);
		Functions\when( 'taxonomy_exists' )->alias(
			function ( $taxonomy ): bool {
				return $this->groups && 'imgsig_group' === $taxonomy;
			}
		);
		Functions\when( 'get_objects_in_term' )->alias(
			static function ( $terms, $taxonomy ): array {
				return in_array( 77, (array) $terms, true ) ? [ '4', '8' ] : [];
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	private function controller( InvitationQueue $queue ): DeployInvitationsController {
		return new DeployInvitationsController( $queue, $this->createMock( RateLimiter::class ) );
	}

	public function test_recipients_merge_all_users_and_groups_without_duplicates(): void {
		$this->groups = true;
		$warnings     = [];
		$ids          = $this->controller( $this->createMock( InvitationQueue::class ) )->resolve_recipients(
			new \WP_REST_Request(
				[
					'all'       => true,
					'user_ids'  => [ 3, '9', 'x', -2 ],
					'group_ids' => [ 77 ],
				]
			),
			$warnings
		);

		$this->assertSame( [ 2, 3, 4, 9, 8 ], $ids );
		$this->assertSame( [], $warnings );
	}

	public function test_groups_are_ignored_with_a_warning_until_the_taxonomy_exists(): void {
		$warnings = [];
		$ids      = $this->controller( $this->createMock( InvitationQueue::class ) )->resolve_recipients(
			new \WP_REST_Request(
				[
					'user_ids'  => [ 5 ],
					'group_ids' => [ 77 ],
				]
			),
			$warnings
		);
		$this->assertSame( [ 5 ], $ids );
		$this->assertSame( [ 'groups_unavailable' ], $warnings );
	}

	public function test_create_queues_an_invitation_run(): void {
		$queue = $this->createMock( InvitationQueue::class );
		$queue->method( 'is_running' )->willReturn( false );
		$queue->expects( $this->once() )
			->method( 'start' )
			->with( [ 5, 6 ], 'invite', 'Hola', 1 )
			->willReturn( [ 'id' => 'j1', 'total' => 2 ] );

		$response = $this->controller( $queue )->create(
			new \WP_REST_Request(
				[
					'user_ids' => [ 5, 6 ],
					'message'  => 'Hola',
				]
			)
		);

		$this->assertInstanceOf( \WP_REST_Response::class, $response );
		$this->assertSame( 202, $response->get_status() );
		$this->assertSame( 2, $response->get_data()['total'] );
	}

	public function test_create_rejects_empty_selections_and_concurrent_runs(): void {
		$queue = $this->createMock( InvitationQueue::class );
		$queue->method( 'is_running' )->willReturn( false );
		$queue->expects( $this->never() )->method( 'start' );

		$empty = $this->controller( $queue )->create( new \WP_REST_Request( [ 'user_ids' => [] ] ) );
		$this->assertInstanceOf( \WP_Error::class, $empty );
		$this->assertSame( 400, $empty->get_error_data()['status'] );

		$busy_queue = $this->createMock( InvitationQueue::class );
		$busy_queue->method( 'is_running' )->willReturn( true );
		$busy = $this->controller( $busy_queue )->create( new \WP_REST_Request( [ 'all' => true ] ) );
		$this->assertInstanceOf( \WP_Error::class, $busy );
		$this->assertSame( 'imgsig_invitations_running', $busy->get_error_code() );
		$this->assertSame( 409, $busy->get_error_data()['status'] );
	}

	public function test_progress_rearms_the_chain_and_reports_idle_before_any_run(): void {
		$queue = $this->createMock( InvitationQueue::class );
		$queue->expects( $this->once() )->method( 'ensure_scheduled' );
		$queue->method( 'progress' )->willReturn( null );

		$data = $this->controller( $queue )->progress()->get_data();
		$this->assertSame( 'idle', $data['status'] );
		$this->assertFalse( $data['running'] );
	}

	public function test_settings_round_trip(): void {
		$controller = $this->controller( $this->createMock( InvitationQueue::class ) );
		$this->assertFalse( $controller->get_settings()->get_data()['enabled'] );

		$data = $controller->update_settings(
			new \WP_REST_Request(
				[
					'enabled'    => true,
					'after_days' => 5,
				]
			)
		)->get_data();
		$this->assertTrue( $data['enabled'] );
		$this->assertSame( 5, $data['after_days'] );
		$this->assertSame( 2, $data['max'] );
		$this->assertSame( $data, $this->options[ InstallReminders::OPTION ] );
	}
}
