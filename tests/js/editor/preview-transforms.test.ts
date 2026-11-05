import { describe, expect, it } from 'vitest';
import {
  FULL_INVERSION_CSS,
  OUTLOOK_DESKTOP_CSS,
  applyPartialDarkMode,
  buildPreviewDocument,
  clientView,
  mobileBehaviour,
  mobileScale,
  removeDataImages,
  revealMsoConditionals,
  stripBackgroundAttributes,
  stripHeadAndStyles,
  toAppleMailView,
  toGmailView,
  toOutlookDesktopView,
  vmlToHtml,
} from '@/editor/modals/preview/transforms';
import { compileSignature } from '@/core/compiler/compile';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block } from '@/core/schema/blocks';
import '@/core/blocks';

const DOC = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Email Signature</title><style>.x{color:red}</style><!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]--></head><body><table><tr><td><img src="https://cdn.example/a.png" alt="A" /><img src="data:image/png;base64,AA" alt="B" /><style>.y{}</style>Hi</td></tr></table></body></html>`;

function compile(blocks: Block[]) {
  const schema = createEmptySchema();
  schema.blocks = blocks;
  return compileSignature(schema);
}

const button: Block = {
  id: 'btn',
  type: 'button_cta',
  label: 'Book a call',
  href: 'https://cal.example',
  background_color: '#1d4ed8',
  text_color: '#ffffff',
  border_radius: 20,
};

describe('Gmail view', () => {
  it('removes <head>, every <style> and data: images, keeps hosted images', () => {
    const out = toGmailView(DOC);
    expect(out).not.toMatch(/<head|<style|<title|PixelsPerInch/i);
    expect(out).not.toContain('data:');
    expect(out).toContain('<img src="https://cdn.example/a.png" alt="A" />');
    expect(out).toContain('Hi');
  });

  it('helpers are independently usable', () => {
    expect(
      stripHeadAndStyles('<head><title>t</title></head><style>a{}</style><link rel="x">b'),
    ).toBe('b');
    expect(removeDataImages("<img src='data:x' alt=''><img src=\"https://a/b.png\">")).toBe(
      '<img src="https://a/b.png">',
    );
  });
});

describe('Outlook for Windows view', () => {
  it('reveals [if mso] content and drops [if !mso] content (both opener forms)', () => {
    const html =
      '<!--[if mso]><b>outlook</b><![endif]--><!--[if !mso]><!--><i>others</i><!--<![endif]-->' +
      '<!--[if !mso]><!-- --><u>others2</u><!--<![endif]--><!--[if gte mso 9]><s>gte</s><![endif]-->' +
      '<!--[if IE]><em>ie</em><![endif]-->';
    expect(revealMsoConditionals(html)).toBe('<b>outlook</b><s>gte</s>');
  });

  it('removes Office <xml> islands so their text never shows', () => {
    expect(revealMsoConditionals(DOC)).not.toMatch(/<xml|PixelsPerInch|>96</);
  });

  it('draws VML buttons at their VML size, colour and arc', () => {
    const out = vmlToHtml(
      '<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://cal.example" style="height:40px;v-text-anchor:middle;width:200px;" arcsize="50%" stroke="f" fillcolor="#1d4ed8"><w:anchorlock/><center style="color:#ffffff">Go</center></v:roundrect>',
    );
    expect(out).toMatch(
      /^<a href="https:\/\/cal\.example" data-imgsig-vml="roundrect" style="[^"]*">/,
    );
    expect(out).toContain('width:200px');
    expect(out).toContain('height:40px');
    expect(out).toContain('background-color:#1d4ed8');
    // arcsize 50% of half the shorter side (40 / 2) = 10px; kept despite the Word stylesheet.
    expect(out).toContain('border-radius:10px !important');
    expect(out).not.toContain('border:1px');
    expect(out).toContain('<center style="color:#ffffff">Go</center>');
    expect(out).not.toMatch(/anchorlock|<v:|<\/v:/);
  });

  it('applies the Word-like stylesheet', () => {
    expect(OUTLOOK_DESKTOP_CSS).toContain('border-radius:0 !important');
    expect(OUTLOOK_DESKTOP_CSS).toContain('max-width:none !important');
    expect(OUTLOOK_DESKTOP_CSS).toContain('background-image:none !important');
    expect(OUTLOOK_DESKTOP_CSS).toMatch(
      /div\[style\*="inline-block"\]\{display:block !important\}/,
    );
    const out = toOutlookDesktopView('<html><head></head><body>x</body></html>');
    expect(out).toContain(
      `<style data-imgsig-preview="outlook">${OUTLOOK_DESKTOP_CSS}</style></head>`,
    );
  });

  it('strips background image attributes', () => {
    expect(
      stripBackgroundAttributes('<td background="https://x/y.png" bgcolor="#fff">a</td>'),
    ).toBe('<td bgcolor="#fff">a</td>');
  });

  it('shows only the VML button for a compiled Button block', () => {
    const { html } = compile([button]);
    const out = toOutlookDesktopView(html);
    const doc = new DOMParser().parseFromString(out, 'text/html');
    const vml = doc.querySelectorAll('[data-imgsig-vml]');
    expect(vml).toHaveLength(1);
    expect(vml[0]!.textContent!.trim()).toBe('Book a call');
    // The HTML (non-Outlook) copy of the button is gone.
    expect(doc.body.textContent!.match(/Book a call/g)).toHaveLength(1);
  });

  it('Apple Mail is as-is; the Outlook app (mobile) does not use Word', () => {
    expect(toAppleMailView(DOC)).toBe(DOC);
    expect(clientView('outlook', DOC, true)).toBe(DOC);
    expect(clientView('outlook', DOC, false)).toContain('data-imgsig-preview="outlook"');
  });
});

describe('dark mode simulations', () => {
  it('partial: darkens light backgrounds and lightens dark text only', () => {
    const out = applyPartialDarkMode(
      '<table bgcolor="#ffffff" style="background-color:#ffffff;color:#111827"><tr>' +
        '<td style="background-color:#0f172a;color:#ffffff">dark box</td>' +
        '<td style="background:#f1f5f9 none">light</td><td><font color="#000000">f</font></td></tr></table>',
    );
    const doc = new DOMParser().parseFromString(out, 'text/html');
    const table = doc.querySelector('table')!;
    const [darkBox, light] = Array.from(doc.querySelectorAll('td'));
    expect(table.getAttribute('bgcolor')).not.toBe('#ffffff');
    const tableStyle = table.getAttribute('style')!;
    expect(tableStyle).not.toContain('#ffffff');
    expect(tableStyle).not.toContain('#111827');
    // Dark backgrounds and light text are untouched.
    expect(darkBox!.getAttribute('style')).toBe('background-color:#0f172a;color:#ffffff');
    expect(light!.getAttribute('style')).toMatch(/^background:#[0-9a-f]{6} none$/);
    expect(light!.getAttribute('style')).not.toContain('#f1f5f9');
    expect(doc.querySelector('font')!.getAttribute('color')).not.toBe('#000000');
  });

  it('partial: produces dark backgrounds and light text', () => {
    const out = applyPartialDarkMode('<td style="background-color:#ffffff;color:#000000">x</td>');
    const m = /background-color:(#[0-9a-f]{6});color:(#[0-9a-f]{6})/.exec(out)!;
    const lum = (hex: string) => Number.parseInt(hex.slice(1, 3), 16);
    expect(lum(m[1]!)).toBeLessThan(60);
    expect(lum(m[2]!)).toBeGreaterThan(180);
  });

  it('full inversion inverts the chrome and re-inverts images', () => {
    expect(FULL_INVERSION_CSS).toContain(
      '.imgsig-preview-chrome{filter:invert(1) hue-rotate(180deg)}',
    );
    expect(FULL_INVERSION_CSS).toMatch(
      /\.imgsig-preview-chrome img[^{]*\{filter:invert\(1\) hue-rotate\(180deg\)\}/,
    );
    const doc = buildPreviewDocument({
      html: DOC,
      client: 'apple',
      darkMode: 'full',
      viewportWidth: 720,
      contentWidth: 600,
      fluid: false,
      mobile: false,
    });
    expect(doc).toContain(FULL_INVERSION_CSS);
  });
});

describe('mobile behaviour', () => {
  it('scale-to-fit clients shrink fixed signatures wider than the screen', () => {
    expect(mobileBehaviour('gmail')).toBe('scale');
    expect(mobileBehaviour('apple')).toBe('scale');
    expect(mobileBehaviour('outlook')).toBe('overflow');
    expect(mobileScale(600, 344, 'scale', false)).toBeCloseTo(0.573, 3);
    expect(mobileScale(600, 344, 'overflow', false)).toBe(1);
    expect(mobileScale(600, 344, 'scale', true)).toBe(1);
    expect(mobileScale(320, 344, 'scale', false)).toBe(1);
  });

  it('a 600px signature in a 360px Gmail app viewport is zoomed to fit', () => {
    const doc = buildPreviewDocument({
      html: DOC,
      client: 'gmail',
      darkMode: 'off',
      viewportWidth: 360,
      contentWidth: 600,
      fluid: false,
      mobile: true,
    });
    expect(doc).toContain('<div class="imgsig-preview-mail" style="zoom:0.573">');
    expect(doc).toContain('overflow-x:hidden');
    expect(doc).not.toContain('data:image');
  });

  it('the Outlook app keeps it at full size and scrolls sideways', () => {
    const doc = buildPreviewDocument({
      html: DOC,
      client: 'outlook',
      darkMode: 'off',
      viewportWidth: 360,
      contentWidth: 600,
      fluid: false,
      mobile: true,
    });
    expect(doc).not.toContain('zoom:');
    expect(doc).toContain('overflow-x:auto');
  });

  it('builds a self-contained document with the client chrome', () => {
    const doc = buildPreviewDocument({
      html: DOC,
      client: 'gmail',
      darkMode: 'partial',
      viewportWidth: 720,
      contentWidth: 600,
      fluid: false,
      mobile: false,
    });
    const parsed = new DOMParser().parseFromString(doc, 'text/html');
    expect(parsed.querySelector('.imgsig-preview-chrome')!.getAttribute('style')).toContain(
      'background:#1f1f1f',
    );
    expect(parsed.querySelector('.imgsig-preview-mail table')).not.toBeNull();
    expect(parsed.title).toBe('');
  });
});
