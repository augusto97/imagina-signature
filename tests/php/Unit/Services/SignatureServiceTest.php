<?php
/**
 * Unit tests for SignatureService save-path sanitisation + ownership.
 *
 * @package ImaginaSignatures\Tests\Unit\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Services;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Exceptions\OwnershipException;
use ImaginaSignatures\Exceptions\ValidationException;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Services\HtmlSanitizer;
use ImaginaSignatures\Services\JsonSchemaValidator;
use ImaginaSignatures\Services\SchemaSanitizer;
use ImaginaSignatures\Services\SignatureService;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Services\SignatureService
 */
final class SignatureServiceTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		imgsig_tests_load_kses();
		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'sanitize_text_field' )->alias( 'trim' );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * @param array<int, array<string, mixed>> $blocks Blocks.
	 *
	 * @return array<string, mixed>
	 */
	private function schema( array $blocks ): array {
		return [
			'schema_version' => '1.0',
			'meta'           => [ 'editor_version' => '1.0.0' ],
			'canvas'         => [ 'width' => 600 ],
			'blocks'         => $blocks,
			'variables'      => [ 'name' => 'Jane' ],
		];
	}

	/**
	 * Repository double whose insert() echoes the row back like the DB would.
	 *
	 * @param array<string, mixed>|null $captured Receives the inserted data.
	 */
	private function echoing_repo( ?array &$captured ): SignatureRepository {
		$repo = $this->createMock( SignatureRepository::class );
		$repo->method( 'insert' )->willReturnCallback(
			static function ( array $data ) use ( &$captured ): Signature {
				$captured = $data;
				return Signature::from_row( $data + [ 'id' => 7 ] );
			}
		);
		return $repo;
	}

	private function service( SignatureRepository $repo ): SignatureService {
		return new SignatureService( $repo, new JsonSchemaValidator(), new SchemaSanitizer( new HtmlSanitizer() ) );
	}

	public function test_create_sanitises_nested_blocks_and_reports_notes(): void {
		$captured = null;
		$service  = $this->service( $this->echoing_repo( $captured ) );

		$service->create(
			3,
			[
				'name'         => 'Mine',
				'json_content' => $this->schema(
					[
						[
							'id'       => 'row',
							'type'     => 'container',
							'children' => [
								[
									'id'      => 't',
									'type'    => 'text',
									'content' => '<p>ok<script>alert(1)</script></p>',
								],
								[
									'id'   => 'b',
									'type' => 'button_cta',
									'href' => 'javascript:alert(1)',
								],
							],
						],
					]
				),
			]
		);

		$stored = json_decode( (string) $captured['json_content'], true );
		$this->assertSame( 3, $captured['user_id'] );
		$this->assertSame( '<p>okalert(1)</p>', $stored['blocks'][0]['children'][0]['content'] );
		$this->assertSame( '', $stored['blocks'][0]['children'][1]['href'] );
		$this->assertSame(
			[ 'blocks[0].children[0].content', 'blocks[0].children[1].href' ],
			array_column( $service->last_sanitization_notes(), 'path' )
		);
	}

	public function test_create_rejects_oversized_tree_with_validation_error(): void {
		$captured = null;
		$service  = $this->service( $this->echoing_repo( $captured ) );

		$blocks = [];
		for ( $i = 0; $i < 201; $i++ ) {
			$blocks[] = [
				'id'   => 's' . $i,
				'type' => 'spacer',
			];
		}

		$this->expectException( ValidationException::class );
		$service->create(
			3,
			[
				'name'         => 'Too big',
				'json_content' => $this->schema( $blocks ),
			]
		);
	}

	public function test_update_refuses_rows_owned_by_another_user(): void {
		$repo = $this->createMock( SignatureRepository::class );
		$repo->method( 'find_owned_by' )->willReturnCallback(
			static function ( int $id, int $user_id ): ?Signature {
				return 5 === $user_id ? Signature::from_row(
					[
						'id'      => $id,
						'user_id' => 5,
					]
				) : null;
			}
		);
		$repo->expects( $this->never() )->method( 'update' );

		$this->expectException( OwnershipException::class );
		$this->service( $repo )->update( 10, 6, [ 'name' => 'stolen' ] );
	}

	public function test_duplicate_resanitises_legacy_content(): void {
		$legacy = Signature::from_row(
			[
				'id'           => 9,
				'user_id'      => 3,
				'name'         => 'Old',
				'json_content' => (string) json_encode(
					$this->schema(
						[
							[
								'id'   => 'i',
								'type' => 'image',
								'src'  => 'javascript:alert(1)',
							],
						]
					)
				),
			]
		);

		$captured = null;
		$repo     = $this->echoing_repo( $captured );
		$repo->method( 'find_owned_by' )->willReturn( $legacy );

		$this->service( $repo )->duplicate( 9, 3 );

		$stored = json_decode( (string) $captured['json_content'], true );
		$this->assertSame( '', $stored['blocks'][0]['src'] );
	}
}
