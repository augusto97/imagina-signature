<?php
/**
 * Unit tests for seeding new templates and refreshing unmodified ones.
 *
 * @package ImaginaSignatures\Tests\Unit\Setup
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Setup;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Models\Template;
use ImaginaSignatures\Repositories\TemplateRepository;
use ImaginaSignatures\Setup\DefaultTemplatesSeeder;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Setup\DefaultTemplatesSeeder::seed
 * @covers \ImaginaSignatures\Setup\DefaultTemplatesSeeder::hash_json
 */
final class DefaultTemplatesSeederRefreshTest extends TestCase {

	/**
	 * Temporary folder standing in for `templates/`.
	 *
	 * @var string
	 */
	private string $dir;

	/**
	 * `imgsig_template_hashes` as the test sees it (null = never written).
	 *
	 * @var array<string, string>|null
	 */
	private ?array $hashes = null;

	/**
	 * Every `update_option()` call: [ name, value ].
	 *
	 * @var array<int, array{0: string, 1: mixed}>
	 */
	private array $option_writes = [];

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		$this->dir = sys_get_temp_dir() . '/imgsig-seeder-' . uniqid( '', true );
		mkdir( $this->dir );

		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'get_option' )->alias(
			function ( string $name, $fallback = false ) {
				return DefaultTemplatesSeeder::HASH_OPTION === $name && null !== $this->hashes ? $this->hashes : $fallback;
			}
		);
		Functions\when( 'update_option' )->alias(
			function ( string $name, $value ): bool {
				$this->option_writes[] = [ $name, $value ];
				return true;
			}
		);
	}

	protected function tearDown(): void {
		foreach ( glob( $this->dir . '/*' ) as $file ) {
			unlink( $file );
		}
		rmdir( $this->dir );
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * Writes `templates/<slug>.json` (pretty-printed, like the shipped files).
	 *
	 * @param string               $slug   Slug.
	 * @param array<string, mixed> $schema Template schema.
	 */
	private function ship( string $slug, array $schema ): void {
		file_put_contents( $this->dir . '/' . $slug . '.json', json_encode( $schema, JSON_PRETTY_PRINT ) );
	}

	/**
	 * @param string $version Marker so versions differ.
	 *
	 * @return array<string, mixed>
	 */
	private function schema( string $version ): array {
		return [
			'schema_version' => '1.1',
			'canvas'         => [ 'width' => 560 ],
			'variables'      => [ 'job_title' => 'Directora' ],
			'blocks'         => [
				[
					'id'      => 'h-1',
					'type'    => 'heading',
					'content' => '{{wp_display_name}} ' . $version,
				],
			],
		];
	}

	/**
	 * A stored row (json_content as the DB returns it).
	 *
	 * @param string $slug      Slug.
	 * @param string $json      Stored JSON.
	 * @param bool   $is_system System row?
	 */
	private function row( string $slug, string $json, bool $is_system = true ): Template {
		return Template::from_row(
			[
				'id'           => 42,
				'slug'         => $slug,
				'name'         => 'Old name',
				'category'     => 'professional',
				'json_content' => $json,
				'is_system'    => $is_system ? 1 : 0,
			]
		);
	}

	/**
	 * Repository double whose `find_by_slug()` answers from `$rows`.
	 *
	 * @param array<string, Template> $rows Rows by slug.
	 *
	 * @return TemplateRepository&MockObject
	 */
	private function repo( array $rows ): TemplateRepository {
		$repo = $this->createMock( TemplateRepository::class );
		$repo->method( 'find_by_slug' )->willReturnCallback(
			static function ( string $slug ) use ( $rows ): ?Template {
				return $rows[ $slug ] ?? null;
			}
		);
		return $repo;
	}

	public function test_seeds_missing_slugs_and_records_what_it_seeded(): void {
		$this->ship( 'corporate-sidebar', $this->schema( 'v1' ) );
		$this->ship( 'minimal-one-liner', $this->schema( 'v1' ) );
		$this->ship( 'not-in-the-catalogue', $this->schema( 'v1' ) );

		$repo     = $this->repo( [] );
		$inserted = [];
		$repo->expects( $this->exactly( 2 ) )->method( 'insert' )->willReturnCallback(
			function ( array $data ) use ( &$inserted ): Template {
				$inserted[ $data['slug'] ] = $data;
				return Template::from_row( $data );
			}
		);
		$repo->expects( $this->never() )->method( 'update' );

		( new DefaultTemplatesSeeder( $repo, $this->dir ) )->seed();

		$this->assertSame( [ 'corporate-sidebar', 'minimal-one-liner' ], array_keys( $inserted ) );
		$sidebar = $inserted['corporate-sidebar'];
		$this->assertTrue( $sidebar['is_system'] );
		$this->assertSame( 'corporate', $sidebar['category'] );
		$this->assertSame( 'Corporate sidebar', $sidebar['name'] );
		$this->assertSame( '1.1', $sidebar['schema_version'] );
		$this->assertSame( json_encode( $this->schema( 'v1' ) ), $sidebar['json_content'] );

		$this->assertCount( 1, $this->option_writes );
		[ $name, $hashes ] = $this->option_writes[0];
		$this->assertSame( DefaultTemplatesSeeder::HASH_OPTION, $name );
		$this->assertSame( DefaultTemplatesSeeder::hash_json( (string) json_encode( $this->schema( 'v1' ) ) ), $hashes['corporate-sidebar'] );
		$this->assertArrayHasKey( 'minimal-one-liner', $hashes );
	}

	public function test_refreshes_a_system_row_the_admin_never_edited(): void {
		$seeded       = (string) json_encode( $this->schema( 'v1' ) );
		$this->hashes = [ 'corporate-sidebar' => DefaultTemplatesSeeder::hash_json( $seeded ) ];
		$this->ship( 'corporate-sidebar', $this->schema( 'v2' ) );

		// Same document, different formatting: still "unmodified".
		$stored = (string) json_encode( $this->schema( 'v1' ), JSON_PRETTY_PRINT );
		$repo   = $this->repo( [ 'corporate-sidebar' => $this->row( 'corporate-sidebar', $stored ) ] );
		$repo->expects( $this->never() )->method( 'insert' );
		$repo->expects( $this->once() )->method( 'update' )->with(
			42,
			$this->callback(
				function ( array $data ): bool {
					return json_encode( $this->schema( 'v2' ) ) === $data['json_content']
						&& 'Corporate sidebar' === $data['name']
						&& 'corporate' === $data['category']
						&& 10 === $data['sort_order']
						&& '1.1' === $data['schema_version'];
				}
			)
		);

		( new DefaultTemplatesSeeder( $repo, $this->dir ) )->seed();

		$this->assertCount( 1, $this->option_writes );
		$this->assertSame(
			DefaultTemplatesSeeder::hash_json( (string) json_encode( $this->schema( 'v2' ) ) ),
			$this->option_writes[0][1]['corporate-sidebar']
		);
	}

	public function test_keeps_a_system_row_the_admin_edited(): void {
		$this->hashes = [ 'corporate-sidebar' => DefaultTemplatesSeeder::hash_json( (string) json_encode( $this->schema( 'v1' ) ) ) ];
		$this->ship( 'corporate-sidebar', $this->schema( 'v2' ) );

		$edited = $this->schema( 'v1' );
		$edited['canvas']['width'] = 480;
		$repo = $this->repo( [ 'corporate-sidebar' => $this->row( 'corporate-sidebar', (string) json_encode( $edited ) ) ] );
		$repo->expects( $this->never() )->method( 'update' );
		$repo->expects( $this->never() )->method( 'insert' );

		( new DefaultTemplatesSeeder( $repo, $this->dir ) )->seed();

		$this->assertSame( [], $this->option_writes, 'the seeded hash stays the one the admin started from' );
	}

	public function test_recognises_rows_seeded_before_hashes_were_recorded(): void {
		// A 1.1.0 install: no hash option, row = the 1.1.0 file as seeded.
		$legacy = (string) file_get_contents( dirname( __DIR__, 2 ) . '/fixtures/templates-1.1.0/minimal-modern.json' );
		$stored = (string) json_encode( json_decode( $legacy, true ) );
		$this->ship( 'minimal-modern', $this->schema( 'v2' ) );

		$repo = $this->repo( [ 'minimal-modern' => $this->row( 'minimal-modern', $stored ) ] );
		$repo->expects( $this->once() )->method( 'update' )->with(
			42,
			$this->callback(
				static function ( array $data ): bool {
					return 'minimal' === $data['category'] && 'Minimal Modern' === $data['name'];
				}
			)
		);

		( new DefaultTemplatesSeeder( $repo, $this->dir ) )->seed();
	}

	public function test_keeps_an_edited_row_from_before_hashes_were_recorded(): void {
		$legacy           = json_decode( (string) file_get_contents( dirname( __DIR__, 2 ) . '/fixtures/templates-1.1.0/minimal-modern.json' ), true );
		$legacy['blocks'] = [];
		$this->ship( 'minimal-modern', $this->schema( 'v2' ) );

		$repo = $this->repo( [ 'minimal-modern' => $this->row( 'minimal-modern', (string) json_encode( $legacy ) ) ] );
		$repo->expects( $this->never() )->method( 'update' );

		( new DefaultTemplatesSeeder( $repo, $this->dir ) )->seed();

		$this->assertSame( [], $this->option_writes );
	}

	public function test_never_touches_admin_created_rows_that_share_a_slug(): void {
		$this->ship( 'corporate-sidebar', $this->schema( 'v2' ) );
		$repo = $this->repo( [ 'corporate-sidebar' => $this->row( 'corporate-sidebar', (string) json_encode( $this->schema( 'v1' ) ), false ) ] );
		$repo->expects( $this->never() )->method( 'update' );
		$repo->expects( $this->never() )->method( 'insert' );

		( new DefaultTemplatesSeeder( $repo, $this->dir ) )->seed();

		$this->assertSame( [], $this->option_writes );
	}

	public function test_writes_nothing_when_every_row_is_current(): void {
		$json         = (string) json_encode( $this->schema( 'v1' ) );
		$this->hashes = [ 'corporate-sidebar' => DefaultTemplatesSeeder::hash_json( $json ) ];
		$this->ship( 'corporate-sidebar', $this->schema( 'v1' ) );

		$repo = $this->repo( [ 'corporate-sidebar' => $this->row( 'corporate-sidebar', $json ) ] );
		$repo->expects( $this->never() )->method( 'update' );
		$repo->expects( $this->never() )->method( 'insert' );

		( new DefaultTemplatesSeeder( $repo, $this->dir ) )->seed();

		$this->assertSame( [], $this->option_writes );
	}

	public function test_every_shipped_template_file_is_catalogued(): void {
		$files = array_map(
			static function ( string $path ): string {
				return basename( $path, '.json' );
			},
			glob( dirname( __DIR__, 4 ) . '/templates/*.json' )
		);
		sort( $files );
		$catalogued = array_keys( DefaultTemplatesSeeder::source_meta() );
		sort( $catalogued );

		$this->assertSame( $catalogued, $files );
		$this->assertGreaterThanOrEqual( 40, count( $files ) );
	}
}
