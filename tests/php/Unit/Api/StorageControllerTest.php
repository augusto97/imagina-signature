<?php
/**
 * Unit tests for storage-settings validation + connection test on save.
 *
 * @package ImaginaSignatures\Tests\Unit\Api
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Api;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Api\Controllers\StorageController;
use ImaginaSignatures\Storage\Dto\TestResult;
use ImaginaSignatures\Storage\StorageManager;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Api\Controllers\StorageController
 */
final class StorageControllerTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'wp_parse_url' )->alias( 'parse_url' );
		Functions\when( 'untrailingslashit' )->alias(
			static function ( $value ): string {
				return rtrim( (string) $value, '/\\' );
			}
		);
		Functions\when( 'rest_ensure_response' )->alias(
			static function ( $data ) {
				return $data instanceof \WP_REST_Response ? $data : new \WP_REST_Response( $data );
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * @param array<string, mixed> $overrides Config overrides.
	 */
	private function request( array $overrides = [] ): \WP_REST_Request {
		return new \WP_REST_Request(
			[
				'driver' => 's3',
				'config' => $overrides + [
					'provider'   => 'cloudflare_r2',
					'bucket'     => 'signatures',
					'account_id' => 'abc123def456',
					'access_key' => 'AKIAEXAMPLE',
					'secret_key' => 'secret/+=',
				],
			]
		);
	}

	/**
	 * @return array<string, array{0: array<string, mixed>, 1: string}>
	 */
	public function invalid_configs(): array {
		return [
			'region injection'     => [ [ 'region' => 'us-east-1.evil.com/x' ], 'region' ],
			'account id injection' => [ [ 'account_id' => 'x.evil.com#' ], 'account_id' ],
			'unknown provider'     => [ [ 'provider' => 'ftp' ], 'provider' ],
			'bucket with slash'    => [ [ 'bucket' => '../other' ], 'bucket' ],
			'endpoint scheme'      => [
				[
					'provider'        => 'custom',
					'custom_endpoint' => 'file:///etc/passwd',
				],
				'custom_endpoint',
			],
			'cdn with creds'       => [ [ 'public_url_base' => 'https://user:pw@cdn.example.com' ], 'public_url_base' ],
		];
	}

	/**
	 * @dataProvider invalid_configs
	 *
	 * @param array<string, mixed> $overrides Config overrides.
	 */
	public function test_invalid_config_is_refused_without_saving( array $overrides, string $field ): void {
		$manager = $this->createMock( StorageManager::class );
		$manager->method( 'read_active_config' )->willReturn( [] );
		$manager->expects( $this->never() )->method( 'test_config' );
		$manager->expects( $this->never() )->method( 'save_config' );

		$result = ( new StorageController( $manager ) )->update( $this->request( $overrides ) );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'imgsig_storage_invalid', $result->get_error_code() );
		$this->assertContains( $field, array_column( $result->get_error_data()['errors'], 'path' ) );
	}

	public function test_failed_connection_test_blocks_activation(): void {
		$manager = $this->createMock( StorageManager::class );
		$manager->method( 'read_active_config' )->willReturn( [] );
		$manager->method( 'test_config' )->willReturn( TestResult::failure( 'The endpoint rejected the credentials.' ) );
		$manager->expects( $this->never() )->method( 'save_config' );

		$result = ( new StorageController( $manager ) )->update( $this->request() );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'imgsig_storage_test_failed', $result->get_error_code() );
		$this->assertStringContainsString( 'rejected the credentials', $result->get_error_message() );
	}

	public function test_passing_config_is_saved_and_stored_secrets_are_kept(): void {
		$manager = $this->createMock( StorageManager::class );
		$manager->method( 'read_active_config' )->willReturn(
			[
				'access_key' => 'STORED-ACCESS',
				'secret_key' => 'STORED-SECRET',
			]
		);
		$manager->method( 'test_config' )->willReturn( TestResult::success( 'ok' ) );
		$manager->method( 'available_driver_ids' )->willReturn( [ 'media_library', 's3', 'url_only' ] );
		$manager->expects( $this->once() )->method( 'save_config' )->with(
			's3',
			$this->callback(
				static function ( array $config ): bool {
					return 'STORED-ACCESS' === $config['access_key'] && 'STORED-SECRET' === $config['secret_key'] && 'signatures' === $config['bucket'];
				}
			)
		);

		$result = ( new StorageController( $manager ) )->update(
			$this->request(
				[
					'access_key' => '',
					'secret_key' => '',
				]
			)
		);

		$this->assertInstanceOf( \WP_REST_Response::class, $result );
	}
}
