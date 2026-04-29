import { describe, it, expect } from 'vitest';
import { validateSignatureSchema } from '../../../assets/editor/src/schema/validators';
import { emptySchema } from '../../../assets/editor/src/schema/signature';

describe('validateSignatureSchema', () => {
  it('accepts an empty schema', () => {
    const result = validateSignatureSchema(emptySchema());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects an unknown schema_version', () => {
    const data = { ...emptySchema(), schema_version: '0.9' };
    const result = validateSignatureSchema(data);
    expect(result.valid).toBe(false);
    expect(result.errors[0].path).toBe('schema_version');
  });

  it('rejects out-of-range canvas widths', () => {
    const data = emptySchema();
    data.canvas.width = 1200;
    const result = validateSignatureSchema(data);
    expect(result.valid).toBe(false);
    expect(result.errors[0].path).toBe('canvas.width');
  });

  it('rejects unsafe image src', () => {
    const data = emptySchema();
    data.blocks = [
      {
        id: 'a',
        type: 'image',
        grid: { col: 1, row: 1 },
        src: 'javascript:alert(1)',
        alt: 'x',
        width: 100,
      } as never,
    ];
    const result = validateSignatureSchema(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'blocks[0].src')).toBe(true);
  });
});
