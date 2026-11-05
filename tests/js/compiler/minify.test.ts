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

  it('keeps the space between adjacent inline elements', () => {
    expect(minifyHtml('<td><strong>Jane</strong> <em>Doe</em></td>')).toBe(
      '<td><strong>Jane</strong> <em>Doe</em></td>',
    );
    expect(minifyHtml('<td><strong>Jane</strong>\n  <em>Doe</em></td>')).toBe(
      '<td><strong>Jane</strong> <em>Doe</em></td>',
    );
  });

  it('does not join words split across lines', () => {
    expect(minifyHtml('<p>Senior\nEngineer</p>')).toBe('<p>Senior Engineer</p>');
    expect(minifyHtml('<td>Call me\n   <a href="tel:1">now</a></td>')).toBe(
      '<td>Call me <a href="tel:1">now</a></td>',
    );
  });

  it('keeps whitespace between text and an inline element', () => {
    expect(minifyHtml('<td>Phone: <span>123</span> ext.</td>')).toBe(
      '<td>Phone: <span>123</span> ext.</td>',
    );
  });

  it('removes whitespace between structural tags only', () => {
    expect(minifyHtml('<td>\n<table> <tr>\n<td><a href="x">a</a> <a href="y">b</a></td></tr></table></td>')).toBe(
      '<td><table><tr><td><a href="x">a</a> <a href="y">b</a></td></tr></table></td>',
    );
  });

  it('keeps a literal non-breaking space', () => {
    expect(minifyHtml('<td>a\u00a0b</td>')).toBe('<td>a\u00a0b</td>');
  });

  it('keeps a multi-line conditional byte-identical next to collapsed markup', () => {
    const cond = '<!--[if mso]>\n<v:roundrect   href="x">\n  <center>Go</center>\n</v:roundrect>\n<![endif]-->';
    const revealed = '<!--[if !mso]><!-- --><table><tr><td>Go</td></tr></table><!--<![endif]-->';
    const out = minifyHtml(`<td>\n  ${cond}\n  ${revealed}\n</td>`);
    expect(out).toBe(`<td>${cond} ${revealed}</td>`);
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
