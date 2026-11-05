<?php
/**
 * Role-visibility filter of TemplateRepository::list().
 *
 * @package ImaginaSignatures\Tests\Unit\Repositories
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Repositories;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Repositories\TemplateRepository;
use PHPUnit\Framework\TestCase;

/**
 * The filter must be portable SQL: FIND_IN_SET is MySQL-only, and on
 * the SQLite database driver it made the whole query fail, so every
 * non-admin saw an empty template library.
 */
final class TemplateRepositoryWhereTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		Functions\when( 'sanitize_key' )->alias(
			static function ( $key ): string {
				return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $key ) );
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * @param array<string, mixed> $args List args.
	 *
	 * @return array{0: string, 1: array<int, mixed>}
	 */
	private function where( array $args ): array {
		$wpdb         = $this->getMockBuilder( \wpdb::class )->disableOriginalConstructor()->getMock();
		$wpdb->prefix = 'wp_';
		$repo         = new TemplateRepository( $wpdb );
		$method       = new \ReflectionMethod( TemplateRepository::class, 'build_where' );
		$method->setAccessible( true );
		return $method->invoke( $repo, $args );
	}

	public function test_role_filter_uses_portable_sql(): void {
		[ $sql, $values ] = $this->where( [ 'visible_to_roles' => [ 'subscriber', 'shop_manager' ] ] );

		$this->assertStringNotContainsString( 'FIND_IN_SET', $sql );
		$this->assertSame(
			"WHERE ((visible_to_roles IS NULL OR visible_to_roles = %s) OR INSTR(CONCAT(',', visible_to_roles, ','), %s) > 0 OR INSTR(CONCAT(',', visible_to_roles, ','), %s) > 0)",
			$sql
		);
		// Comma-delimited needles: "scriber" never matches "subscriber".
		$this->assertSame( [ '', ',subscriber,', ',shop_manager,' ], $values );
	}

	public function test_no_role_filter_without_roles(): void {
		$this->assertSame( [ '', [] ], $this->where( [] ) );
	}
}
