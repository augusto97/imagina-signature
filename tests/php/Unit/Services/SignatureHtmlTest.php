<?php
/**
 * Unit tests for the server-held compiled HTML and primary signature.
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
 * @covers \ImaginaSignatures\Models\Signature
 */
final class SignatureHtmlTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		imgsig_tests_load_kses();
		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'sanitize_text_field' )->alias( 'trim' );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'wp_strip_all_tags' )->alias( 'strip_tags' );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	private function service( SignatureRepository $repo ): SignatureService {
		return new SignatureService( $repo, new JsonSchemaValidator(), new SchemaSanitizer( new HtmlSanitizer() ) );
	}

	/**
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

	public function test_compiled_html_is_sanitised_hashed_and_stored_with_text(): void {
		$captured = null;
		$service  = $this->service( $this->echoing_repo( $captured ) );

		$service->create(
			3,
			[
				'name'         => 'Main',
				'json_content' => [
					'schema_version' => '1.1',
					'meta'           => [],
					'canvas'         => [ 'width' => 600 ],
					'blocks'         => [],
					'variables'      => [],
				],
				'html'         => '<table role="presentation"><tr><td style="color:#111">Ana<script>alert(1)</script></td></tr></table>',
				'text'         => "Ana\n<b>CEO</b>",
			]
		);

		$this->assertIsArray( $captured );
		$this->assertStringNotContainsString( '<script', (string) $captured['html_cache'] );
		$this->assertStringContainsString( 'Ana', (string) $captured['html_cache'] );
		$this->assertSame( hash( 'sha256', (string) $captured['html_cache'] ), $captured['html_hash'] );
		$this->assertSame( "Ana\nCEO", $captured['html_text'] );
	}

	public function test_oversized_html_is_rejected(): void {
		$captured = null;
		$service  = $this->service( $this->echoing_repo( $captured ) );

		$this->expectException( ValidationException::class );
		$service->create(
			3,
			[
				'name' => 'Big',
				'html' => str_repeat( 'x', SignatureService::MAX_HTML_BYTES + 1 ),
			]
		);
	}

	public function test_saves_without_html_leave_the_compiled_copy_alone(): void {
		$repo = $this->createMock( SignatureRepository::class );
		$repo->method( 'find_owned_by' )->willReturn(
			Signature::from_row(
				[
					'id'           => 5,
					'user_id'      => 3,
					'json_content' => '{}',
				]
			)
		);
		$repo->expects( $this->once() )->method( 'update' )->with(
			5,
			$this->callback(
				static function ( array $data ): bool {
					return ! array_key_exists( 'html_cache', $data ) && ! array_key_exists( 'html_hash', $data );
				}
			)
		)->willReturn( null );

		$this->service( $repo )->update( 5, 3, [ 'name' => 'Renamed' ] );
	}

	public function test_primary_prefers_the_marked_signature(): void {
		Functions\when( 'get_user_meta' )->justReturn( '9' );
		$repo = $this->createMock( SignatureRepository::class );
		$repo->method( 'find_owned_by' )->with( 9, 3 )->willReturn( Signature::from_row( [ 'id' => 9, 'user_id' => 3 ] ) );
		$repo->expects( $this->never() )->method( 'find_by_user' );

		$this->assertSame( 9, $this->service( $repo )->primary_id_for_user( 3 ) );
	}

	public function test_primary_falls_back_to_latest_ready_then_latest(): void {
		Functions\when( 'get_user_meta' )->justReturn( '' );
		$repo = $this->createMock( SignatureRepository::class );
		$repo->method( 'find_by_user' )->willReturnCallback(
			static function ( int $user_id, array $args ): array {
				if ( isset( $args['status'] ) ) {
					return [];
				}
				return [ Signature::from_row( [ 'id' => 4, 'user_id' => $user_id ] ) ];
			}
		);

		$this->assertSame( 4, $this->service( $repo )->primary_id_for_user( 3 ) );
	}

	public function test_set_primary_requires_ownership(): void {
		$repo = $this->createMock( SignatureRepository::class );
		$repo->method( 'find_owned_by' )->willReturn( null );

		$this->expectException( OwnershipException::class );
		$this->service( $repo )->set_primary( 3, 99 );
	}

	public function test_html_is_stale_until_compiled_after_the_last_edit(): void {
		$fresh = Signature::from_row(
			[
				'id'          => 1,
				'html_cache'  => '<table></table>',
				'compiled_at' => '2026-11-05 10:00:00',
				'updated_at'  => '2026-11-05 10:00:00',
			]
		);
		$stale = Signature::from_row(
			[
				'id'          => 2,
				'html_cache'  => '<table></table>',
				'compiled_at' => '2026-11-05 09:00:00',
				'updated_at'  => '2026-11-05 10:00:00',
			]
		);
		$summary = Signature::from_row(
			[
				'id'          => 3,
				'has_html'    => '1',
				'compiled_at' => '2026-11-05 10:00:00',
				'updated_at'  => '2026-11-05 10:00:00',
			]
		);

		$this->assertFalse( $fresh->is_html_stale() );
		$this->assertTrue( $stale->is_html_stale() );
		$this->assertFalse( $summary->is_html_stale() );
		$this->assertTrue( Signature::from_row( [ 'id' => 4 ] )->is_html_stale() );
	}
}
