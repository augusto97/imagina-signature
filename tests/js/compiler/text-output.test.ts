import { describe, expect, it } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block } from '@/core/schema/blocks';
import '@/core/blocks';

const style = { font_family: 'Arial, sans-serif', font_size: 14, font_weight: 400 as const, color: '#111827' };

function compileBlocks(blocks: Block[], linkColor = '#0d9488'): string {
  const schema = createEmptySchema();
  schema.canvas.link_color = linkColor;
  schema.blocks = blocks;
  return compileSignature(schema).html;
}

describe('text output', () => {
  it('emits paragraphs with margin:0', () => {
    const html = compileBlocks([{ id: 't', type: 'text', content: '<p>One</p><p>Two</p>', style }]);
    expect(html).toContain('<p style="margin:0">One</p><p style="margin:0">Two</p>');
  });

  it('applies the canvas link colour to text links', () => {
    const html = compileBlocks([
      { id: 't', type: 'text', content: 'Visit <a href="https://acme.example">our site</a>', style },
    ]);
    expect(html).toContain(
      '<a href="https://acme.example" style="color:#0d9488;text-decoration:underline">our site</a>',
    );
  });

  it('keeps contact rows on their own colour', () => {
    const html = compileBlocks([
      {
        id: 'c',
        type: 'contact_row',
        rows: [{ icon: 'email', label: 'a@b.example', href: 'mailto:a@b.example' }],
        style: { ...style, color: '#374151' },
      },
    ]);
    expect(html).toContain('style="color:#374151;text-decoration:none"');
    expect(html).not.toContain('color:#0d9488');
  });

  it('turns disclaimer newlines into <br>', () => {
    const html = compileBlocks([
      { id: 'd', type: 'disclaimer', content: 'Line one\nLine <two>\r\nLine three', style },
    ]);
    expect(html).toContain('Line one<br>Line &lt;two&gt;<br>Line three');
  });

  it('strips XSS from text content at compile time', () => {
    const html = compileBlocks([
      { id: 't', type: 'text', content: '<section><img src=x onerror=alert(1)></section>ok', style },
    ]);
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<img');
    expect(html).toContain('ok');
  });
});
