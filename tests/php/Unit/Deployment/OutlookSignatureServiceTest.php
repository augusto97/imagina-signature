<?php
/**
 * Unit tests for the Outlook signature resolver.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment;

use Brain\Monkey;
use Brain\Monkey\Filters;
use Brain\Monkey\Functions;
use ImaginaSignatures\Deployment\DeploymentStatus;
use ImaginaSignatures\Deployment\OutlookSignatureService;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Services\SignatureService;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/OutlookStubs.php';

/**
 * @covers \ImaginaSignatures\Deployment\OutlookSignatureService
 */
final class OutlookSignatureServiceTest extends TestCase {

	use OutlookStubs;

	private const HTML = '<table role="presentation"><tr><td>Ana Pérez</td></tr></table>';

	/** @var array<string, \WP_User> Users by stored email, as a case-insensitive collation finds them. */
	private array $users = [];

	/** @var array<int, string> Emails get_user_by() was asked for. */
	private array $lookups = [];

	private int $now = 1767225600; // 2026-01-01 00:00:00 UTC.

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_outlook_wp();

		$this->users = [
			'ana@acme.example' => new \WP_User(
				[
					'ID'         => 7,
					'user_email' => 'Ana@Acme.example',
				]
			),
		];
		Functions\when( 'get_user_by' )->alias(
			function ( $field, $value ) {
				$this->lookups[] = (string) $value;
				return 'email' === $field ? ( $this->users[ strtolower( (string) $value ) ] ?? false ) : false;
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * @param array<string, mixed>|null $row Signature row (null = user has none).
	 */
	private function service( ?array $row ): OutlookSignatureService {
		$signatures = $this->createMock( SignatureService::class );
		$signatures->method( 'primary_for_user' )->willReturn( null === $row ? null : Signature::from_row( $row ) );
		return new OutlookSignatureService(
			$signatures,
			function (): int {
				return $this->now;
			}
		);
	}

	/**
	 * @param array<string, mixed> $overrides Column overrides.
	 *
	 * @return array<string, mixed>
	 */
	private function fresh_row( array $overrides = [] ): array {
		return array_merge(
			[
				'id'          => 12,
				'user_id'     => 7,
				'html_cache'  => self::HTML,
				'html_hash'   => hash( 'sha256', self::HTML ),
				'compiled_at' => '2026-01-01 10:00:00',
				'updated_at'  => '2026-01-01 10:00:00',
			],
			$overrides
		);
	}

	public function test_email_lookup_is_case_insensitive(): void {
		$service = $this->service( $this->fresh_row() );

		$user = $service->find_user( '  ANA@ACME.EXAMPLE ' );
		$this->assertNotNull( $user );
		$this->assertSame( 7, $user->ID );
		$this->assertSame( 'ana@acme.example', $this->lookups[0], 'Looked up lower-cased first.' );

		$resolved = $service->resolve( 'Ana@acme.EXAMPLE' );
		$this->assertSame(
			[
				'user_id' => 7,
				'html'    => self::HTML,
				'hash'    => hash( 'sha256', self::HTML ),
			],
			$resolved
		);
	}

	public function test_unknown_or_invalid_addresses_resolve_to_null(): void {
		$service = $this->service( $this->fresh_row() );

		$this->assertNull( $service->resolve( 'nobody@acme.example' ) );
		$this->lookups = [];
		$this->assertNull( $service->resolve( 'not an email' ) );
		$this->assertNull( $service->resolve( '' ) );
		$this->assertSame( [], $this->lookups, 'Invalid input never reaches the user table.' );
	}

	public function test_a_user_returned_for_another_address_is_rejected(): void {
		Functions\when( 'get_user_by' )->justReturn(
			new \WP_User(
				[
					'ID'         => 9,
					'user_email' => 'someone-else@acme.example',
				]
			)
		);
		$this->assertNull( $this->service( $this->fresh_row() )->resolve( 'ana@acme.example' ) );
	}

	public function test_alias_filter_can_map_an_address(): void {
		Filters\expectApplied( 'imgsig/outlook/user_for_email' )
			->once()
			->andReturnUsing(
				function ( $user, $email ) {
					return 'a.perez@acme.example' === $email ? $this->users['ana@acme.example'] : $user;
				}
			);

		$resolved = $this->service( $this->fresh_row() )->resolve( 'A.Perez@acme.example' );
		$this->assertSame( 7, $resolved['user_id'] ?? null );
	}

	public function test_missing_stale_empty_or_oversized_html_is_not_served(): void {
		$this->assertNull( $this->service( null )->resolve( 'ana@acme.example' ), 'No signature.' );

		$stale = $this->fresh_row( [ 'updated_at' => '2026-01-01 11:00:00' ] );
		$this->assertNull( $this->service( $stale )->resolve( 'ana@acme.example' ), 'Edited after the last compile.' );

		$never = $this->fresh_row(
			[
				'html_cache'  => null,
				'compiled_at' => null,
			]
		);
		$this->assertNull( $this->service( $never )->resolve( 'ana@acme.example' ), 'Never compiled.' );

		$blank = $this->fresh_row( [ 'html_cache' => '   ' ] );
		$this->assertNull( $this->service( $blank )->resolve( 'ana@acme.example' ) );

		$huge = $this->fresh_row( [ 'html_cache' => '<p>' . str_repeat( 'x', OutlookSignatureService::MAX_SIGNATURE_CHARS ) . '</p>' ] );
		$this->assertNull( $this->service( $huge )->resolve( 'ana@acme.example' ), 'setSignatureAsync would reject it.' );
	}

	public function test_utf16_length_counts_like_javascript(): void {
		$this->assertSame( 3, OutlookSignatureService::utf16_length( 'abc' ) );
		$this->assertSame( 1, OutlookSignatureService::utf16_length( 'é' ) );
		$this->assertSame( 2, OutlookSignatureService::utf16_length( '😀' ) );
	}

	public function test_delivery_status_is_written_at_most_once_per_hour_per_hash(): void {
		$service = $this->service( $this->fresh_row() );

		$this->assertTrue( $service->record_delivery( 7, 'hash-a' ) );
		$this->assertSame(
			[
				'at'    => '2026-01-01 00:00:00',
				'hash'  => 'hash-a',
				'error' => '',
			],
			DeploymentStatus::get( 7 )['outlook']
		);
		$this->assertSame( 1, $this->meta_writes );

		$this->now += 1800;
		$this->assertFalse( $service->record_delivery( 7, 'hash-a' ), 'Same HTML within the hour: no write.' );
		$this->assertSame( 1, $this->meta_writes );

		$this->assertTrue( $service->record_delivery( 7, 'hash-b' ), 'New HTML is recorded right away.' );
		$this->assertSame( 2, $this->meta_writes );
		$this->assertSame( 'hash-b', DeploymentStatus::get( 7 )['outlook']['hash'] );

		$this->now += 3599;
		$this->assertFalse( $service->record_delivery( 7, 'hash-b' ) );
		$this->now += 1;
		$this->assertTrue( $service->record_delivery( 7, 'hash-b' ), 'An hour later the timestamp is refreshed.' );
		$this->assertSame( '2026-01-01 01:30:00', DeploymentStatus::get( 7 )['outlook']['at'] );
		$this->assertSame( 3, $this->meta_writes );
	}

	public function test_delivery_status_keeps_other_channels(): void {
		$this->meta[7][ DeploymentStatus::META_KEY ] = [
			'gmail' => [
				'at'   => '2025-12-31 09:00:00',
				'hash' => 'g',
			],
		];

		$this->service( $this->fresh_row() )->record_delivery( 7, 'o' );

		$status = DeploymentStatus::get( 7 );
		$this->assertSame( 'g', $status['gmail']['hash'] );
		$this->assertSame( 'o', $status['outlook']['hash'] );
	}
}
