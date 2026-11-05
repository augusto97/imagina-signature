import { describe, expect, it } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block, DisclaimerBlock, HeadingBlock } from '@/core/schema/blocks';
import {
  plainTextToHtml,
  resolveRichContent,
  richContentPatch,
  scaleSpanLineHeights,
} from '@/core/blocks/text/richText';
import { normaliseHeading } from '@/core/blocks/heading/definition';
import { normaliseDisclaimer } from '@/core/blocks/disclaimer/definition';
import { getBlockDefinition } from '@/core/blocks/registry';
import '@/core/blocks';

/**
 * Heading and disclaimer became rich text in 1.2. Older rows (plain
 * `content`) migrate implicitly: escaped, newlines → <br>.
 */

function compile(blocks: Block[], variables: Record<string, string> = {}) {
  const schema = createEmptySchema();
  schema.canvas.link_color = '#0d9488';
  schema.blocks = blocks;
  schema.variables = variables;
  return compileSignature(schema);
}

const heading = (extra: Partial<HeadingBlock> = {}): HeadingBlock => ({
  id: 'h',
  type: 'heading',
  content: 'Jane Doe',
  style: { font_size: 18, font_weight: 700, line_height: 1.2 },
  ...extra,
});

const disclaimer = (extra: Partial<DisclaimerBlock> = {}): DisclaimerBlock => ({
  id: 'd',
  type: 'disclaimer',
  content: 'Confidential.',
  style: { font_size: 10, color: '#6b7280' },
  ...extra,
});

describe('heading migration (plain → rich)', () => {
  it('escapes a legacy plain-text heading', () => {
    const block = heading({ content: 'Smith & Sons <b>Ltd</b>' });
    expect(resolveRichContent(block)).toBe('Smith &amp; Sons &lt;b&gt;Ltd&lt;/b&gt;');
    const { html } = compile([block]);
    expect(html).toContain('Smith &amp; Sons &lt;b&gt;Ltd&lt;/b&gt;');
    expect(html).not.toContain('<b>Ltd</b>');
  });

  it('renders content_html once written, with partial colour and size', () => {
    const block = heading(
      richContentPatch('<p>Jane <span style="color: #ec4899; font-size: 24px">Doe</span></p>'),
    );
    expect(block.content).toBe('Jane Doe');
    const { html } = compile([block]);
    expect(html).toContain(
      '<p style="margin:0">Jane <span style="color:#ec4899;font-size:24px;line-height:29px">Doe</span></p>',
    );
  });

  it('falls back to plain content when it was changed without content_html', () => {
    // e.g. an older editor or a template sync rewrote `content` only.
    const block = heading({
      content: 'Maria Lopez',
      content_html: '<p><strong>Jane</strong> Doe</p>',
    });
    expect(resolveRichContent(block)).toBe('Maria Lopez');
    expect(compile([block]).html).toContain('Maria Lopez');
  });

  it('keeps variables as plain tokens that the compiler substitutes', () => {
    const block = heading(richContentPatch('<p><strong>{{first}}</strong> Doe</p>'));
    expect(block.content).toBe('{{first}} Doe');
    const { html } = compile([block], { first: 'Ana' });
    expect(html).toContain('<strong>Ana</strong> Doe');
  });

  it('normaliseHeading writes the escaped twin and is idempotent', () => {
    const legacy = heading({ content: 'A & B' });
    const once = normaliseHeading(legacy);
    expect(once.content_html).toBe('A &amp; B');
    expect(once.content).toBe('A & B');
    expect(normaliseHeading(once)).toEqual(once);
  });

  it('new headings carry both fields', () => {
    const block = getBlockDefinition('heading')!.create() as HeadingBlock;
    expect(block.content_html).toBe(`<p>${plainTextToHtml(block.content)}</p>`);
    expect(resolveRichContent(block)).toBe(block.content_html);
  });
});

describe('disclaimer migration (plain → rich with links)', () => {
  it('turns legacy newlines into <br> and escapes markup', () => {
    const block = disclaimer({ content: 'Line one\nLine <two>\r\nLine three' });
    expect(compile([block]).html).toContain('Line one<br>Line &lt;two&gt;<br>Line three');
  });

  it('renders links in the canvas link colour', () => {
    const block = disclaimer(
      richContentPatch(
        '<p><strong>Confidential.</strong> See <a href="https://acme.example/legal" target="_blank" rel="noopener">terms</a>.</p>',
      ),
    );
    expect(block.content).toBe('Confidential. See terms (https://acme.example/legal).');
    const result = compile([block]);
    expect(result.html).toContain(
      '<a href="https://acme.example/legal" target="_blank" rel="noopener" style="color:#0d9488;text-decoration:underline">terms</a>',
    );
    expect(result.html).not.toContain('data-imgsig-src');
    // Plain-text export reads the mirror.
    expect(result.text).toContain('Confidential. See terms (https://acme.example/legal).');
  });

  it('strips unsafe links and markup from content_html at compile time', () => {
    const block = disclaimer({
      content: 'x',
      content_html: '<p>x<a href="javascript:alert(1)">y</a><img src=x onerror=alert(1)></p>',
    });
    // Mirror mismatch ("xy" vs "x") → the plain text wins; still safe.
    const { html } = compile([block]);
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('onerror');
  });

  it('normaliseDisclaimer keeps line breaks', () => {
    const once = normaliseDisclaimer(disclaimer({ content: 'One\nTwo' }));
    expect(once.content_html).toBe('One<br>Two');
    expect(once.content).toBe('One\nTwo');
  });
});

describe('scaleSpanLineHeights', () => {
  it('only touches spans that change the font size', () => {
    expect(
      scaleSpanLineHeights(
        '<span style="color:#111111">a</span><span style="font-size:20px">b</span>',
        1.5,
      ),
    ).toBe(
      '<span style="color:#111111">a</span><span style="font-size:20px;line-height:30px">b</span>',
    );
  });
});
