import { describe, it, expect } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import { createEmptySchema } from '@/core/schema/signature';
import type { TextBlock, ContainerBlock } from '@/core/schema/blocks';
import '@/core/blocks';

/**
 * Regression: block.visible === false must NOT ship in the compiled
 * HTML. Until 1.0.25 the visible flag was honored on the canvas only
 * (Layers eye toggle faded the row) — the export still included
 * hidden blocks, so the user could "hide" a banner / disclaimer and
 * the recipient would see it anyway.
 */

const textBlock = (id: string, content: string, hidden = false): TextBlock => ({
  id,
  type: 'text',
  content,
  visible: hidden ? false : undefined,
  style: { font_family: 'Arial', font_size: 14, font_weight: 400, color: '#000' },
});

describe('compile honours block.visible', () => {
  it('skips top-level blocks where visible === false', () => {
    const schema = createEmptySchema();
    schema.blocks.push(
      textBlock('a', 'visible-content'),
      textBlock('b', 'hidden-content', true),
    );

    const { html } = compileSignature(schema);
    expect(html).toContain('visible-content');
    expect(html).not.toContain('hidden-content');
  });

  it('skips hidden children inside a Container', () => {
    const schema = createEmptySchema();
    const container: ContainerBlock = {
      id: 'cnt',
      type: 'container',
      columns: 1,
      gap: 0,
      children: [
        textBlock('child-visible', 'kept-child'),
        textBlock('child-hidden', 'dropped-child', true),
      ],
    };
    schema.blocks.push(container);

    const { html } = compileSignature(schema);
    expect(html).toContain('kept-child');
    expect(html).not.toContain('dropped-child');
  });

  it('still includes blocks where visible is undefined (default visible)', () => {
    const schema = createEmptySchema();
    schema.blocks.push(textBlock('a', 'default-visible'));
    const { html } = compileSignature(schema);
    expect(html).toContain('default-visible');
  });
});
