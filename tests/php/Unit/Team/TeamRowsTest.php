<?php
/**
 * Unit tests for the team console row model.
 *
 * @package ImaginaSignatures\Tests\Unit\Team
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Team;

use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Team\TeamRows;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Team\TeamRows
 */
final class TeamRowsTest extends TestCase {

	/**
	 * @param array<string, mixed> $row Column overrides.
	 */
	private static function sig( array $row ): Signature {
		return Signature::from_row(
			$row + [
				'user_id'     => 7,
				'name'        => 'Main',
				'status'      => 'draft',
				'has_html'    => 1,
				'html_hash'   => 'h-' . ( $row['id'] ?? 0 ),
				'compiled_at' => '2026-11-05 10:00:00',
				'updated_at'  => '2026-11-05 10:00:00',
			]
		);
	}

	public function test_primary_follows_the_same_rule_as_the_signature_service(): void {
		$newest_draft = self::sig( [ 'id' => 3 ] );
		$older_ready  = self::sig(
			[
				'id'     => 2,
				'status' => 'ready',
			]
		);
		$oldest       = self::sig( [ 'id' => 1 ] );
		$list         = [ $newest_draft, $older_ready, $oldest ];

		$this->assertSame( 1, TeamRows::primary_of( $list, 1 )->id, 'The marked one wins.' );
		$this->assertSame( 2, TeamRows::primary_of( $list, 99 )->id, 'A deleted marked one falls back to the newest ready.' );
		$this->assertSame( 3, TeamRows::primary_of( [ $newest_draft, $oldest ], 0 )->id, 'Else the newest.' );
		$this->assertNull( TeamRows::primary_of( [], 0 ) );
	}

	public function test_row_describes_the_primary_signature_and_its_link(): void {
		$linked = self::sig(
			[
				'id'          => 4,
				'template_id' => 9,
				'link_mode'   => 'linked',
			]
		);
		$row    = TeamRows::state( 7, [ $linked ], 4, null, [] );

		$this->assertSame( 1, $row['signature_count'] );
		$this->assertSame( 'linked', $row['primary']['link'] );
		$this->assertTrue( $row['primary']['marked'] );
		$this->assertSame( 9, $row['primary']['template_id'] );

		$copy = self::sig(
			[
				'id'          => 4,
				'template_id' => 9,
			]
		);
		$this->assertSame( 'copy', TeamRows::state( 7, [ $copy ], 0, null, [] )['primary']['link'] );
		$this->assertSame( 'none', TeamRows::state( 7, [ self::sig( [ 'id' => 4 ] ) ], 0, null, [] )['primary']['link'] );
		$this->assertFalse( TeamRows::state( 7, [ $copy ], 0, null, [] )['primary']['marked'] );
	}

	public function test_html_state_is_none_outdated_or_fresh(): void {
		$this->assertSame( 'none', TeamRows::html_state( null )['state'] );
		$this->assertSame( 'none', TeamRows::html_state( self::sig( [ 'id' => 1, 'has_html' => 0 ] ) )['state'] );
		$this->assertSame( 'outdated', TeamRows::html_state( self::sig( [ 'id' => 1, 'compiled_at' => null ] ) )['state'], 'Marked outdated by an input change.' );
		$this->assertSame( 'outdated', TeamRows::html_state( self::sig( [ 'id' => 1, 'updated_at' => '2026-11-05 11:00:00' ] ) )['state'], 'Edited after the compile.' );

		$fresh = TeamRows::html_state( self::sig( [ 'id' => 1 ] ) );
		$this->assertSame( 'fresh', $fresh['state'] );
		$this->assertSame( '2026-11-05 10:00:00', $fresh['compiled_at'] );
	}

	public function test_gmail_column(): void {
		$primary = self::sig( [ 'id' => 1 ] );

		$this->assertSame( 'not_configured', TeamRows::gmail_state( [ 'hash' => 'h-1' ], $primary, false )['state'] );
		$this->assertSame( 'never', TeamRows::gmail_state( null, $primary, true )['state'] );

		$pushed = TeamRows::gmail_state(
			[
				'hash'   => 'h-1',
				'at'     => '2026-11-05 10:05:00',
				'status' => 'pushed',
			],
			$primary,
			true
		);
		$this->assertSame( [ 'state' => 'pushed', 'at' => '2026-11-05 10:05:00', 'message' => '' ], $pushed );

		$behind = TeamRows::gmail_state(
			[
				'hash'    => 'h-old',
				'at'      => '2026-11-01 10:05:00',
				'status'  => 'needs_recompile',
				'message' => 'Needs recompile',
			],
			$primary,
			true
		);
		$this->assertSame( 'outdated', $behind['state'] );
		$this->assertSame( 'Needs recompile', $behind['message'] );

		$failed = TeamRows::gmail_state(
			[
				'hash'       => 'h-1',
				'error'      => 'Delegation is not set up.',
				'checked_at' => '2026-11-05 10:06:00',
			],
			$primary,
			true
		);
		$this->assertSame( [ 'state' => 'failed', 'at' => '2026-11-05 10:06:00', 'message' => 'Delegation is not set up.' ], $failed );

		$skipped = TeamRows::gmail_state(
			[
				'status'  => 'domain_not_allowed',
				'message' => 'acme.org is not allowed',
			],
			$primary,
			true
		);
		$this->assertSame( 'skipped', $skipped['state'] );
		$this->assertSame( 'acme.org is not allowed', $skipped['message'] );
	}

	public function test_outlook_column(): void {
		$primary = self::sig( [ 'id' => 1 ] );

		$this->assertSame( 'not_configured', TeamRows::outlook_state( [ 'hash' => 'h-1' ], $primary, false )['state'] );
		$this->assertSame( 'never', TeamRows::outlook_state( null, $primary, true )['state'] );
		$this->assertSame(
			[
				'state' => 'delivered',
				'at'    => '2026-11-05 09:00:00',
			],
			TeamRows::outlook_state(
				[
					'hash' => 'h-1',
					'at'   => '2026-11-05 09:00:00',
				],
				$primary,
				true
			)
		);
		$this->assertSame( 'outdated', TeamRows::outlook_state( [ 'hash' => 'h-0' ], $primary, true )['state'] );
	}

	public function test_install_column(): void {
		$primary = self::sig( [ 'id' => 1 ] );

		$this->assertSame( 'none', TeamRows::install_state( null, $primary )['state'] );
		$this->assertSame( 'invited', TeamRows::install_state( [ 'invited_at' => '2026-11-01 08:00:00' ], $primary )['state'] );
		$this->assertSame(
			'opened',
			TeamRows::install_state(
				[
					'invited_at' => '2026-11-01 08:00:00',
					'opened_at'  => '2026-11-01 09:00:00',
				],
				$primary
			)['state']
		);
		$installed = TeamRows::install_state(
			[
				'installed_at' => '2026-11-02 08:00:00',
				'hash'         => 'h-1',
				'client'       => 'gmail',
				'reminders'    => 2,
			],
			$primary
		);
		$this->assertSame( 'installed', $installed['state'] );
		$this->assertSame( 'gmail', $installed['client'] );
		$this->assertSame( 2, $installed['reminders'] );
		$this->assertSame(
			'outdated',
			TeamRows::install_state(
				[
					'installed_at' => '2026-11-02 08:00:00',
					'hash'         => 'h-0',
				],
				$primary
			)['state']
		);
	}

	public function test_deploy_meta_of_unknown_shape_is_ignored(): void {
		$row = TeamRows::state(
			7,
			[ self::sig( [ 'id' => 1 ] ) ],
			0,
			[
				'gmail' => 'garbage',
				'other' => [ 'hash' => 'x' ],
			],
			[
				'gmail'   => true,
				'outlook' => true,
			]
		);
		$this->assertSame( 'never', $row['gmail']['state'] );
		$this->assertSame( 'never', $row['outlook']['state'] );
	}

	public function test_state_filters_and_counters(): void {
		$channels = [
			'gmail'   => true,
			'outlook' => true,
		];
		$rows     = [
			// No signature.
			TeamRows::state( 1, [], 0, null, $channels ),
			// Fresh, pushed, installed.
			TeamRows::state(
				2,
				[ self::sig( [ 'id' => 20 ] ) ],
				0,
				[
					'gmail'   => [ 'hash' => 'h-20' ],
					'outlook' => [ 'hash' => 'h-20' ],
					'install' => [
						'installed_at' => '2026-11-02 08:00:00',
						'hash'         => 'h-20',
					],
				],
				$channels
			),
			// Outdated HTML, Gmail failed, install outdated.
			TeamRows::state(
				3,
				[ self::sig( [ 'id' => 30, 'compiled_at' => null ] ) ],
				0,
				[
					'gmail'   => [ 'error' => 'boom' ],
					'install' => [
						'installed_at' => '2026-11-02 08:00:00',
						'hash'         => 'h-old',
					],
				],
				$channels
			),
			// Invited only.
			TeamRows::state( 4, [ self::sig( [ 'id' => 40 ] ) ], 0, [ 'install' => [ 'invited_at' => '2026-11-01 08:00:00' ] ], $channels ),
		];

		$ids = static function ( string $state ) use ( $rows ): array {
			return array_values(
				array_map(
					static fn( array $row ): int => $row['user_id'],
					array_filter( $rows, static fn( array $row ): bool => TeamRows::matches( $row, $state ) )
				)
			);
		};

		$this->assertSame( [ 1, 2, 3, 4 ], $ids( 'all' ) );
		$this->assertSame( [ 1 ], $ids( 'no_signature' ) );
		$this->assertSame( [ 3 ], $ids( 'outdated' ) );
		$this->assertSame( [ 2, 4 ], $ids( 'up_to_date' ) );
		$this->assertSame( [ 3 ], $ids( 'gmail_failed' ) );
		$this->assertSame( [ 4 ], $ids( 'not_installed' ) );
		$this->assertSame( [ 3 ], $ids( 'install_outdated' ) );

		$this->assertSame(
			[
				'users'             => 4,
				'with_signature'    => 3,
				'without_signature' => 1,
				'outdated_html'     => 1,
				'gmail_pushed'      => 1,
				'gmail_failed'      => 1,
				'outlook_delivered' => 1,
				'installed'         => 1,
				'install_outdated'  => 1,
				'not_installed'     => 1,
			],
			TeamRows::summarize( $rows )
		);
	}
}
