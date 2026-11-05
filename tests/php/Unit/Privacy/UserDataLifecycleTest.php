<?php
/**
 * Unit tests for privacy export / erase, delete_user and uninstall.
 *
 * @package ImaginaSignatures\Tests\Unit\Privacy
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Privacy;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Core\Uninstaller;
use ImaginaSignatures\Models\Asset;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Privacy\UserDataManager;
use ImaginaSignatures\Repositories\AssetRepository;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Storage\StorageManager;
use Imgsig_Fake_Wpdb;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Privacy\UserDataManager
 * @covers \ImaginaSignatures\Core\Uninstaller
 */
final class UserDataLifecycleTest extends TestCase {

	/** @var array<int, int> */
	private array $deleted_attachments = [];

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->deleted_attachments = [];

		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'wp_delete_attachment' )->alias(
			function ( $id ) {
				$this->deleted_attachments[] = (int) $id;
				return (object) [ 'ID' => $id ];
			}
		);
		Functions\when( 'get_user_by' )->alias(
			static function ( $field, $value ) {
				return 'jane@example.com' === $value ? (object) [ 'ID' => 7 ] : false;
			}
		);
		Functions\when( 'delete_user_meta' )->justReturn( true );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		unset( $GLOBALS['wpdb'] );
		parent::tearDown();
	}

	/**
	 * @return Asset
	 */
	private function asset( int $id, string $driver = 'media_library' ): Asset {
		return Asset::from_row(
			[
				'id'             => $id,
				'user_id'        => 7,
				'storage_driver' => $driver,
				'storage_key'    => (string) ( 100 + $id ),
				'public_url'     => 'https://example.com/wp-content/uploads/imagina-signatures/t/' . $id . '.png',
				'mime_type'      => 'image/png',
				'size_bytes'     => 10,
			]
		);
	}

	public function test_delete_user_with_reassign_moves_rows_and_keeps_files(): void {
		$signatures = $this->createMock( SignatureRepository::class );
		$assets     = $this->createMock( AssetRepository::class );
		$signatures->expects( $this->once() )->method( 'reassign_user' )->with( 7, 1 );
		$assets->expects( $this->once() )->method( 'reassign_user' )->with( 7, 1 );
		$signatures->expects( $this->never() )->method( 'delete_by_user' );
		$assets->expects( $this->never() )->method( 'delete' );

		( new UserDataManager( $signatures, $assets, $this->createMock( StorageManager::class ) ) )->on_delete_user( 7, 1 );

		$this->assertSame( [], $this->deleted_attachments );
	}

	public function test_delete_user_without_reassign_purges_rows_and_files(): void {
		$signatures = $this->createMock( SignatureRepository::class );
		$assets     = $this->createMock( AssetRepository::class );
		$assets->method( 'find_batch_by_user' )->willReturnOnConsecutiveCalls( [ $this->asset( 1 ), $this->asset( 2 ) ], [] );
		$assets->expects( $this->exactly( 2 ) )->method( 'delete' );
		$signatures->expects( $this->once() )->method( 'delete_by_user' )->with( 7 );

		( new UserDataManager( $signatures, $assets, $this->createMock( StorageManager::class ) ) )->on_delete_user( 7, null );

		$this->assertSame( [ 101, 102 ], $this->deleted_attachments );
	}

	public function test_exporter_pages_signatures_then_assets(): void {
		$signatures = $this->createMock( SignatureRepository::class );
		$signatures->method( 'count_by_user' )->willReturn( 1 );
		$signatures->method( 'find_by_user' )->willReturn(
			[
				Signature::from_row(
					[
						'id'           => 3,
						'user_id'      => 7,
						'name'         => 'Work',
						'json_content' => '{"variables":{"phone":"+1 555"}}',
					]
				),
			]
		);
		$assets = $this->createMock( AssetRepository::class );
		$assets->method( 'find_batch_by_user' )->willReturn( [ $this->asset( 1 ) ] );

		$manager = new UserDataManager( $signatures, $assets, $this->createMock( StorageManager::class ) );

		$first = $manager->export( 'jane@example.com', 1 );
		$this->assertFalse( $first['done'] );
		$this->assertSame( 'imgsig-signature-3', $first['data'][0]['item_id'] );
		$this->assertContains( '{"variables":{"phone":"+1 555"}}', array_column( $first['data'][0]['data'], 'value' ) );

		$second = $manager->export( 'jane@example.com', 2 );
		$this->assertTrue( $second['done'] );
		$this->assertSame( 'imgsig-asset-1', $second['data'][0]['item_id'] );

		$this->assertSame(
			[
				'data' => [],
				'done' => true,
			],
			$manager->export( 'nobody@example.com', 1 )
		);
	}

	public function test_eraser_removes_assets_files_and_signatures(): void {
		$signatures = $this->createMock( SignatureRepository::class );
		$signatures->method( 'delete_by_user' )->willReturn( 2 );
		$assets = $this->createMock( AssetRepository::class );
		$assets->method( 'find_batch_by_user' )->willReturn( [ $this->asset( 5 ) ] );

		$result = ( new UserDataManager( $signatures, $assets, $this->createMock( StorageManager::class ) ) )->erase( 'jane@example.com', 1 );

		$this->assertTrue( $result['items_removed'] );
		$this->assertFalse( $result['items_retained'] );
		$this->assertTrue( $result['done'] );
		$this->assertSame( [ 105 ], $this->deleted_attachments );
	}

	/**
	 * Stubs shared by the uninstall tests.
	 *
	 * @param array<string, mixed> $options Site options.
	 */
	private function uninstall_env( array $options ): Imgsig_Fake_Wpdb {
		$db              = new Imgsig_Fake_Wpdb();
		$GLOBALS['wpdb'] = $db;

		Functions\when( 'is_multisite' )->justReturn( false );
		Functions\when( 'get_option' )->alias(
			static function ( $name, $default = false ) use ( $options ) {
				return $options[ $name ] ?? $default;
			}
		);
		Functions\when( 'wp_roles' )->justReturn( (object) [ 'roles' => [] ] );
		Functions\when( 'wp_clear_scheduled_hook' )->justReturn( 0 );
		Functions\when( 'delete_option' )->justReturn( true );
		Functions\when( 'delete_metadata' )->justReturn( true );
		Functions\when( 'wp_upload_dir' )->justReturn( [ 'error' => 'none in tests' ] );

		return $db;
	}

	public function test_uninstall_keeps_tables_and_files_by_default(): void {
		$db = $this->uninstall_env( [] );

		Uninstaller::uninstall();

		foreach ( $db->queries as $query ) {
			$this->assertStringNotContainsString( 'DROP TABLE', $query );
		}
		$this->assertSame( [], $this->deleted_attachments );
	}

	public function test_uninstall_purges_everything_when_opted_in(): void {
		$db = $this->uninstall_env(
			[
				'imgsig_delete_data_on_uninstall' => '1',
				'imgsig_storage_driver'           => 'media_library',
			]
		);

		Uninstaller::uninstall();

		$drops = array_values(
			array_filter(
				$db->queries,
				static function ( string $q ): bool {
					return false !== strpos( $q, 'DROP TABLE' );
				}
			)
		);
		$this->assertCount( 4, $drops );
		$this->assertStringContainsString( 'wp_imgsig_rate_limits', implode( "\n", $drops ) );
	}
}
