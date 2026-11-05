import { describe, expect, it } from 'vitest';
import { compileSignature, extractBodyFragment } from '@/core/compiler/compile';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block } from '@/core/schema/blocks';
import { htmlToPlainText as clipboardPlainText } from '@/utils/clipboard';
import '@/core/blocks';

const style = { font_family: 'Arial, sans-serif', font_size: 14, font_weight: 400 as const, color: '#111827' };

function sample(): Block[] {
  return [
    { id: 'name', type: 'heading', content: 'Jane {{last}}', style },
    {
      id: 'role',
      type: 'text',
      content: '<p><strong>Director</strong> · ACME</p><p>Visit <a href="https://acme.example/jobs">our jobs page</a></p>',
      style,
    },
    {
      id: 'contact',
      type: 'contact_row',
      rows: [
        { icon: 'email', label: 'jane@acme.example', href: 'mailto:jane@acme.example' },
        { icon: 'phone', label: '+1 555 100 2000', href: 'tel:+15551002000' },
        { icon: 'web', label: 'acme.example', href: 'https://acme.example' },
        { icon: 'phone', label: 'Reception: +1 555 700 8000', href: 'tel:+15557008000' },
      ],
      style,
    },
    {
      id: 'social',
      type: 'social_icons',
      networks: [
        { platform: 'linkedin', url: 'https://linkedin.com/in/jane' },
        { platform: 'github', url: 'https://github.com/jane' },
      ],
      icon_size: 24,
      gap: 8,
      color: '#1d4ed8',
    },
    {
      id: 'cta',
      type: 'button_cta',
      label: 'Book a call',
      href: 'https://cal.example/jane',
      background_color: '#000000',
      text_color: '#ffffff',
      border_radius: 4,
    },
    { id: 'div', type: 'divider', border: { width: 1, color: '#e5e7eb', style: 'solid' }, width_percent: 100 },
    { id: 'legal', type: 'disclaimer', content: 'Confidential.\nDo not forward.', style },
  ];
}

function compile(blocks: Block[]) {
  const schema = createEmptySchema();
  schema.blocks = blocks;
  schema.variables = { last: 'Doe' };
  return compileSignature(schema);
}

describe('signature fragment', () => {
  it('is only the shell table — no doctype, head, title or mso settings', () => {
    const { fragment, html } = compile(sample());
    expect(fragment.startsWith('<table')).toBe(true);
    expect(fragment.endsWith('</table>')).toBe(true);
    expect(fragment).not.toMatch(/<!DOCTYPE|<html|<head|<title|<body|PixelsPerInch|OfficeDocumentSettings/i);
    // It is the exact body content of the full document.
    expect(html).toContain(fragment);
  });

  it('keeps the canvas background and the Outlook button conditionals', () => {
    const { fragment } = compile(sample());
    expect(fragment).toMatch(/^<table[^>]*bgcolor="#ffffff"/);
    expect(fragment).toContain('<!--[if mso]>');
    expect(fragment).toContain('<!--<![endif]-->');
  });

  it('extractBodyFragment handles a body with attributes', () => {
    expect(extractBodyFragment('<html><body style="a:b"> <table></table> </body></html>')).toBe('<table></table>');
  });
});

describe('plain text', () => {
  it('is generated from the schema without HTML noise or icon letters', () => {
    const { text } = compile(sample());
    expect(text).toBe(
      [
        'Jane Doe',
        'Director · ACME',
        'Visit our jobs page (https://acme.example/jobs)',
        'Email: jane@acme.example',
        'Phone: +1 555 100 2000',
        'Web: https://acme.example',
        'Reception: +1 555 700 8000',
        'LinkedIn: https://linkedin.com/in/jane',
        'GitHub: https://github.com/jane',
        'Book a call: https://cal.example/jane',
        '',
        'Confidential.',
        'Do not forward.',
      ].join('\n'),
    );
    expect(text).not.toMatch(/96|Email Signature|<|>|✉|☎/);
  });

  it('walks both container cells and skips hidden blocks', () => {
    const { text } = compile([
      {
        id: 'row',
        type: 'container',
        columns: 2,
        gap: 0,
        children: [{ id: 'a', type: 'heading', content: 'Left', style }],
        right_children: [
          { id: 'b', type: 'heading', content: 'Right', style },
          { id: 'c', type: 'heading', content: 'Hidden', style, visible: false },
        ],
      },
    ]);
    expect(text).toBe('Left\nRight');
  });

  it('includes linked images / banners as "alt: url"', () => {
    const { text } = compile([
      { id: 'b', type: 'banner', src: 'https://cdn.example/b.png', alt: 'Spring sale', link: 'https://shop.example/sale', width: 600 },
      { id: 'i', type: 'image', src: 'https://cdn.example/logo.png', alt: 'Logo', width: 80 },
    ]);
    expect(text).toBe('Spring sale: https://shop.example/sale');
  });
});

describe('clipboard fallback plain text', () => {
  it('drops the document head and conditional comments', () => {
    const { html } = compile(sample());
    const text = clipboardPlainText(html);
    expect(text.startsWith('Jane Doe')).toBe(true);
    expect(text).not.toContain('96');
    expect(text).not.toContain('Email Signature');
  });
});
