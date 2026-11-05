import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import type {
  ButtonCtaBlock,
  ContactRowBlock,
  ContainerBlock,
  HeadingBlock,
  ImageBlock,
  QrCodeBlock,
  TextBlock,
} from '@/core/schema/blocks';
import { findBlock, walkBlocks } from '@/core/schema/tree';
import { resolveBlockVariables } from '@/editor/canvas/liveData';
import {
  hasVariableTokens,
  replaceVariables,
  resolvedVariables,
  substituteVariables,
} from '@/core/compiler/variables';
import { container, text } from '../fixtures/containers';

const VARS = {
  wp_first_name: 'Jane',
  company_name: 'Smith & Co <Ltd>',
  company_website: 'https://acme.example',
  company_logo: '',
};

const heading = (content: string): HeadingBlock => ({
  id: 'h1',
  type: 'heading',
  content,
  style: { font_family: 'Arial', font_size: 18, font_weight: 700, color: '#111' },
});

describe('variables: shared substitution core', () => {
  it('replaceVariables resolves known keys, keeps unknown ones and reports them', () => {
    const out = replaceVariables('{{ wp_first_name }} at {{company_name}} {{nope}}', VARS);
    expect(out.text).toBe('Jane at Smith & Co <Ltd> {{nope}}');
    expect(out.missing).toEqual(['nope']);
  });

  it('substituteVariables (the compiler path) escapes values', () => {
    expect(substituteVariables('<b>{{company_name}}</b>', VARS).html).toBe(
      '<b>Smith &amp; Co &lt;Ltd&gt;</b>',
    );
  });

  it('hasVariableTokens is stateless across calls', () => {
    expect(hasVariableTokens('a {{x}}')).toBe(true);
    expect(hasVariableTokens('a {{x}}')).toBe(true);
    expect(hasVariableTokens('a {x}')).toBe(false);
  });

  it('resolvedVariables lets the signature override system values', () => {
    expect(
      resolvedVariables({ company_name: 'Mine' }, { company_name: 'Acme', wp_url: 'u' }),
    ).toEqual({ company_name: 'Mine', wp_url: 'u' });
  });
});

describe('resolveBlockVariables', () => {
  it('returns a resolved deep copy and leaves the input untouched', () => {
    const block: ContactRowBlock = {
      id: 'c1',
      type: 'contact_row',
      rows: [
        { icon: 'web', label: '{{company_website}}', href: '{{company_website}}' },
        { icon: 'email', label: 'Hi {{wp_first_name}}', href: 'mailto:{{wp_email}}' },
      ],
      style: { font_family: 'Arial', font_size: 13, font_weight: 400, color: '#333' },
      padding: { top: 1, right: 2, bottom: 3, left: 4 },
    };
    const before = structuredClone(block);

    const out = resolveBlockVariables(block, VARS);

    expect(out).not.toBe(block);
    expect(out.rows).not.toBe(block.rows);
    expect(out.rows?.[0]).not.toBe(block.rows?.[0]);
    expect(out.style).not.toBe(block.style);
    expect(out.padding).not.toBe(block.padding);
    expect(out.rows?.[0]).toEqual({
      icon: 'web',
      label: 'https://acme.example',
      href: 'https://acme.example',
    });
    // Unknown key kept verbatim, like the export.
    expect(out.rows?.[1]).toEqual({ icon: 'email', label: 'Hi Jane', href: 'mailto:{{wp_email}}' });
    expect(block).toEqual(before);
  });

  it('works on frozen (immer store) blocks without mutating them', () => {
    const frozen = produce(heading('{{company_name}}'), () => undefined);
    expect(Object.isFrozen(frozen)).toBe(true);
    const out = resolveBlockVariables(frozen, VARS);
    expect(out.content).toBe('Smith & Co <Ltd>');
    expect(frozen.content).toBe('{{company_name}}');
    expect(Object.isFrozen(out)).toBe(false);
  });

  it('HTML-escapes values in HTML fields only (text content), like the compiler', () => {
    const t: TextBlock = text('t1', '<p>{{company_name}}</p>');
    expect(resolveBlockVariables(t, VARS).content).toBe('<p>Smith &amp; Co &lt;Ltd&gt;</p>');
    // Plain-text fields get the raw value — React escapes it on render.
    expect(resolveBlockVariables(heading('{{company_name}}'), VARS).content).toBe(
      'Smith & Co <Ltd>',
    );
  });

  it('URL fields that resolve to empty stay empty strings', () => {
    const img: ImageBlock = {
      id: 'i1',
      type: 'image',
      src: '{{company_logo}}',
      alt: '{{company_name}} logo',
      link: '{{company_website}}',
      width: 120,
    };
    const out = resolveBlockVariables(img, VARS);
    expect(out.src).toBe('');
    expect(out.alt).toBe('Smith & Co <Ltd> logo');
    expect(out.link).toBe('https://acme.example');
    expect(out.width).toBe(120);
  });

  it('never substitutes ids, types, hashes or export-literal fields', () => {
    const qr: QrCodeBlock = {
      id: '{{wp_first_name}}',
      type: 'qr_code',
      data: '{{company_website}}',
      size: 120,
      color: '#000000',
      background_color: '#ffffff',
      caption: 'Visit {{company_website}}',
      image_url: 'https://cdn.example/qr.png',
      image_hash: '{{company_name}}',
    };
    const out = resolveBlockVariables(qr, VARS);
    expect(out.id).toBe('{{wp_first_name}}');
    expect(out.type).toBe('qr_code');
    expect(out.image_hash).toBe('{{company_name}}');
    // The hosted PNG encodes the raw data; the canvas must show the same.
    expect(out.data).toBe('{{company_website}}');
    expect(out.caption).toBe('Visit https://acme.example');
  });

  it('resolves nested containers through the tree helpers', () => {
    const button: ButtonCtaBlock = {
      id: 'btn',
      type: 'button_cta',
      label: 'Visit {{company_name}}',
      href: '{{company_website}}',
      background_color: '#000',
      text_color: '#fff',
      border_radius: 4,
    };
    const inner = container('inner', [[heading('{{wp_first_name}}')], [button]]);
    const outer = container('outer', [[text('t', '<p>{{company_name}}</p>')], [inner]]);
    const before = structuredClone(outer);

    const out = resolveBlockVariables(outer, VARS);

    expect(out).not.toBe(outer);
    expect(out.columns).not.toBe(outer.columns);
    expect(out.columns[1]!.children).not.toBe(outer.columns[1]!.children);
    expect((findBlock(out.columns[0]!.children, 't') as TextBlock).content).toBe(
      '<p>Smith &amp; Co &lt;Ltd&gt;</p>',
    );
    expect((findBlock([out], 'h1') as HeadingBlock).content).toBe('Jane');
    const resolvedButton = findBlock([out], 'btn') as ButtonCtaBlock;
    expect(resolvedButton.label).toBe('Visit Smith & Co <Ltd>');
    expect(resolvedButton.href).toBe('https://acme.example');

    // Same tree shape: ids, column ids and widths preserved.
    const ids = (root: ContainerBlock): string[] => {
      const list: string[] = [];
      walkBlocks([root], (b) => {
        list.push(b.id);
      });
      return list;
    };
    expect(ids(out)).toEqual(ids(outer));
    expect(out.columns.map((c) => [c.id, c.width])).toEqual(
      outer.columns.map((c) => [c.id, c.width]),
    );
    expect(outer).toEqual(before);
  });

  it("children: 'keep' copies the container but keeps the original child lists", () => {
    const child = heading('{{wp_first_name}}');
    const row = container('row', [[child], []], { gap: 12 });

    const out = resolveBlockVariables(row, VARS, { children: 'keep' });

    expect(out).not.toBe(row);
    expect(out.columns).not.toBe(row.columns);
    expect(out.columns[0]).not.toBe(row.columns[0]);
    expect(out.columns[0]!.children).toBe(row.columns[0]!.children);
    expect(out.columns[0]!.children[0]).toBe(child);
    expect(child.content).toBe('{{wp_first_name}}');
    expect(out.gap).toBe(12);
  });

  it('leaves tokens alone when no variable matches', () => {
    const out = resolveBlockVariables(heading('{{unknown}} and {{ also.unknown }}'), {});
    expect(out.content).toBe('{{unknown}} and {{ also.unknown }}');
  });
});
