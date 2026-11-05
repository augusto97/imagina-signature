import { describe, expect, it } from 'vitest';
import { sanitizeEmailHtml } from '@/core/compiler/sanitize';

/**
 * Rich-text typography allowlist (1.2): spans may carry colour, px
 * font size, letter spacing, text transform, font style / weight and
 * decoration — and nothing else. Paragraphs and the inline formatting
 * tags keep the narrower pre-1.2 set.
 */

function styleOf(html: string, selector = 'span'): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return doc.querySelector(selector)?.getAttribute('style') ?? '';
}

describe('sanitizeEmailHtml — span typography', () => {
  it('keeps every allowlisted span property with a valid value', () => {
    const out = sanitizeEmailHtml(
      '<span style="color: #2563EB; font-size: 18px; letter-spacing: 1.5px; text-transform: uppercase; font-style: italic; font-weight: 700; text-decoration: underline">Jane</span>',
    );
    expect(out).toBe(
      '<span style="color:#2563eb;font-size:18px;letter-spacing:1.5px;text-transform:uppercase;font-style:italic;font-weight:700;text-decoration:underline">Jane</span>',
    );
  });

  it('accepts negative / normal letter spacing and capitalize', () => {
    expect(styleOf(sanitizeEmailHtml('<span style="letter-spacing:-0.5px;text-transform:capitalize">x</span>'))).toBe(
      'letter-spacing:-0.5px;text-transform:capitalize',
    );
    expect(styleOf(sanitizeEmailHtml('<span style="letter-spacing:normal">x</span>'))).toBe(
      'letter-spacing:normal',
    );
  });

  it('rewrites the rgb() colours Tiptap reads back as hex', () => {
    expect(sanitizeEmailHtml('<span style="color: rgb(37, 99, 235)">x</span>')).toBe(
      '<span style="color:#2563eb">x</span>',
    );
    // Translucent colours can't be expressed as hex — kept as rgba().
    expect(styleOf(sanitizeEmailHtml('<span style="color: rgba(0, 0, 0, 0.5)">x</span>'))).toBe(
      'color:rgba(0,0,0,0.5)',
    );
  });

  it.each([
    ['font-size in em', 'font-size:2em'],
    ['font-size keyword', 'font-size:xx-large'],
    ['font-size out of range', 'font-size:400px'],
    ['font-size calc', 'font-size:calc(10px + 2vw)'],
    ['letter-spacing in em', 'letter-spacing:0.3em'],
    ['letter-spacing out of range', 'letter-spacing:80px'],
    ['text-transform bogus', 'text-transform:full-width'],
    ['font-style bogus', 'font-style:wild'],
    ['url smuggled in a size', 'font-size:url(javascript:alert(1))'],
  ])('drops an invalid value (%s)', (_name, declaration) => {
    expect(sanitizeEmailHtml(`<span style="color:#111111;${declaration}">x</span>`)).toBe(
      '<span style="color:#111111">x</span>',
    );
  });

  it.each([
    'position:fixed',
    'display:none',
    'background:#ff0000',
    'background-color:#ff0000',
    'font-family:Comic Sans MS',
    'line-height:40px',
    'margin:20px',
    'width:900px',
    'behavior:url(x.htc)',
  ])('still strips a property outside the allowlist (%s)', (declaration) => {
    expect(sanitizeEmailHtml(`<span style="${declaration};color:#111111">x</span>`)).toBe(
      '<span style="color:#111111">x</span>',
    );
  });

  it('keeps font size / tracking / case to spans only', () => {
    expect(
      sanitizeEmailHtml(
        '<p style="font-size:30px;letter-spacing:2px;text-transform:uppercase;color:#123456">A</p>',
      ),
    ).toBe('<p style="margin:0;color:#123456">A</p>');
    expect(sanitizeEmailHtml('<strong style="font-size:30px;font-style:italic">B</strong>')).toBe(
      '<strong style="font-style:italic">B</strong>',
    );
    // Links never keep their own style (the canvas link colour applies).
    expect(sanitizeEmailHtml('<a href="https://x.example" style="font-size:30px">C</a>')).toBe(
      '<a href="https://x.example">C</a>',
    );
  });

  it('drops the style attribute entirely when nothing survives', () => {
    expect(sanitizeEmailHtml('<span style="font-size:3em;position:absolute">x</span>')).toBe(
      '<span>x</span>',
    );
  });

  it('keeps nested spans and Tiptap-style markup intact', () => {
    const html =
      '<p>Jane <span style="color: #ec4899"><strong>Doe</strong></span> · <span style="font-size: 12px">CEO</span></p>';
    expect(sanitizeEmailHtml(html)).toBe(
      '<p style="margin:0">Jane <span style="color:#ec4899"><strong>Doe</strong></span> · <span style="font-size:12px">CEO</span></p>',
    );
  });
});
