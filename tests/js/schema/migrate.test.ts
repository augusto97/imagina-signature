import { describe, it, expect } from 'vitest';
import {
  migrateBlock,
  migrateSchema,
  migrateSchemaInPlace,
  schemaNeedsMigration,
} from '@/core/schema/migrate';
import {
  createEmptySchema,
  CURRENT_SCHEMA_VERSION,
  type SignatureSchema,
} from '@/core/schema/signature';
import type { Block, ContainerBlock } from '@/core/schema/blocks';
import { validateSchema } from '@/core/schema/validators';
import { compileSignature } from '@/core/compiler/compile';
import { useSchemaStore } from '@/stores/schemaStore';
import { container, ids, text } from '../fixtures/containers';
import '@/core/blocks';

/** A 1.0 schema holding `blocks` (raw, as stored before schema 1.1). */
function legacySchema(blocks: unknown[]): SignatureSchema {
  const schema = createEmptySchema() as unknown as Record<string, unknown>;
  schema.schema_version = '1.0';
  schema.blocks = blocks;
  return schema as unknown as SignatureSchema;
}

const legacyTwoCol = (id: string, left: unknown[], right: unknown[] | undefined, extra = {}) => ({
  id,
  type: 'container',
  columns: 2,
  gap: 16,
  children: left,
  ...(right === undefined ? {} : { right_children: right }),
  ...extra,
});

const asContainer = (b: Block | undefined): ContainerBlock => b as ContainerBlock;

describe('schema 1.0 → 1.1 migration', () => {
  it('turns a 1.0 two-column container into v2 columns, keeping ratio, order and ids', () => {
    const schema = legacySchema([
      legacyTwoCol('row', [text('L1'), text('L2')], [text('R1')], { left_width: 33 }),
    ]);
    migrateSchemaInPlace(schema);

    expect(schema.schema_version).toBe('1.1');
    const row = asContainer(schema.blocks[0]);
    expect(row.columns).toHaveLength(2);
    expect(row.columns.map((c) => c.width)).toEqual([33, 67]);
    expect(ids(row, 0)).toEqual(['L1', 'L2']);
    expect(ids(row, 1)).toEqual(['R1']);
    expect(row.gap).toBe(16);
    for (const key of ['children', 'right_children', 'left_width']) {
      expect(key in row).toBe(false);
    }
    expect(row.columns[0]!.id).not.toBe(row.columns[1]!.id);
    expect(validateSchema(schema)).toEqual([]);
  });

  it('defaults a missing left_width to an even split and clamps extremes', () => {
    const even = legacySchema([legacyTwoCol('a', [], [])]);
    migrateSchemaInPlace(even);
    expect(asContainer(even.blocks[0]).columns.map((c) => c.width)).toEqual([50, 50]);

    const extreme = legacySchema([legacyTwoCol('b', [], [], { left_width: 99 })]);
    migrateSchemaInPlace(extreme);
    expect(asContainer(extreme.blocks[0]).columns.map((c) => c.width)).toEqual([90, 10]);
  });

  it('splits a pre-1.0.31 single children list the way the old compiler did', () => {
    const schema = legacySchema([
      legacyTwoCol('legacy', [text('A'), text('B'), text('C'), text('D'), text('E')], undefined),
    ]);
    migrateSchemaInPlace(schema);
    const row = asContainer(schema.blocks[0]);
    expect(ids(row, 0)).toEqual(['A', 'B', 'C']); // Math.ceil(5 / 2)
    expect(ids(row, 1)).toEqual(['D', 'E']);
  });

  it('folds a stray right list of a 1-column container back into its only column', () => {
    const schema = legacySchema([
      {
        id: 'one',
        type: 'container',
        columns: 1,
        gap: 0,
        children: [text('A')],
        right_children: [text('B')],
      },
    ]);
    migrateSchemaInPlace(schema);
    const row = asContainer(schema.blocks[0]);
    expect(row.columns).toHaveLength(1);
    expect(row.columns[0]!.width).toBe(100);
    expect(ids(row, 0)).toEqual(['A', 'B']);
  });

  it('migrates nested containers recursively', () => {
    const schema = legacySchema([
      legacyTwoCol(
        'outer',
        [legacyTwoCol('inner', [text('x')], [text('y')], { left_width: 40 })],
        [text('z')],
      ),
    ]);
    migrateSchemaInPlace(schema);
    const inner = asContainer(asContainer(schema.blocks[0]).columns[0]!.children[0]);
    expect(inner.columns.map((c) => c.width)).toEqual([40, 60]);
    expect(ids(inner, 1)).toEqual(['y']);
    expect(schemaNeedsMigration(schema)).toBe(false);
  });

  it('is idempotent and never writes to a current schema', () => {
    const schema = legacySchema([legacyTwoCol('row', [text('L')], [text('R')])]);
    migrateSchemaInPlace(schema);
    const once = JSON.stringify(schema);
    migrateSchemaInPlace(schema);
    expect(JSON.stringify(schema)).toBe(once);

    const current = createEmptySchema();
    current.blocks.push(container('cnt', [[text('a')], [text('b')], [text('c')]]));
    const frozen = deepFreeze(JSON.parse(JSON.stringify(current)) as SignatureSchema);
    expect(schemaNeedsMigration(frozen)).toBe(false);
    expect(() => migrateSchemaInPlace(frozen)).not.toThrow();
  });

  it('normalises malformed v2 rows without losing blocks', () => {
    const schema = createEmptySchema();
    (schema.blocks as unknown[]).push({
      id: 'cnt',
      type: 'container',
      gap: 10,
      columns: [
        { width: 30, children: [text('a')] },
        { id: 'c2', width: 30, children: [text('b')] },
        { id: 'c3', width: 30, children: [] },
        { id: 'c4', width: 30, children: [text('c')] },
        { id: 'c5', width: 30, children: [text('d')] },
      ],
      right_children: [text('stray')],
    });
    migrateSchemaInPlace(schema);
    const row = asContainer(schema.blocks[0]);
    expect(row.columns).toHaveLength(4);
    expect(row.columns[0]!.id).toMatch(/^col_/);
    expect(row.columns.map((c) => c.width).reduce((a, b) => a + b, 0)).toBe(100);
    expect(row.columns.flatMap((c) => c.children.map((b) => b.id)).sort()).toEqual(
      ['a', 'b', 'c', 'd', 'stray'].sort(),
    );
    expect('right_children' in row).toBe(false);
  });

  it('normalises PHP-mangled variables and stamps the current version', () => {
    const schema = legacySchema([]);
    (schema as unknown as Record<string, unknown>).variables = [];
    migrateSchemaInPlace(schema);
    expect(schema.variables).toEqual({});
    expect(schema.schema_version).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('migrateSchema / migrateBlock return migrated copies and leave the input alone', () => {
    const legacy = legacySchema([legacyTwoCol('row', [text('L')], [text('R')])]);
    const snapshot = JSON.stringify(legacy);
    const migrated = migrateSchema(legacy);
    expect(JSON.stringify(legacy)).toBe(snapshot);
    expect(asContainer(migrated.blocks[0]).columns).toHaveLength(2);

    const block = legacyTwoCol('b', [text('x')], []) as unknown as Block;
    const copy = migrateBlock(block);
    expect(Array.isArray(asContainer(copy).columns)).toBe(true);
    expect((block as unknown as { columns: number }).columns).toBe(2);
  });
});

describe('every entry point migrates', () => {
  it('setSchema / replaceSchema / replaceSchemaForHistory', () => {
    const fresh = () => legacySchema([legacyTwoCol('row', [text('L')], [text('R')])]);

    useSchemaStore.getState().setSchema(fresh());
    expect(Array.isArray(asContainer(useSchemaStore.getState().schema.blocks[0]).columns)).toBe(
      true,
    );

    const input = fresh();
    useSchemaStore.getState().replaceSchema(input);
    expect(useSchemaStore.getState().schema.schema_version).toBe('1.1');
    expect((input.blocks[0] as unknown as { columns: number }).columns).toBe(2); // input untouched

    useSchemaStore.getState().replaceSchemaForHistory(fresh());
    expect(ids(useSchemaStore.getState().schema.blocks[0], 1)).toEqual(['R']);
  });

  it('compileSignature accepts raw 1.0 input without mutating it', () => {
    const legacy = legacySchema([
      legacyTwoCol('row', [text('L', 'Left words')], [text('R', 'Right words')], {
        left_width: 25,
      }),
    ]);
    const snapshot = JSON.stringify(legacy);
    const fromLegacy = compileSignature(legacy);
    expect(JSON.stringify(legacy)).toBe(snapshot);
    expect(fromLegacy.html).toContain('Left words');
    expect(fromLegacy.html).toContain('Right words');
    expect(compileSignature(migrateSchema(legacy)).html).toBe(fromLegacy.html);
  });
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
