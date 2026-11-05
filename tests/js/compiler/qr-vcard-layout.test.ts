import { describe, expect, it } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block, QrCodeBlock, VCardBlock } from '@/core/schema/blocks';
import { qrContentHash } from '@/core/blocks/qr-code/definition';
import { vcardContentHash } from '@/core/blocks/vcard/definition';
import '@/core/blocks';

/** QR / vCard: alignment + padding; vCard link as a button or a text link. */

function compile(blocks: Block[]) {
  const schema = createEmptySchema();
  schema.blocks = blocks;
  return compileSignature(schema);
}

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

const qr = (extra: Partial<QrCodeBlock> = {}): QrCodeBlock => {
  const block: QrCodeBlock = {
    id: 'qr',
    type: 'qr_code',
    data: 'https://acme.example',
    size: 120,
    color: '#000000',
    background_color: '#ffffff',
    caption: 'Scan me',
    image_url: 'https://cdn.example/qr.png',
    ...extra,
  };
  block.image_hash = qrContentHash(block);
  return block;
};

describe('QR alignment and padding', () => {
  it('aligns the QR + caption pair and keeps the caption centred under it', () => {
    const doc = parse(
      compile([qr({ align: 'center', padding: { top: 6, right: 0, bottom: 10, left: 0 } })]).html,
    );
    const img = doc.querySelector('img')!;
    const inner = img.closest('table')!;
    const row = inner.parentElement!;
    expect(row.getAttribute('align')).toBe('center');
    expect(row.getAttribute('style')).toBe('padding:6px 0px 10px 0px;text-align:center');
    expect(inner.getAttribute('align')).toBe('center');
    expect(inner.getAttribute('style')).toContain('margin:0 auto');
    expect(img.closest('td')!.getAttribute('style')).toBe('text-align:center');
    expect(img.closest('td')!.textContent).toContain('Scan me');
  });

  it('defaults to left (legacy look) and the hash ignores layout', () => {
    const doc = parse(compile([qr()]).html);
    expect(doc.querySelector('img')!.closest('table')!.parentElement!.getAttribute('align')).toBe(
      'left',
    );
    expect(
      qrContentHash(qr({ align: 'right', padding: { top: 9, right: 9, bottom: 9, left: 9 } })),
    ).toBe(qrContentHash(qr()));
  });
});

const vcard = (extra: Partial<VCardBlock> = {}): VCardBlock => {
  const block: VCardBlock = {
    id: 'vc',
    type: 'vcard',
    label: 'Save my contact',
    full_name: 'Jane Doe',
    organization: 'ACME',
    title: '',
    email: 'jane@acme.example',
    phone: '',
    website: '',
    background_color: '#2563eb',
    text_color: '#ffffff',
    border_radius: 6,
    vcf_url: 'https://cdn.example/jane-doe.vcf',
    ...extra,
  };
  block.vcf_hash = vcardContentHash(block);
  return block;
};

describe('vCard link styles', () => {
  it('renders a bullet-proof button by default (shared button helper)', () => {
    const { html, errors } = compile([vcard()]);
    expect(errors).toEqual([]);
    const vml = /<v:roundrect[^>]*>/.exec(html)![0];
    expect(vml).toContain('href="https://cdn.example/jane-doe.vcf"');
    expect(vml).toContain('fillcolor="#2563eb"');
    // Non-Outlook clients see the cell button (the !mso branch is live HTML).
    const cell = parse(html).querySelector('td[bgcolor="#2563eb"]')!;
    expect(cell).not.toBeNull();
    expect(cell.getAttribute('style')).toContain('padding:8px 14px');
    expect(cell.querySelector('a')!.getAttribute('style')).toContain('font-size:13px');
    expect(cell.querySelector('a')!.getAttribute('style')).toContain('font-weight:500');
  });

  it('renders a plain text link with link_style "text"', () => {
    const { html } = compile([vcard({ link_style: 'text', text_color: '#2563eb' })]);
    expect(html).not.toContain('v:roundrect');
    const a = parse(html).querySelector('a[href="https://cdn.example/jane-doe.vcf"]')!;
    expect(a.textContent).toBe('Save my contact');
    expect(a.getAttribute('style')).toContain('text-decoration:underline');
    expect(a.getAttribute('style')).toContain('color:#2563eb');
  });

  it('aligns and pads the link; the file hash ignores layout', () => {
    const { html } = compile([
      vcard({ align: 'right', padding: { top: 2, right: 4, bottom: 6, left: 8 } }),
    ]);
    const revealed = /<!--\[if !mso\]><!-- -->([\s\S]*?)<!--<!\[endif\]-->/.exec(html)![1]!;
    expect(parse(revealed).querySelector('table')!.getAttribute('align')).toBe('right');
    expect(html).toContain('<td align="right" style="padding:2px 4px 6px 8px;text-align:right">');
    expect(vcardContentHash(vcard({ align: 'right', link_style: 'text' }))).toBe(
      vcardContentHash(vcard()),
    );
  });
});
