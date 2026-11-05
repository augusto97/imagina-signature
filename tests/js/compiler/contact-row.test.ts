import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import { setAssetsBaseUrl } from '@/core/compiler/assets';
import { createEmptySchema } from '@/core/schema/signature';
import type { ContactRowBlock } from '@/core/schema/blocks';
import {
  contactHref,
  normalizeContactRow,
  toV2Patch,
  type ContactItem,
} from '@/core/blocks/contact-row/normalize';
import { separatorHtml } from '@/core/blocks/contact-row/compileContact';
import '@/core/blocks';

const BASE = 'https://acme.example/wp-content/plugins/imagina-signatures';

beforeEach(() => setAssetsBaseUrl(BASE));
afterEach(() => setAssetsBaseUrl(null));

function contact(overrides: Partial<ContactRowBlock> = {}): ContactRowBlock {
  return {
    id: 'cr',
    type: 'contact_row',
    items: [
      { id: 'e', type: 'email', value: 'jane@acme.example' },
      { id: 'p', type: 'phone', value: '+1 (555) 100-2000' },
      { id: 'w', type: 'website', value: 'acme.example' },
    ],
    layout: 'stacked',
    show_icons: true,
    icon_shape: 'circle',
    icon_tone: 'brand',
    icon_size: 16,
    label_mode: 'none',
    style: { font_size: 13, font_weight: 400, color: '#374151' },
    ...overrides,
  };
}

function compile(block: ContactRowBlock, variables: Record<string, string> = {}) {
  const schema = createEmptySchema();
  schema.canvas.font_family = 'Georgia, serif';
  schema.blocks = [block];
  schema.variables = variables;
  const result = compileSignature(schema);
  const doc = new DOMParser().parseFromString(result.fragment, 'text/html');
  return { ...result, doc };
}

const item = (type: ContactItem['type'], value: string, extra: Partial<ContactItem> = {}) => ({
  id: 'i',
  type,
  value,
  ...extra,
});

describe('contact hrefs', () => {
  it('derives the link from the value per type', () => {
    expect(contactHref(item('email', ' jane@acme.example '))).toBe('mailto:jane@acme.example');
    expect(contactHref(item('phone', '+1 (555) 100-2000 ext'))).toBe('tel:+15551002000');
    expect(contactHref(item('mobile', '0034 600 11 22 33'))).toBe('tel:0034600112233');
    expect(contactHref(item('whatsapp', '+34 600 11 22 33'))).toBe('https://wa.me/34600112233');
    expect(contactHref(item('website', 'acme.example/team'))).toBe('https://acme.example/team');
    expect(contactHref(item('website', 'http://acme.example'))).toBe('http://acme.example');
    expect(contactHref(item('calendar', 'calendly.com/jane'))).toBe('https://calendly.com/jane');
    expect(contactHref(item('address', 'Calle Mayor 1, Madrid'))).toBe(
      'https://www.google.com/maps/search/?api=1&query=Calle%20Mayor%201%2C%20Madrid',
    );
    expect(contactHref(item('custom', 'Ask for Jane'))).toBe('');
  });

  it('prefers an explicit href', () => {
    expect(contactHref(item('phone', 'Reception', { href: 'tel:+100' }))).toBe('tel:+100');
    expect(contactHref(item('custom', 'Docs', { href: 'https://docs.example' }))).toBe(
      'https://docs.example',
    );
  });

  it('does not link values with no usable target', () => {
    expect(contactHref(item('phone', 'call me'))).toBe('');
    expect(contactHref(item('website', 'javascript:alert(1)'))).toBe('');
    expect(contactHref(item('email', ''))).toBe('');
  });

  it('resolves known variables and keeps unknown ones as tokens', () => {
    const vars = { phone: '+1 555 100 2000', site: 'https://acme.example' };
    expect(contactHref(item('phone', '{{phone}}'), vars)).toBe('tel:+15551002000');
    expect(contactHref(item('website', '{{site}}'), vars)).toBe('https://acme.example');
    expect(contactHref(item('phone', '{{unknown}}'), vars)).toBe('tel:{{unknown}}');
    expect(contactHref(item('email', '{{email}}'))).toBe('mailto:{{email}}');
  });
});

describe('contact compile — stacked', () => {
  it('puts each item in a row: fixed-width icon cell + text cell, both valign middle', () => {
    const { doc, errors } = compile(contact());
    const imgs = Array.from(doc.querySelectorAll('img'));
    expect(imgs).toHaveLength(3);
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual([
      `${BASE}/assets/icons/circle-brand/email.png`,
      `${BASE}/assets/icons/circle-brand/phone.png`,
      `${BASE}/assets/icons/circle-brand/website.png`,
    ]);
    for (const img of imgs) {
      expect(img.getAttribute('width')).toBe('16');
      expect(img.getAttribute('height')).toBe('16');
      expect(img.getAttribute('alt')).toBe('');
      const cell = img.closest('td')!;
      expect(cell.getAttribute('width')).toBe('24');
      expect(cell.getAttribute('valign')).toBe('middle');
      const text = cell.nextElementSibling!;
      expect(text.tagName).toBe('TD');
      expect(text.getAttribute('valign')).toBe('middle');
    }
    expect(Array.from(doc.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual([
      'mailto:jane@acme.example',
      'tel:+15551002000',
      'https://acme.example',
    ]);
    expect(errors).toEqual([]);
    // No Unicode glyphs that phones turn into emoji.
    expect(doc.body.textContent).not.toMatch(/[✉☎⌂]/);
  });

  it('spaces rows with row_gap', () => {
    const { doc } = compile(contact({ row_gap: 10 }));
    const rows = Array.from(doc.querySelectorAll('img')).map((i) => i.closest('tr')!);
    expect(rows[0]!.innerHTML).not.toContain('padding-top');
    expect(rows[1]!.querySelectorAll('td')[1]!.getAttribute('style')).toContain('padding-top:10px');
  });

  it('inherits the canvas font when font_family is unset, and uses the link colour', () => {
    const { doc } = compile(contact({ link_color: '#0d9488' }));
    const text = doc.querySelector('a')!.closest('td')!;
    expect(text.getAttribute('style')).toContain('font-family:Georgia, serif');
    expect(text.getAttribute('style')).toContain('color:#374151');
    expect(doc.querySelector('a')!.getAttribute('style')).toBe(
      'color:#0d9488;text-decoration:none',
    );
  });

  it('omits icons when show_icons is false', () => {
    const { doc } = compile(contact({ show_icons: false }));
    expect(doc.querySelectorAll('img')).toHaveLength(0);
    expect(doc.querySelectorAll('a')).toHaveLength(3);
  });

  it('prefixes short and custom labels', () => {
    const short = compile(contact({ label_mode: 'short' })).doc.body.textContent ?? '';
    expect(short).toContain('E:\u00a0jane@acme.example');
    expect(short).toContain('T:\u00a0+1 (555) 100-2000');
    expect(short).toContain('W:\u00a0acme.example');

    const custom = compile(
      contact({
        label_mode: 'custom',
        items: [{ id: 'p', type: 'phone', value: '+1 555', label: 'Office' }],
      }),
    ).doc.body.textContent;
    expect(custom).toContain('Office\u00a0+1 555');
  });

  it('escapes values, labels and hrefs', () => {
    const { fragment, doc } = compile(
      contact({
        label_mode: 'custom',
        items: [
          {
            id: 'x',
            type: 'custom',
            value: '<b>"Jane"</b> & co',
            label: '<i>x</i>',
            href: 'https://x.example/?a="1"&b=<2>',
          },
        ],
      }),
    );
    expect(fragment).not.toContain('<b>');
    expect(fragment).not.toContain('<i>');
    expect(doc.body.textContent).toContain('<b>"Jane"</b> & co');
    expect(doc.querySelector('a')!.getAttribute('href')).toBe('https://x.example/?a="1"&b=<2>');
  });

  it('resolves variables in links and leaves the text to the substitution pass', () => {
    const { doc } = compile(contact({ items: [{ id: 'p', type: 'phone', value: '{{phone}}' }] }), {
      phone: '+44 20 7946 0000',
    });
    const a = doc.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('tel:+442079460000');
    expect(a.textContent).toBe('+44 20 7946 0000');
  });

  it('aligns the block', () => {
    const { doc } = compile(
      contact({
        style: { font_size: 13, font_weight: 400, color: '#111111', text_align: 'center' },
      }),
    );
    const inner = doc.querySelector('img')!.closest('table')!;
    expect(inner.getAttribute('align')).toBe('center');
  });
});

describe('contact compile — inline', () => {
  it('without icons: one text cell, items joined by the separator', () => {
    const { doc } = compile(contact({ layout: 'inline', show_icons: false, separator: ' · ' }));
    const cells = doc.querySelectorAll('a')[0]!.closest('tr')!.querySelectorAll('td');
    expect(cells).toHaveLength(1);
    expect((cells[0]!.textContent ?? '').replace(/\u00a0/g, ' ')).toBe(
      'jane@acme.example · +1 (555) 100-2000 · acme.example',
    );
    expect(doc.querySelectorAll('span[style="white-space:nowrap"]')).toHaveLength(3);
  });

  it('with icons: a single row of icon / text / separator cells', () => {
    const { doc } = compile(contact({ layout: 'inline', separator: ' | ' }));
    const rows = new Set(Array.from(doc.querySelectorAll('img')).map((i) => i.closest('tr')));
    expect(rows.size).toBe(1);
    const cells = Array.from([...rows][0]!.children);
    // icon, text, sep, icon, text, sep, icon, text
    expect(cells).toHaveLength(8);
    expect(cells[2]!.textContent).toBe('|');
    for (const cell of cells) expect(cell.getAttribute('valign')).toBe('middle');
  });

  it('keeps leading separator spaces non-breaking and the trailing one breakable', () => {
    expect(separatorHtml(' | ')).toBe('&nbsp;| ');
    expect(separatorHtml(' / ')).toBe('&nbsp;/ ');
    expect(separatorHtml('•')).toBe('•');
    expect(separatorHtml(' <x> ')).toBe('&nbsp;&lt;x&gt; ');
  });
});

describe('contact v1 → v2 normaliser', () => {
  const v1: ContactRowBlock = {
    id: 'old',
    type: 'contact_row',
    rows: [
      { icon: 'email', label: 'jane@acme.example', href: 'mailto:jane@acme.example' },
      { icon: 'phone', label: 'Reception: +1 555 700 8000', href: 'tel:+15557008000' },
      { icon: 'web', label: 'acme.example', href: 'https://acme.example/en' },
    ],
    style: { font_family: 'Arial', font_size: 14, font_weight: 400, color: '#374151' },
    padding: { top: 2, right: 0, bottom: 2, left: 0 },
  };

  it('converts rows to typed items, keeping only hrefs that differ from the automatic one', () => {
    const n = normalizeContactRow(v1);
    expect(n.items).toEqual([
      { id: 'old-0', type: 'email', value: 'jane@acme.example' },
      { id: 'old-1', type: 'phone', value: 'Reception: +1 555 700 8000' },
      { id: 'old-2', type: 'website', value: 'acme.example', href: 'https://acme.example/en' },
    ]);
    expect(n.layout).toBe('stacked');
    expect(n.show_icons).toBe(true);
    expect(n.icon_shape).toBe('plain');
    expect(n.icon_tone).toBe('dark');
    expect(n.icon_size).toBe(16);
    expect(n.row_gap).toBe(4);
    expect(n.label_mode).toBe('none');
    expect(n.style.font_family).toBe('Arial');
  });

  it('compiles v1 rows with real icons and their links', () => {
    const { doc } = compile(v1);
    expect(Array.from(doc.querySelectorAll('img')).map((i) => i.getAttribute('src'))).toEqual([
      `${BASE}/assets/icons/plain-dark/email.png`,
      `${BASE}/assets/icons/plain-dark/phone.png`,
      `${BASE}/assets/icons/plain-dark/website.png`,
    ]);
    expect(Array.from(doc.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual([
      'mailto:jane@acme.example',
      'tel:+15557008000',
      'https://acme.example/en',
    ]);
    expect(doc.querySelector('a')!.closest('td')!.getAttribute('style')).toContain(
      'font-family:Arial',
    );
  });

  it('rewrites v1 as v2 on the first edit and drops rows', () => {
    const patch = toV2Patch(normalizeContactRow(v1));
    const stored = JSON.parse(JSON.stringify({ ...v1, ...patch })) as ContactRowBlock;
    expect(stored.rows).toBeUndefined();
    expect(stored.items).toHaveLength(3);
    expect(normalizeContactRow(stored)).toEqual(normalizeContactRow(v1));
  });

  it('tolerates junk', () => {
    const n = normalizeContactRow({
      id: 'j',
      type: 'contact_row',
      items: [{ id: '', type: 'fax' as never, value: 42 as never }],
      icon_size: 999,
      style: undefined as never,
    });
    expect(n.items).toEqual([{ id: 'j-0', type: 'custom', value: '' }]);
    expect(n.icon_size).toBe(32);
    expect(n.style.color).toBe('#374151');
  });
});
