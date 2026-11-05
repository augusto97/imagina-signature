import { describe, expect, it } from 'vitest';
import { sameJson } from '@/services/persistence';
import { migrateContainersInPlace } from '@/core/schema/migrate';
import type { SignatureSchema } from '@/core/schema/signature';

describe('sameJson', () => {
  it('treats empty arrays and empty objects as equal (PHP round trip)', () => {
    expect(sameJson({ variables: {} }, { variables: [] })).toBe(true);
  });

  it('detects real differences', () => {
    expect(sameJson({ a: 'x' }, { a: 'y' })).toBe(false);
    expect(sameJson({ list: [1, 2] }, { list: [1] })).toBe(false);
    expect(sameJson({ variables: { name: 'Ana' } }, { variables: [] })).toBe(false);
  });

  it('ignores key order', () => {
    expect(sameJson({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true);
  });
});

describe('schema normalisation on load', () => {
  it('turns a PHP-encoded empty variables array back into an object', () => {
    const schema = {
      schema_version: '1.0',
      meta: { created_at: '', updated_at: '', editor_version: '1' },
      canvas: {},
      blocks: [],
      variables: [],
    } as unknown as SignatureSchema;
    migrateContainersInPlace(schema);
    expect(Array.isArray(schema.variables)).toBe(false);
    (schema.variables as Record<string, string>).company = 'ACME';
    expect(JSON.parse(JSON.stringify(schema)).variables).toEqual({ company: 'ACME' });
  });
});
