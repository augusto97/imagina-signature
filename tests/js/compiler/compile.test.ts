import { describe, it, expect } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import { createEmptySchema } from '@/core/schema/signature';
import type { TextBlock } from '@/core/schema/blocks';
import '@/core/blocks';

describe('compileSignature', () => {
  it('produces a valid HTML doc for an empty schema', () => {
    const result = compileSignature(createEmptySchema());

    expect(result.html.startsWith('<!DOCTYPE html')).toBe(true);
    expect(result.html).toContain('<html');
    expect(result.html).toContain('</html>');
    expect(result.warnings).toEqual([]);
    expect(result.size).toBeGreaterThan(0);
  });

  it('inlines a text block into the email shell', () => {
    const schema = createEmptySchema();
    const textBlock: TextBlock = {
      id: 't1',
      type: 'text',
      content: 'hello world',
      style: {
        font_family: 'Arial, sans-serif',
        font_size: 14,
        font_weight: 400,
        color: '#111827',
        line_height: 1.4,
        text_align: 'left',
      },
      padding: { top: 4, right: 0, bottom: 4, left: 0 },
    };
    schema.blocks.push(textBlock);

    const result = compileSignature(schema);

    expect(result.html).toContain('hello world');
    expect(result.html).toContain('font-size:14px');
    expect(result.html).toContain('color:#111827');
    expect(result.html).toContain('padding:4px 0px 4px 0px');
  });

  it('warns about unknown block types instead of crashing', () => {
    const schema = createEmptySchema();
    // Cast to bypass the TS discriminated-union check on purpose —
    // the runtime path is what we care about.
    schema.blocks.push({ id: 'x', type: 'fake' } as never);

    const result = compileSignature(schema);

    expect(result.warnings.some((w) => w.includes('fake'))).toBe(true);
  });

  it('preserves mso conditional comments through minification', () => {
    const result = compileSignature(createEmptySchema());

    expect(result.html).toContain('<!--[if mso]>');
    expect(result.html).toContain('<![endif]-->');
  });
});
