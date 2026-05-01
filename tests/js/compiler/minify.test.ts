import { describe, expect, it } from 'vitest';
import { minifyHtml } from '@/core/compiler/minify';

describe('minifyHtml', () => {
  it('strips a plain HTML comment', () => {
    expect(minifyHtml('<p>hi <!-- secret --></p>')).toBe('<p>hi </p>');
  });

  it('preserves a downlevel-hidden Outlook conditional verbatim', () => {
    const input = '<table><!--[if mso]><v:roundrect href="x"/><![endif]--></table>';
    expect(minifyHtml(input)).toBe(input);
  });

  it('preserves a downlevel-revealed Outlook conditional verbatim', () => {
    // Used by the Button block + GIF fallback in 1.0.16+. If the
    // minifier strips the `<!--<![endif]-->` closer the `<a>` ends
    // up inside an unterminated comment.
    const input = '<td><!--[if !mso]><!--><a href="https://example.com">Book</a><!--<![endif]--></td>';
    expect(minifyHtml(input)).toBe(input);
  });

  it('keeps the <a> tag visible after minify in a real button compile output', () => {
    // Regression for 1.0.18: the previous minifier ate the
    // `<!--<![endif]-->` closer, leaving an unterminated `<!--[if`
    // that swallowed the rest of the document — the button block
    // disappeared from every preview that wasn't Outlook desktop.
    const buttonOutput =
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">' +
      '<tr><td style="padding:8px 0 8px 0">' +
      '<!--[if mso]>\n<v:roundrect href="https://example.com"></v:roundrect>\n<![endif]-->' +
      '<!--[if !mso]><!--><a href="https://example.com" style="display:inline-block;padding:12px 24px">Book a call</a><!--<![endif]-->' +
      '</td></tr></table>';

    const out = minifyHtml(buttonOutput);

    expect(out).toContain('<a href="https://example.com"');
    expect(out).toContain('Book a call');
    // Both conditional blocks survive intact (s flag — conditionals
    // may carry literal newlines that we want to preserve).
    expect(out).toMatch(/<!--\[if mso\]>.*<!\[endif\]-->/s);
    expect(out).toMatch(/<!--\[if !mso\]><!-->.*<a .*<!--<!\[endif\]-->/s);
  });

  it('collapses whitespace between tags', () => {
    const input = '<table>\n  <tr>\n    <td>x</td>\n  </tr>\n</table>';
    expect(minifyHtml(input)).toBe('<table><tr><td>x</td></tr></table>');
  });

  it('preserves whitespace inside text content', () => {
    expect(minifyHtml('<p>hello world</p>')).toBe('<p>hello world</p>');
  });

  it('handles two siblings with conditional comments without merging them', () => {
    const input =
      '<!--[if mso]><a>one</a><![endif]-->' +
      '<span>middle</span>' +
      '<!--[if mso]><a>two</a><![endif]-->';
    const out = minifyHtml(input);
    expect(out).toContain('<a>one</a>');
    expect(out).toContain('<a>two</a>');
    expect(out).toContain('<span>middle</span>');
  });
});
