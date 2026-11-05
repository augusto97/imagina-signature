<?php
/**
 * Unit tests for propagating template updates to linked signatures.
 *
 * @package ImaginaSignatures\Tests\Unit\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Services;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Models\Template;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Repositories\TemplateRepository;
use ImaginaSignatures\Services\TemplateLink;
use ImaginaSignatures\Services\TemplatePropagator;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/TemplateLinkTest.php';

/**
 * @covers \ImaginaSignatures\Services\TemplatePropagator
 */
final class TemplatePropagatorTest extends TestCase {

	/** @var array<string, mixed> */
	private array $options = [];

	/** @var array<int, array{hook: string, args: array<int, mixed>}> */
	private array $scheduled = [];

	/** @var array<int, array<string, mixed>> Writes by signature id. */
	private array $writes = [];

	/** @var int[] Templates whose signatures were detached. */
	private array $detached = [];

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->options   = [];
		$this->scheduled = [];
		$this->writes    = [];
		$this->detached  = [];

		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'get_option' )->alias(
			function ( $name, $default = false ) {
				return $this->options[ $name ] ?? $default;
			}
		);
		Functions\when( 'update_option' )->alias(
			function ( $name, $value ): bool {
				$this->options[ $name ] = $value;
				return true;
			}
		);
		Functions\when( 'wp_next_scheduled' )->justReturn( false );
		Functions\when( 'wp_schedule_single_event' )->alias(
			function ( $time, $hook, $args = [] ): bool {
				$this->scheduled[] = [
					'hook' => (string) $hook,
					'args' => (array) $args,
				];
				return true;
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * Repository holding `$count` signatures linked to template 4, ids 1..N.
	 * Every `$unchanged_every`-th one already matches the template.
	 */
	private function propagator( int $count, int $unchanged_every = 0 ): TemplatePropagator {
		$template = TemplateLinkTest::template();
		$rows     = [];
		for ( $id = 1; $id <= $count; $id++ ) {
			$schema = $unchanged_every > 0 && 0 === $id % $unchanged_every
				? TemplateLink::refresh( $template, [ 'variables' => [ 'n' => (string) $id ] ] )
				: [
					'schema_version' => '1.1',
					'meta'           => [ 'created_at' => 'c' ],
					'canvas'         => [ 'width' => 500 ],
					'blocks'         => [ [ 'id' => 'old', 'type' => 'text', 'content' => 'old design' ] ],
					'variables'      => [ 'n' => (string) $id ],
					'overrides'      => [ 'bio' => [ 'content' => '<p>Bio ' . $id . '</p>' ] ],
				];
			$rows[ $id ] = Signature::from_row(
				[
					'id'           => $id,
					'user_id'      => 100 + $id,
					'template_id'  => 4,
					'link_mode'    => 'linked',
					'json_content' => (string) json_encode( $schema ),
				]
			);
		}

		$signatures = $this->createMock( SignatureRepository::class );
		$signatures->method( 'count_linked_to_template' )->willReturn( $count );
		$signatures->method( 'find_linked_to_template' )->willReturnCallback(
			static function ( int $template_id, int $after_id, int $limit ) use ( $rows ): array {
				$out = [];
				foreach ( $rows as $id => $row ) {
					if ( $id > $after_id && count( $out ) < $limit ) {
						$out[] = $row;
					}
				}
				return $out;
			}
		);
		$signatures->method( 'update' )->willReturnCallback(
			function ( int $id, array $data ) use ( $rows ): Signature {
				$this->writes[ $id ] = $data;
				return $rows[ $id ];
			}
		);
		$signatures->method( 'detach_all_from_template' )->willReturnCallback(
			function ( int $template_id ): int {
				$this->detached[] = $template_id;
				return 3;
			}
		);

		$templates = $this->createMock( TemplateRepository::class );
		$templates->method( 'find' )->willReturn(
			Template::from_row(
				[
					'id'           => 4,
					'json_content' => (string) json_encode( $template ),
				]
			)
		);

		return new TemplatePropagator( $signatures, $templates );
	}

	public function test_small_sets_are_refreshed_in_the_same_request(): void {
		$progress = $this->propagator( 3 )->propagate( 4 );

		$this->assertSame( 'done', $progress['status'] );
		$this->assertSame( 3, $progress['processed'] );
		$this->assertSame( 3, $progress['updated'] );
		$this->assertSame( [], $this->scheduled );

		$schema = json_decode( (string) $this->writes[2]['json_content'], true );
		$index  = TemplateLink::index_blocks( $schema['blocks'] );
		$this->assertArrayNotHasKey( 'old', $index );
		$this->assertSame( '<p>Bio 2</p>', $index['bio']['block']['content'], 'Overrides survive.' );
		$this->assertSame( '2', $schema['variables']['n'], 'Variables survive.' );
		$this->assertSame( 600, $schema['canvas']['width'] );
		// Only the design is written: compiled_at untouched → the row is stale.
		$this->assertSame( [ 'json_content', 'schema_version' ], array_keys( $this->writes[2] ) );
	}

	public function test_rows_already_matching_the_template_are_left_alone(): void {
		$progress = $this->propagator( 4, 2 )->propagate( 4 );

		$this->assertSame( 4, $progress['processed'] );
		$this->assertSame( 2, $progress['updated'] );
		$this->assertSame( [ 1, 3 ], array_keys( $this->writes ) );
	}

	public function test_large_sets_run_in_cron_batches_of_100(): void {
		$propagator = $this->propagator( 250 );

		$progress = $propagator->propagate( 4 );
		$this->assertSame( 'queued', $progress['status'] );
		$this->assertSame( 0, $progress['processed'] );
		$this->assertSame( [], $this->writes, 'Nothing is refreshed in the saving request.' );
		$this->assertCount( 1, $this->scheduled );
		$this->assertSame( TemplatePropagator::CRON_HOOK, $this->scheduled[0]['hook'] );
		$this->assertSame( [ 4 ], $this->scheduled[0]['args'] );

		$first = $propagator->run_batch( 4 );
		$this->assertSame( 'running', $first['status'] );
		$this->assertSame( 100, $first['processed'] );
		$this->assertSame( 100, $first['last_id'] );
		$this->assertCount( 2, $this->scheduled );

		$propagator->run_batch( '4' );
		$last = $propagator->run_batch( 4 );
		$this->assertSame( 'done', $last['status'] );
		$this->assertSame( 250, $last['processed'] );
		$this->assertCount( 250, $this->writes );
		$this->assertCount( 3, $this->scheduled, 'No batch is scheduled after the last one.' );
		$this->assertSame( $last, $propagator->progress( 4 ) );
	}

	public function test_a_new_update_restarts_the_run(): void {
		$propagator = $this->propagator( 150 );
		$propagator->propagate( 4 );
		$propagator->run_batch( 4 );

		$restarted = $propagator->propagate( 4 );

		$this->assertSame( 0, $restarted['last_id'] );
		$this->assertSame( 0, $propagator->progress( 4 )['processed'] );
	}

	public function test_deleting_the_template_detaches_its_signatures(): void {
		Functions\expect( 'wp_clear_scheduled_hook' )->once()->with( TemplatePropagator::CRON_HOOK, [ 4 ] );
		$propagator                                         = $this->propagator( 0 );
		$this->options[ TemplatePropagator::PROGRESS_OPTION ] = [ 4 => [ 'template_id' => 4 ] ];

		$propagator->on_template_deleted( 4 );

		$this->assertSame( [ 4 ], $this->detached );
		$this->assertNull( $propagator->progress( 4 ) );
	}
}
