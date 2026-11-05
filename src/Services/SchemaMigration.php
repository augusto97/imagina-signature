<?php
/**
 * Server-side schema upgrade (1.0 → 1.1 containers).
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

defined( 'ABSPATH' ) || exit;

/**
 * PHP port of the editor's `migrateSchemaInPlace()`
 * (`assets/editor/src/core/schema/migrate.ts`), used when the server
 * builds a signature out of a template on its own — template
 * assignment, propagation of a template update, save enforcement on a
 * linked signature.
 *
 * Seeded templates are still schema 1.0 (`columns: 1 | 2`, `children`,
 * `right_children`, `left_width`). If a linked signature kept that
 * shape, the editor would migrate it on every load with random column
 * ids, the server would put the template's 1.0 shape back on the next
 * save, and the two would never agree. This port produces the same
 * 1.1 structure the editor does — but with column ids derived from the
 * container id (`{container}-col-{n}`), so it is deterministic and the
 * editor's `schemaNeedsMigration()` is false for the result.
 *
 * @since 1.3.0
 */
final class SchemaMigration {

	/**
	 * Version the result is stamped with.
	 */
	public const CURRENT_VERSION = '1.1';

	/** Mirrors `MAX_CONTAINER_COLUMNS`. */
	private const MAX_COLUMNS = 4;

	/** Mirrors `MIN_COLUMN_WIDTH`. */
	private const MIN_COLUMN_WIDTH = 10;

	private const DEFAULT_LEFT_WIDTH = 50;
	private const MIN_LEFT_WIDTH     = 10;
	private const MAX_LEFT_WIDTH     = 90;

	/**
	 * Returns the schema migrated to {@see CURRENT_VERSION}. Idempotent.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed> $schema Decoded schema (associative arrays).
	 *
	 * @return array<string, mixed>
	 */
	public static function to_current( array $schema ): array {
		if ( ! isset( $schema['blocks'] ) || ! is_array( $schema['blocks'] ) ) {
			$schema['blocks'] = [];
		}
		if ( ! isset( $schema['variables'] ) || ! is_array( $schema['variables'] ) ) {
			$schema['variables'] = [];
		}

		$schema['blocks']         = self::migrate_blocks( $schema['blocks'] );
		$schema['schema_version'] = self::CURRENT_VERSION;

		return $schema;
	}

	/**
	 * Migrates every container of a block list, recursively.
	 *
	 * @param array<int|string, mixed> $blocks Block list.
	 *
	 * @return array<int|string, mixed>
	 */
	private static function migrate_blocks( array $blocks ): array {
		foreach ( $blocks as $index => $block ) {
			if ( ! is_array( $block ) || 'container' !== ( $block['type'] ?? '' ) ) {
				continue;
			}
			$block = self::migrate_container( $block );
			foreach ( $block['columns'] as $column_index => $column ) {
				$block['columns'][ $column_index ]['children'] = self::migrate_blocks( $column['children'] );
			}
			$blocks[ $index ] = $block;
		}
		return $blocks;
	}

	/**
	 * One container to the 1.1 shape.
	 *
	 * @param array<string, mixed> $container Container block.
	 *
	 * @return array<string, mixed>
	 */
	private static function migrate_container( array $container ): array {
		$base = isset( $container['id'] ) && is_string( $container['id'] ) && '' !== $container['id'] ? $container['id'] : 'container';

		if ( isset( $container['columns'] ) && is_array( $container['columns'] ) ) {
			return self::normalize_v2( $container, $base );
		}

		$two_columns = is_numeric( $container['columns'] ?? null ) && (float) $container['columns'] >= 2;
		$children    = self::block_list( $container['children'] ?? null );

		if ( $two_columns ) {
			if ( isset( $container['right_children'] ) && is_array( $container['right_children'] ) ) {
				$left  = $children;
				$right = self::block_list( $container['right_children'] );
			} else {
				// Pre-1.0.31: one list split half-by-half.
				$half  = (int) ceil( count( $children ) / 2 );
				$left  = array_slice( $children, 0, $half );
				$right = array_slice( $children, $half );
			}
			$left_width = self::clamp_left_width( $container['left_width'] ?? null );
			$columns    = [
				[
					'id'       => $base . '-col-0',
					'width'    => $left_width,
					'children' => $left,
				],
				[
					'id'       => $base . '-col-1',
					'width'    => 100 - $left_width,
					'children' => $right,
				],
			];
		} else {
			$columns = [
				[
					'id'       => $base . '-col-0',
					'width'    => 100,
					'children' => array_merge( $children, self::block_list( $container['right_children'] ?? null ) ),
				],
			];
		}

		unset( $container['children'], $container['right_children'], $container['left_width'] );
		$container['columns'] = $columns;
		if ( ! isset( $container['gap'] ) || ! is_numeric( $container['gap'] ) || is_string( $container['gap'] ) ) {
			$container['gap'] = 0;
		}

		return $container;
	}

	/**
	 * Normalises an already-1.1 container: column ids, children lists,
	 * stray 1.0 keys folded back in, ≤ 4 columns, widths summing to 100.
	 *
	 * @param array<string, mixed> $container Container block.
	 * @param string               $base      Id prefix for missing column ids.
	 *
	 * @return array<string, mixed>
	 */
	private static function normalize_v2( array $container, string $base ): array {
		$columns = [];
		foreach ( $container['columns'] as $column ) {
			if ( is_array( $column ) && ! self::is_list( $column ) ) {
				$columns[] = $column;
			}
		}

		foreach ( $columns as $index => $column ) {
			if ( ! isset( $column['id'] ) || ! is_string( $column['id'] ) || '' === $column['id'] ) {
				$column['id'] = $base . '-col-' . $index;
			}
			$column['children'] = self::block_list( $column['children'] ?? null );
			$columns[ $index ]  = $column;
		}

		if ( [] === $columns ) {
			$columns[] = [
				'id'       => $base . '-col-0',
				'width'    => 100,
				'children' => [],
			];
		}

		$stray_left  = self::block_list( $container['children'] ?? null );
		$stray_right = self::block_list( $container['right_children'] ?? null );
		if ( [] !== $stray_left ) {
			$columns[0]['children'] = array_merge( $columns[0]['children'], $stray_left );
		}
		if ( [] !== $stray_right ) {
			$last                         = count( $columns ) - 1;
			$columns[ $last ]['children'] = array_merge( $columns[ $last ]['children'], $stray_right );
		}
		unset( $container['children'], $container['right_children'], $container['left_width'] );

		$count = count( $columns );
		while ( $count > self::MAX_COLUMNS ) {
			$extra                        = array_pop( $columns );
			$count                        = count( $columns );
			$last                         = $count - 1;
			$columns[ $last ]['children'] = array_merge( $columns[ $last ]['children'], $extra['children'] );
			$columns[ $last ]['width']    = self::number( $columns[ $last ]['width'] ?? 0 ) + self::number( $extra['width'] ?? 0 );
		}

		$widths = self::normalize_widths(
			array_map(
				static function ( array $column ) {
					return $column['width'] ?? null;
				},
				$columns
			)
		);
		foreach ( $columns as $index => $column ) {
			$columns[ $index ]['width'] = $widths[ $index ] ?? 100;
		}

		$container['columns'] = $columns;
		if ( ! isset( $container['gap'] ) || ! is_numeric( $container['gap'] ) || is_string( $container['gap'] ) ) {
			$container['gap'] = 0;
		}

		return $container;
	}

	/**
	 * Port of `normalizeWidths()`: positive numbers scaled to sum 100,
	 * each at least {@see MIN_COLUMN_WIDTH}, drift settled on the widest.
	 *
	 * @since 1.3.0
	 *
	 * @param array<int, mixed> $widths Candidate widths.
	 *
	 * @return array<int, int>
	 */
	public static function normalize_widths( array $widths ): array {
		$widths = array_values( $widths );
		$n      = count( $widths );
		if ( 0 === $n ) {
			return [];
		}
		if ( 1 === $n ) {
			return [ 100 ];
		}

		$raw = [];
		foreach ( $widths as $width ) {
			$value = self::number( $width );
			$raw[] = $value > 0 ? $value : 100 / $n;
		}
		$sum = array_sum( $raw );
		$out = [];
		foreach ( $raw as $value ) {
			$out[] = max( self::MIN_COLUMN_WIDTH, (int) round( ( $value * 100 ) / $sum ) );
		}

		$diff  = 100 - array_sum( $out );
		$guard = 400;
		while ( 0 !== $diff && $guard-- > 0 ) {
			$pick = -1;
			for ( $i = 0; $i < $n; $i++ ) {
				if ( $diff < 0 && $out[ $i ] <= self::MIN_COLUMN_WIDTH ) {
					continue;
				}
				if ( -1 === $pick || $out[ $i ] >= $out[ $pick ] ) {
					$pick = $i;
				}
			}
			if ( -1 === $pick ) {
				break;
			}
			$out[ $pick ] += $diff > 0 ? 1 : -1;
			$diff         += $diff > 0 ? -1 : 1;
		}

		return $out;
	}

	/**
	 * @param mixed $value Candidate left width.
	 */
	private static function clamp_left_width( $value ): int {
		$width = is_numeric( $value ) ? (int) round( (float) $value ) : self::DEFAULT_LEFT_WIDTH;
		return max( self::MIN_LEFT_WIDTH, min( self::MAX_LEFT_WIDTH, $width ) );
	}

	/**
	 * Only the object entries of a list (anything else is dropped).
	 *
	 * @param mixed $value Candidate list.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	private static function block_list( $value ): array {
		if ( ! is_array( $value ) ) {
			return [];
		}
		$out = [];
		foreach ( $value as $item ) {
			if ( is_array( $item ) && ( [] === $item || ! self::is_list( $item ) ) ) {
				$out[] = $item;
			}
		}
		return $out;
	}

	/**
	 * @param mixed $value Candidate.
	 */
	private static function number( $value ): float {
		return is_numeric( $value ) ? (float) $value : 0.0;
	}

	/**
	 * @param array<int|string, mixed> $value Array.
	 */
	private static function is_list( array $value ): bool {
		return [] === $value || array_keys( $value ) === range( 0, count( $value ) - 1 );
	}
}
