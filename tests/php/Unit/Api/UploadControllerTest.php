<?php
/**
 * Unit tests for upload validation (init / direct / finalize).
 *
 * @package ImaginaSignatures\Tests\Unit\Api
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Api;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Api\Controllers\UploadController;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Models\Asset;
use ImaginaSignatures\Repositories\AssetRepository;
use ImaginaSignatures\Storage\Contracts\ObjectInspectorInterface;
use ImaginaSignatures\Storage\Contracts\StorageDriverInterface;
use ImaginaSignatures\Storage\Dto\PresignedResult;
use ImaginaSignatures\Storage\Dto\TestResult;
use ImaginaSignatures\Storage\Dto\UploadResult;
use ImaginaSignatures\Storage\PendingUploads;
use ImaginaSignatures\Storage\StorageManager;
use ImaginaSignatures\Storage\UploadPolicy;
use PHPUnit\Framework\TestCase;

/**
 * Fake presigning driver with inspection support.
 */
final class FakeObjectStoreDriver implements StorageDriverInterface, ObjectInspectorInterface { // phpcs:ignore

	/** @var array{content_type: string, content_length: int}|null */
	public ?array $object = null;

	public ?string $prefix = null;

	/** @var array<int, string> */
	public array $deleted = [];

	/** @var array<int, array<string, mixed>> */
	public array $uploads = [];

	public function get_id(): string {
		return 's3';
	}

	public function supports_presigned_uploads(): bool {
		return true;
	}

	public function is_configured(): bool {
		return true;
	}

	public function upload( string $source_path, string $destination_key, array $meta ): UploadResult {
		$this->uploads[] = [ $source_path, $destination_key, $meta ];
		return new UploadResult( $destination_key, 'https://cdn.example.com/' . $destination_key, (int) filesize( $source_path ), (string) $meta['mime_type'], str_repeat( 'a', 64 ), 's3' );
	}

	public function get_presigned_upload_url( string $key, string $content_type, int $max_size, int $expires_seconds ): PresignedResult {
		return new PresignedResult( 'https://s3.example.com/b/' . $key . '?X-Amz-Signature=x', 'PUT', [ 'Content-Type' => $content_type ], $key, time() + $expires_seconds, $max_size, 'https://cdn.example.com/' . $key );
	}

	public function get_public_url( string $key ): string {
		return 'https://cdn.example.com/' . $key;
	}

	public function delete( string $key ): bool {
		$this->deleted[] = $key;
		return true;
	}

	public function test_connection(): TestResult {
		return TestResult::success( 'ok' );
	}

	public function verify_object_exists( string $key ): bool {
		return null !== $this->object;
	}

	public function describe_object( string $key ): ?array {
		return $this->object;
	}

	public function read_object_prefix( string $key, int $bytes ): ?string {
		return $this->prefix;
	}
}

/**
 * @covers \ImaginaSignatures\Api\Controllers\UploadController
 */
final class UploadControllerTest extends TestCase {

	private FakeObjectStoreDriver $driver;

	/** @var array<string, mixed> */
	private array $transients = [];

	/** @var array<int, array<string, mixed>> */
	private array $inserted = [];

	private int $used_bytes = 0;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		$this->driver     = new FakeObjectStoreDriver();
		$this->transients = [];
		$this->inserted   = [];
		$this->used_bytes = 0;

		$meta = [];
		Functions\when( 'get_user_meta' )->alias(
			static function ( $user_id, $key ) use ( &$meta ) {
				return $meta[ $user_id ][ $key ] ?? '';
			}
		);
		Functions\when( 'update_user_meta' )->alias(
			static function ( $user_id, $key, $value ) use ( &$meta ): bool {
				$meta[ $user_id ][ $key ] = $value;
				return true;
			}
		);
		Functions\when( 'get_transient' )->alias(
			function ( $key ) {
				return $this->transients[ $key ] ?? false;
			}
		);
		Functions\when( 'set_transient' )->alias(
			function ( $key, $value ): bool {
				$this->transients[ $key ] = $value;
				return true;
			}
		);
		Functions\when( 'delete_transient' )->alias(
			function ( $key ): bool {
				unset( $this->transients[ $key ] );
				return true;
			}
		);
		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'sanitize_text_field' )->alias( 'trim' );
		Functions\when( 'size_format' )->alias(
			static function ( $bytes ): string {
				return ( (int) $bytes / MB_IN_BYTES ) . ' MB';
			}
		);
		Functions\when( 'get_current_user_id' )->justReturn( 42 );
		Functions\when( 'rest_url' )->returnArg( 1 );
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

	private function controller(): UploadController {
		$storage = $this->createMock( StorageManager::class );
		$storage->method( 'active_driver_id' )->willReturn( 's3' );
		$storage->method( 'active_driver' )->willReturn( $this->driver );

		$assets = $this->createMock( AssetRepository::class );
		$assets->method( 'sum_size_by_user' )->willReturnCallback(
			function (): int {
				return $this->used_bytes;
			}
		);
		$assets->method( 'insert' )->willReturnCallback(
			function ( array $data ): Asset {
				$this->inserted[] = $data;
				return Asset::from_row( $data + [ 'id' => 99 ] );
			}
		);

		return new UploadController( $storage, $assets, $this->createMock( RateLimiter::class ), new PendingUploads() );
	}

	/**
	 * Runs init and returns the minted key.
	 */
	private function init( string $mime = 'image/png', int $size = 1000 ): string {
		$response = $this->controller()->init(
			new \WP_REST_Request(
				[
					'filename'   => 'My Photo (GPS).png',
					'mime_type'  => $mime,
					'size_bytes' => $size,
				]
			)
		);
		$this->assertInstanceOf( \WP_REST_Response::class, $response );
		return (string) $response->get_data()['key'];
	}

	/**
	 * @param array<string, mixed> $overrides Param overrides.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	private function finalize( string $key, array $overrides = [] ) {
		return $this->controller()->finalize(
			new \WP_REST_Request(
				$overrides + [
					'key'         => $key,
					'mime_type'   => 'image/png',
					'size_bytes'  => 1000,
					'hash_sha256' => str_repeat( 'b', 64 ),
					'width'       => 120,
					'height'      => 60,
				]
			)
		);
	}

	public function test_init_signs_canonical_type_and_hides_user_id_and_filename(): void {
		$response = $this->controller()->init(
			new \WP_REST_Request(
				[
					'filename'   => 'Jane Doe.vcf',
					'mime_type'  => 'text/x-vcard',
					'size_bytes' => 500,
				]
			)
		);

		$data = $response->get_data();
		$this->assertSame( 'presigned', $data['method'] );
		$this->assertSame( 'PUT', $data['http_method'] );
		$this->assertSame( [ 'Content-Type' => 'text/vcard' ], $data['headers'] );
		$this->assertMatchesRegularExpression( '#^u/[a-f0-9]{16}/[a-f0-9]{32}\.vcf$#', $data['key'] );
		$this->assertStringNotContainsString( 'Jane', $data['key'] );
		$this->assertStringNotContainsString( '/42/', $data['key'] );
		$this->assertSame( UploadPolicy::VCARD_MAX_BYTES, $data['max_size'] );
	}

	/**
	 * @return array<string, array{0: string, 1: int, 2: string}>
	 */
	public function rejected_inits(): array {
		return [
			'svg'             => [ 'image/svg+xml', 100, 'imgsig_unsupported_mime' ],
			'html'            => [ 'text/html', 100, 'imgsig_unsupported_mime' ],
			'vcard too large' => [ 'text/vcard', 65537, 'imgsig_too_large' ],
			'image too large' => [ 'image/jpeg', 5 * MB_IN_BYTES + 1, 'imgsig_too_large' ],
		];
	}

	/**
	 * @dataProvider rejected_inits
	 */
	public function test_init_rejects_bad_type_or_size( string $mime, int $size, string $code ): void {
		$result = $this->controller()->init(
			new \WP_REST_Request(
				[
					'filename'   => 'x',
					'mime_type'  => $mime,
					'size_bytes' => $size,
				]
			)
		);

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( $code, $result->get_error_code() );
		$this->assertSame( [], $this->transients, 'Nothing may be authorised.' );
	}

	public function test_init_enforces_storage_quota(): void {
		$this->used_bytes = 104857600 - 500;

		$result = $this->controller()->init(
			new \WP_REST_Request(
				[
					'filename'   => 'x.png',
					'mime_type'  => 'image/png',
					'size_bytes' => 501,
				]
			)
		);

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'imgsig_quota_exceeded', $result->get_error_code() );
		$this->assertSame( 413, $result->get_error_data()['status'] );
	}

	public function test_finalize_registers_server_verified_values(): void {
		$key                  = $this->init();
		$this->driver->object = [
			'content_type'   => 'image/png',
			'content_length' => 1000,
		];

		$response = $this->finalize( $key );

		$this->assertInstanceOf( \WP_REST_Response::class, $response );
		$this->assertSame( 201, $response->get_status() );
		$this->assertSame( 'image/png', $this->inserted[0]['mime_type'] );
		$this->assertSame( 1000, $this->inserted[0]['size_bytes'] );
		$this->assertSame( $key, $this->inserted[0]['storage_key'] );
		$this->assertSame( [], $this->driver->deleted );
		$this->assertSame( [], $this->transients, 'Pending record is consumed.' );

		// Replaying the same finalize is refused.
		$replay = $this->finalize( $key );
		$this->assertInstanceOf( \WP_Error::class, $replay );
		$this->assertSame( 'imgsig_upload_unknown', $replay->get_error_code() );
	}

	/**
	 * @return array<string, array{0: array{content_type: string, content_length: int}, 1: array<string, mixed>}>
	 */
	public function mismatches(): array {
		return [
			'stored as html'        => [
				[
					'content_type'   => 'text/html',
					'content_length' => 1000,
				],
				[],
			],
			'bigger than declared'  => [
				[
					'content_type'   => 'image/png',
					'content_length' => 4 * MB_IN_BYTES,
				],
				[],
			],
			'client lies at finish' => [
				[
					'content_type'   => 'image/png',
					'content_length' => 1000,
				],
				[ 'mime_type' => 'image/gif' ],
			],
		];
	}

	/**
	 * @dataProvider mismatches
	 *
	 * @param array{content_type: string, content_length: int} $object    Stored object.
	 * @param array<string, mixed>                             $overrides Finalize params.
	 */
	public function test_finalize_deletes_object_on_mismatch( array $object, array $overrides ): void {
		$key                  = $this->init();
		$this->driver->object = $object;

		$result = $this->finalize( $key, $overrides );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'imgsig_upload_mismatch', $result->get_error_code() );
		$this->assertSame( 422, $result->get_error_data()['status'] );
		$this->assertSame( [ $key ], $this->driver->deleted );
		$this->assertSame( [], $this->inserted );
	}

	public function test_finalize_refuses_keys_that_init_never_minted(): void {
		$key                  = UploadPolicy::key_prefix( 42 ) . str_repeat( 'c', 32 ) . '.png';
		$this->driver->object = [
			'content_type'   => 'image/png',
			'content_length' => 1000,
		];

		$result = $this->finalize( $key );

		$this->assertSame( 'imgsig_upload_unknown', $result->get_error_code() );
		$this->assertSame( [], $this->inserted );
	}

	/**
	 * @return array<string, array{0: string}>
	 */
	public function foreign_keys(): array {
		return [
			'other legacy user' => [ 'users/43/1-a.png' ],
			'traversal'         => [ 'users/42/../43/a.png' ],
			'leading slash'     => [ '/users/42/a.png' ],
			'random prefix'     => [ 'u/ffffffffffffffff/a.png' ],
		];
	}

	/**
	 * @dataProvider foreign_keys
	 */
	public function test_finalize_rejects_foreign_or_malformed_keys( string $key ): void {
		$result = $this->finalize( $key );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'imgsig_forbidden', $result->get_error_code() );
		$this->assertSame( 403, $result->get_error_data()['status'] );
	}

	public function test_finalize_checks_vcard_content(): void {
		$key                  = $this->init( 'text/vcard', 300 );
		$this->driver->object = [
			'content_type'   => 'text/vcard',
			'content_length' => 300,
		];
		$this->driver->prefix = '<script>alert(1)</script>';

		$result = $this->finalize(
			$key,
			[
				'mime_type'  => 'text/vcard',
				'size_bytes' => 300,
			]
		);

		$this->assertSame( 'imgsig_upload_mismatch', $result->get_error_code() );
		$this->assertSame( [ $key ], $this->driver->deleted );
	}

	public function test_finalize_accepts_valid_vcard_without_dimensions(): void {
		$key                  = $this->init( 'text/vcard', 300 );
		$this->driver->object = [
			'content_type'   => 'text/vcard',
			'content_length' => 300,
		];
		$this->driver->prefix = "BEGIN:VCARD\r\nVERSION:3.0";

		$response = $this->finalize(
			$key,
			[
				'mime_type'  => 'text/vcard',
				'size_bytes' => 300,
			]
		);

		$this->assertSame( 201, $response->get_status() );
		$this->assertNull( $this->inserted[0]['width'] );
		$this->assertSame( 'text/vcard', $this->inserted[0]['mime_type'] );
	}

	public function test_upload_rate_limit_is_thirty_per_minute_by_default(): void {
		$storage = $this->createMock( StorageManager::class );
		$storage->method( 'active_driver_id' )->willReturn( 's3' );
		$storage->method( 'active_driver' )->willReturn( $this->driver );

		$limiter = $this->createMock( RateLimiter::class );
		$limiter->expects( $this->once() )->method( 'check' )->with( 'upload', 42, 30, MINUTE_IN_SECONDS );

		$controller = new UploadController( $storage, $this->createMock( AssetRepository::class ), $limiter, new PendingUploads() );
		$controller->init(
			new \WP_REST_Request(
				[
					'filename'   => 'qr.png',
					'mime_type'  => 'image/png',
					'size_bytes' => 10,
				]
			)
		);
	}

	public function test_vcard_presigned_round_trip_init_to_finalize(): void {
		$response = $this->controller()->init(
			new \WP_REST_Request(
				[
					'filename'   => 'contact.vcf',
					'mime_type'  => 'text/vcard',
					'size_bytes' => 180,
				]
			)
		);
		$key      = (string) $response->get_data()['key'];

		// The browser PUTs with the signed Content-Type; S3 stores it.
		$this->driver->object = [
			'content_type'   => (string) $response->get_data()['headers']['Content-Type'],
			'content_length' => 180,
		];
		$this->driver->prefix = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Jane\r\n";

		$final = $this->finalize(
			$key,
			[
				'mime_type'  => 'text/vcard',
				'size_bytes' => 180,
			]
		);

		$this->assertSame( 201, $final->get_status() );
		$this->assertSame( 'text/vcard', $final->get_data()['mime_type'] );
		$this->assertSame( 'https://cdn.example.com/' . $key, $final->get_data()['public_url'] );
	}

	public function test_direct_accepts_vcf_only_with_vcard_signature(): void {
		$good = tempnam( sys_get_temp_dir(), 'imgsig' );
		file_put_contents( $good, "BEGIN:VCARD\nFN:Jane\nEND:VCARD\n" );

		$response = $this->controller()->direct(
			new \WP_REST_Request(
				[],
				[
					'file' => [
						'name'     => 'jane.vcf',
						'type'     => 'text/x-vcard',
						'tmp_name' => $good,
						'size'     => 99999,
					],
				]
			)
		);

		$this->assertSame( 201, $response->get_status() );
		[ , $destination, $meta ] = $this->driver->uploads[0];
		$this->assertSame( 'text/vcard', $meta['mime_type'] );
		$this->assertMatchesRegularExpression( '#^u/[a-f0-9]{16}/[a-f0-9]{32}\.vcf$#', $destination );

		$bad = tempnam( sys_get_temp_dir(), 'imgsig' );
		file_put_contents( $bad, '<?php echo 1;' );

		$result = $this->controller()->direct(
			new \WP_REST_Request(
				[],
				[
					'file' => [
						'name'     => 'evil.vcf',
						'type'     => 'text/vcard',
						'tmp_name' => $bad,
					],
				]
			)
		);

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'imgsig_unsupported_mime', $result->get_error_code() );

		unlink( $good );
		unlink( $bad );
	}
}
