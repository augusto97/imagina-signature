<?php
/**
 * Unit tests for server enforcement when an employee saves a linked signature.
 *
 * @package ImaginaSignatures\Tests\Unit\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Services;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Exceptions\ValidationException;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Models\Template;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Repositories\TemplateRepository;
use ImaginaSignatures\Services\HtmlSanitizer;
use ImaginaSignatures\Services\JsonSchemaValidator;
use ImaginaSignatures\Services\SchemaSanitizer;
use ImaginaSignatures\Services\SignatureService;
use ImaginaSignatures\Services\TemplateLink;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/TemplateLinkTest.php';

/**
 * @covers \ImaginaSignatures\Services\SignatureService
 */
final class LinkedSignatureSaveTest extends TestCase {

	/** @var array<string, bool> Caps of the saving user. */
	private array $caps = [];

	/** @var array<string, mixed>|null Data handed to the repository. */
	private ?array $written = null;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		imgsig_tests_load_kses();
		$this->caps    = [];
		$this->written = null;
		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'sanitize_text_field' )->alias( 'trim' );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'wp_strip_all_tags' )->alias( 'strip_tags' );
		Functions\when( 'get_user_meta' )->justReturn( '' );
		Functions\when( 'user_can' )->alias(
			function ( $user_id, $cap ): bool {
				return ! empty( $this->caps[ $cap ] );
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * Service whose repository holds one linked signature of template 4.
	 *
	 * @param string                    $mode   Template employee mode.
	 * @param array<string, mixed>|null $stored Stored schema (defaults to the template).
	 * @param string                    $link   Stored link mode.
	 */
	private function service( string $mode, ?array $stored = null, string $link = 'linked' ): SignatureService {
		$template_schema = TemplateLinkTest::template( $mode );
		$stored          = $stored ?? TemplateLink::refresh( $template_schema, [ 'variables' => [ 'tagline' => 'Stored' ] ] );

		$row = Signature::from_row(
			[
				'id'           => 5,
				'user_id'      => 3,
				'template_id'  => 4,
				'link_mode'    => $link,
				'json_content' => (string) json_encode( $stored ),
			]
		);

		$repo = $this->createMock( SignatureRepository::class );
		$repo->method( 'find_owned_by' )->willReturn( $row );
		$repo->method( 'update' )->willReturnCallback(
			function ( int $id, array $data ) use ( $row ): Signature {
				$this->written = $data;
				return Signature::from_row(
					array_merge(
						[
							'id'          => $id,
							'user_id'     => 3,
							'template_id' => 4,
							'link_mode'   => $data['link_mode'] ?? $row->link_mode,
						],
						$data
					)
				);
			}
		);

		$templates = $this->createMock( TemplateRepository::class );
		$templates->method( 'find' )->willReturn(
			Template::from_row(
				[
					'id'           => 4,
					'slug'         => 'corp',
					'json_content' => (string) json_encode( $template_schema ),
				]
			)
		);

		return new SignatureService( $repo, new JsonSchemaValidator(), new SchemaSanitizer( new HtmlSanitizer() ), $templates );
	}

	/**
	 * @return array<string, mixed>
	 */
	private function written_schema(): array {
		$this->assertIsArray( $this->written );
		$decoded = json_decode( (string) $this->written['json_content'], true );
		$this->assertIsArray( $decoded );
		return $decoded;
	}

	public function test_fields_only_replaces_the_design_and_keeps_only_variables(): void {
		$service  = $this->service( TemplateLink::MODE_FIELDS_ONLY );
		$incoming = TemplateLink::refresh( TemplateLinkTest::template( TemplateLink::MODE_FIELDS_ONLY ), [] );
		$incoming['variables'] = [ 'tagline' => 'Mine' ];
		$incoming['canvas']['width'] = 320;
		$incoming['blocks'][0]['src'] = 'https://evil.test/x.png';

		$service->update(
			5,
			3,
			[
				'json_content' => $incoming,
				'html'         => '<table><tr><td>forged</td></tr></table>',
			]
		);

		$saved = $this->written_schema();
		$this->assertSame( 600, $saved['canvas']['width'] );
		$this->assertSame( 'https://cdn.acme.test/logo.png', $saved['blocks'][0]['src'] );
		$this->assertSame( 'Mine', $saved['variables']['tagline'] );
		// The HTML described the rejected design: not stored, row goes stale.
		$this->assertArrayNotHasKey( 'html_cache', $this->written );
	}

	public function test_a_compliant_fields_only_save_keeps_its_html(): void {
		$service  = $this->service( TemplateLink::MODE_FIELDS_ONLY );
		$incoming = TemplateLink::refresh( TemplateLinkTest::template( TemplateLink::MODE_FIELDS_ONLY ), [ 'variables' => [ 'tagline' => 'Mine' ] ] );

		$service->update( 5, 3, [ 'json_content' => $incoming, 'html' => '<table><tr><td>Mine</td></tr></table>' ] );

		$this->assertArrayHasKey( 'html_cache', (array) $this->written );
		$this->assertStringContainsString( 'Mine', (string) $this->written['html_cache'] );
	}

	public function test_locked_design_reverts_locked_blocks_and_styles_but_keeps_text(): void {
		$service  = $this->service( TemplateLink::MODE_LOCKED_DESIGN );
		$incoming = TemplateLink::refresh( TemplateLinkTest::template(), [] );
		$incoming['blocks'][2]['content'] = 'Removed the disclaimer text';
		$incoming['blocks'][1]['columns'][0]['children'][1]['content']        = '<p>My bio</p>';
		$incoming['blocks'][1]['columns'][0]['children'][1]['style']['color'] = '#ff0000';

		$service->update( 5, 3, [ 'json_content' => $incoming ] );

		$saved = $this->written_schema();
		$index = TemplateLink::index_blocks( $saved['blocks'] );
		$this->assertSame( 'Confidential.', $index['legal']['block']['content'] );
		$this->assertSame( '<p>My bio</p>', $index['bio']['block']['content'] );
		$this->assertSame( '#333333', $index['bio']['block']['style']['color'] );
		$this->assertSame( [ 'bio' => [ 'content' => '<p>My bio</p>' ] ], $saved['overrides'] );
	}

	public function test_html_without_the_design_is_not_stored_for_enforced_modes(): void {
		$this->service( TemplateLink::MODE_LOCKED_DESIGN )->update( 5, 3, [ 'html' => '<table><tr><td>forged</td></tr></table>' ] );

		$this->assertArrayNotHasKey( 'html_cache', (array) $this->written );
	}

	public function test_detaching_is_refused_unless_the_template_is_free(): void {
		$this->expectException( ValidationException::class );
		$this->service( TemplateLink::MODE_LOCKED_DESIGN )->update( 5, 3, [ 'link_mode' => 'detached' ] );
	}

	public function test_detaching_a_free_template_merges_overrides(): void {
		$stored = TemplateLink::refresh( TemplateLinkTest::template( TemplateLink::MODE_FREE ), [ 'overrides' => [ 'bio' => [ 'content' => '<p>Mine</p>' ] ] ] );

		$this->service( TemplateLink::MODE_FREE, $stored )->update(
			5,
			3,
			[
				'link_mode'    => 'detached',
				'json_content' => $stored,
			]
		);

		$this->assertSame( 'detached', $this->written['link_mode'] ?? null );
		$saved = $this->written_schema();
		$this->assertArrayNotHasKey( 'overrides', $saved );
		$this->assertSame( '<p>Mine</p>', TemplateLink::index_blocks( $saved['blocks'] )['bio']['block']['content'] );
	}

	public function test_the_template_of_a_linked_signature_cannot_be_changed_by_its_owner(): void {
		$this->service( TemplateLink::MODE_FREE )->update( 5, 3, [ 'template_id' => 9, 'name' => 'x' ] );

		$this->assertArrayNotHasKey( 'template_id', (array) $this->written );
	}

	public function test_an_employee_cannot_link_their_own_signature(): void {
		$this->service( TemplateLink::MODE_LOCKED_DESIGN, null, 'detached' )->update( 5, 3, [ 'link_mode' => 'linked' ] );

		$this->assertArrayNotHasKey( 'link_mode', (array) $this->written );
	}

	public function test_template_managers_bypass_enforcement(): void {
		$this->caps = [ 'imgsig_manage_templates' => true ];
		$service    = $this->service( TemplateLink::MODE_FIELDS_ONLY );
		$incoming   = TemplateLink::refresh( TemplateLinkTest::template( TemplateLink::MODE_FIELDS_ONLY ), [] );
		$incoming['canvas']['width'] = 320;

		$service->update( 5, 3, [ 'json_content' => $incoming, 'html' => '<table><tr><td>A</td></tr></table>' ] );

		$this->assertSame( 320, $this->written_schema()['canvas']['width'] );
		$this->assertArrayHasKey( 'html_cache', (array) $this->written );
	}

	public function test_create_only_links_for_trusted_callers(): void {
		$inserted = [];
		$repo     = $this->createMock( SignatureRepository::class );
		$repo->method( 'insert' )->willReturnCallback(
			static function ( array $data ) use ( &$inserted ): Signature {
				$inserted[] = $data;
				return Signature::from_row( $data + [ 'id' => count( $inserted ) ] );
			}
		);
		$service = new SignatureService( $repo, new JsonSchemaValidator(), new SchemaSanitizer( new HtmlSanitizer() ) );
		$data    = [
			'name'         => 'Mine',
			'json_content' => TemplateLink::refresh( TemplateLinkTest::template(), [] ),
			'template_id'  => 4,
			'link_mode'    => 'linked',
		];

		$service->create( 3, $data );
		$service->create( 3, $data, true );

		$this->assertArrayNotHasKey( 'link_mode', $inserted[0] );
		$this->assertSame( 'linked', $inserted[1]['link_mode'] );
	}
}
