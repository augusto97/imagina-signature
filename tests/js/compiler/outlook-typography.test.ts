import { afterEach, describe, expect, it } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import { applyOutlookFixes, normalizeLineHeights } from '@/core/compiler/outlook-fixes';
import { ensureImageAlts, localeDirection, localeToLang } from '@/core/compiler/accessibility';
import { collectImages } from '@/core/compiler/images';
import { minifyHtml } from '@/core/compiler/minify';
import { parseStyle } from '@/core/compiler/html-tokens';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block } from '@/core/schema/blocks';
import type { CompileIssue } from '@/core/compiler/issues';
import '@/core/blocks';

type ConfigWindow = { IMGSIG_EDITOR_CONFIG: { locale: string } };
const config = (globalThis as unknown as ConfigWindow).IMGSIG_EDITOR_CONFIG;
const originalLocale = config.locale;
afterEach(() => {
  config.locale = originalLocale;
});

function compile(blocks: Block[]) {
  const schema = createEmptySchema();
  schema.blocks = blocks;
  return compileSignature(schema);
}

/** Declarations of the first element matching `selector` in `html`. */
function declsOf(html: string, selector: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const style = doc.querySelector(selector)?.getAttribute('style') ?? '';
  return parseStyle(style).map((d) => `${d.prop}:${d.value}`);
}

describe('normalizeLineHeights', () => {
  it('puts mso-line-height-rule:exactly immediately before line-height', () => {
    const out = normalizeLineHeights(
      '<td style="font-size:13px;line-height:20px;color:#000">x</td>',
    );
    expect(declsOf(`<table><tr>${out}</tr></table>`, 'td')).toEqual([
      'font-size:13px',
      'mso-line-height-rule:exactly',
      'line-height:20px',
      'color:#000',
    ]);
  });

  it('moves an existing rule that came after line-height instead of duplicating it', () => {
    const out = normalizeLineHeights(
      '<p style="line-height:18px;mso-line-height-rule:exactly;font-size:12px">x</p>',
    );
    expect(out).toBe(
      '<p style="mso-line-height-rule:exactly;line-height:18px;font-size:12px">x</p>',
    );
    expect(out.match(/mso-line-height-rule/g)).toHaveLength(1);
  });

  it('converts unitless line-heights with the element’s own font size', () => {
    expect(normalizeLineHeights('<td style="font-size:13px;line-height:1.4">x</td>')).toBe(
      '<td style="font-size:13px;mso-line-height-rule:exactly;line-height:18.2px">x</td>',
    );
  });

  it('uses the inherited font size when the element has none, in px / pt / em', () => {
    expect(
      normalizeLineHeights('<div style="font-size:20px"><p style="line-height:1.5">x</p></div>'),
    ).toContain('<p style="mso-line-height-rule:exactly;line-height:30px">');
    expect(normalizeLineHeights('<td style="font-size:12pt;line-height:1.5">x</td>')).toContain(
      'line-height:24px',
    );
    expect(
      normalizeLineHeights(
        '<div style="font-size:10px"><span style="font-size:2em;line-height:1.2">x</span></div>',
      ),
    ).toContain('line-height:24px');
  });

  it('leaves the value alone when no font size is known, but still adds the rule', () => {
    expect(normalizeLineHeights('<td style="line-height:1.4">x</td>')).toBe(
      '<td style="mso-line-height-rule:exactly;line-height:1.4">x</td>',
    );
  });

  it('keeps px, %, normal and 0 values, and !important', () => {
    expect(normalizeLineHeights('<td style="font-size:10px;line-height:150%">x</td>')).toContain(
      'line-height:150%',
    );
    expect(normalizeLineHeights('<td style="font-size:0;line-height:0">x</td>')).toContain(
      'mso-line-height-rule:exactly;line-height:0',
    );
    expect(
      normalizeLineHeights('<td style="font-size:10px;line-height:2 !important">x</td>'),
    ).toContain('line-height:20px !important');
  });

  it('gives descendants with their own font size the px value the factor would produce', () => {
    const out = normalizeLineHeights(
      '<td style="font-size:13px;line-height:1.4">a <span style="font-size:20px">big</span> <b>b</b></td>',
    );
    expect(out).toContain(
      '<td style="font-size:13px;mso-line-height-rule:exactly;line-height:18.2px">',
    );
    expect(out).toContain(
      '<span style="font-size:20px;mso-line-height-rule:exactly;line-height:28px">big</span>',
    );
    expect(out).toContain('<b>b</b>');
  });

  it('does not touch markup inside Outlook conditional comments or elements without line-height', () => {
    const html =
      '<!--[if mso]><v:roundrect style="height:40px;line-height:1.2"></v:roundrect><![endif]--><td style="font-size:12px">x</td>';
    expect(normalizeLineHeights(html)).toBe(html);
  });

  it('keeps unrelated identical tags independent of each other', () => {
    const out = normalizeLineHeights(
      '<td style="font-size:10px;line-height:2"><span style="font-size:12px">a</span></td><span style="font-size:12px">b</span>',
    );
    expect(out).toContain(
      '<span style="font-size:12px;mso-line-height-rule:exactly;line-height:24px">a</span>',
    );
    expect(out).toContain('</td><span style="font-size:12px">b</span>');
  });

  it('applyOutlookFixes still injects the conditional mso reset before <body>', () => {
    const out = applyOutlookFixes(
      '<html><head></head><body><td style="line-height:20px">x</td></body></html>',
    );
    expect(out).toMatch(/<!--\[if mso\]>[\s\S]*<!\[endif\]--><body/);
  });
});

describe('compiled output typography', () => {
  it('text, heading and disclaimer blocks ship px line-heights preceded by the rule', () => {
    const { html } = compile([
      {
        id: 't',
        type: 'text',
        content: '<p>Hello</p>',
        style: {
          font_family: 'Arial',
          font_size: 14,
          font_weight: 400,
          color: '#111111',
          line_height: 1.5,
        },
      },
      {
        id: 'h',
        type: 'heading',
        content: 'Jane',
        style: { font_family: 'Arial', font_size: 20, font_weight: 700, color: '#111111' },
      },
    ]);
    expect(html).toContain('font-size:14px');
    expect(html).toContain('mso-line-height-rule:exactly;line-height:21px');
    expect(html).toContain('mso-line-height-rule:exactly;line-height:24px');
    // Every line-height in the document is preceded by the rule.
    const outside = html.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/g, '');
    for (const m of outside.matchAll(/([a-z-]+:[^;"]+;)?line-height:/g)) {
      expect(m[1]).toBe('mso-line-height-rule:exactly;');
    }
    // No unitless line-height survives where the font size is known.
    expect(outside).not.toMatch(/line-height:\d*\.?\d+(?=[;"])/);
  });

  it('survives minification byte-identically', () => {
    const { html } = compile([
      {
        id: 't',
        type: 'text',
        content: 'Hi',
        style: { font_family: 'Arial', font_size: 12, font_weight: 400, color: '#111111' },
      },
    ]);
    expect(minifyHtml(html)).toBe(html);
  });
});

describe('lang / dir', () => {
  it('maps WordPress locales to BCP 47', () => {
    expect(localeToLang('es_ES')).toBe('es-ES');
    expect(localeToLang('en_US')).toBe('en-US');
    expect(localeToLang('de_DE_formal')).toBe('de-DE');
    expect(localeToLang('pt_PT_ao90')).toBe('pt-PT');
    expect(localeToLang('es_419')).toBe('es-419');
    expect(localeToLang('zh_Hant')).toBe('zh-Hant');
    expect(localeToLang('fr')).toBe('fr');
    expect(localeToLang('')).toBe('');
    expect(localeToLang('"><script>')).toBe('');
  });

  it('knows the right-to-left languages', () => {
    expect(localeDirection('ar')).toBe('rtl');
    expect(localeDirection('he_IL')).toBe('rtl');
    expect(localeDirection('fa_IR')).toBe('rtl');
    expect(localeDirection('es_ES')).toBe('ltr');
    expect(localeDirection('')).toBe('ltr');
  });

  it('sets lang and dir on <html> and on the pasteable shell table', () => {
    config.locale = 'es_CO';
    const result = compile([]);
    const doc = new DOMParser().parseFromString(result.html, 'text/html');
    expect(doc.documentElement.getAttribute('lang')).toBe('es-CO');
    expect(doc.documentElement.getAttribute('dir')).toBe('ltr');
    expect(result.fragment).toMatch(/^<table[^>]* dir="ltr" lang="es-CO"/);
    expect(result.lang).toBe('es-CO');
    expect(result.dir).toBe('ltr');
  });

  it('uses dir="rtl" for RTL locales', () => {
    config.locale = 'he_IL';
    const result = compile([]);
    expect(result.html).toContain('dir="rtl" lang="he-IL"');
    expect(result.dir).toBe('rtl');
  });

  it('omits lang when the locale is unusable', () => {
    config.locale = 'not a locale!';
    const result = compile([]);
    expect(result.html).not.toContain(' lang=');
    expect(result.html).toContain(' dir="ltr"');
  });
});

describe('alt text enforcement', () => {
  const sink = (): { issues: CompileIssue[] } => ({ issues: [] });

  it('adds alt="" to images without alt and warns', () => {
    const s = sink();
    const out = ensureImageAlts('<img src="https://x.example/a.png" width="100">', s);
    expect(out).toBe('<img alt="" src="https://x.example/a.png" width="100">');
    expect(s.issues).toHaveLength(1);
    expect(s.issues[0]!.code).toBe('missing-alt');
  });

  it('allows an empty alt silently only for decorative spacer images', () => {
    const s = sink();
    ensureImageAlts('<img src="https://x.example/s.gif" width="1" height="1">', s);
    ensureImageAlts('<img src="https://x.example/s.gif" alt="" style="width:2px;height:2px">', s);
    ensureImageAlts('<img src="https://x.example/p.png" alt="" role="presentation">', s);
    expect(s.issues).toEqual([]);

    ensureImageAlts('<img src="https://x.example/logo.png" alt="" width="120" height="40">', s);
    expect(s.issues).toHaveLength(1);
  });

  it('attributes the warning to the block and never repeats a block-level one', () => {
    const s = sink();
    ensureImageAlts(
      '<!--imgsig-block:social_icons:soc--><a><img src="https://x.example/in.png" width="20" height="20"></a><!--/imgsig-block-->',
      s,
    );
    expect(s.issues[0]!.blockId).toBe('soc');

    const already: { issues: CompileIssue[] } = {
      issues: [
        { level: 'warning', message: 'x', blockId: 'img', blockType: 'image', code: 'missing-alt' },
      ],
    };
    ensureImageAlts(
      '<img data-imgsig-src="image:img" src="https://x.example/a.png" alt="">',
      already,
    );
    expect(already.issues).toHaveLength(1);
  });

  it('adds alt="" inside Outlook conditionals too, without warnings', () => {
    const s = sink();
    const out = ensureImageAlts(
      '<!--[if mso]><img src="https://x.example/a.png" width="10"><![endif]-->',
      s,
    );
    expect(out).toContain('<img alt="" src=');
    expect(s.issues).toEqual([]);
  });

  it('every <img> of a compiled signature has an alt attribute', () => {
    const result = compile([
      { id: 'img', type: 'image', src: 'https://cdn.example/logo.png', alt: '', width: 120 },
      { id: 'av', type: 'avatar', src: 'https://cdn.example/me.png', alt: 'Me', size: 64 },
    ]);
    const doc = new DOMParser().parseFromString(result.html, 'text/html');
    for (const img of Array.from(doc.querySelectorAll('img'))) {
      expect(img.hasAttribute('alt')).toBe(true);
    }
    // The empty-alt image block is reported once (block-level check), not twice.
    expect(
      result.issues.filter((i) => i.code === 'missing-alt' && i.blockId === 'img'),
    ).toHaveLength(1);
  });
});

describe('image inventory', () => {
  it('lists http(s) images with their block, skipping conditionals and unsafe sources', () => {
    const images = collectImages(
      '<!--imgsig-block:image:logo--><img src="https://cdn.example/a.png?x=1&amp;y=2" alt="A" width="80" height="20"><!--/imgsig-block-->' +
        '<!--[if mso]><img src="https://cdn.example/fallback.png"><![endif]-->' +
        '<img src="data:image/png;base64,AA" alt="">' +
        '<img data-imgsig-src="avatar:av" src="http://cdn.example/me.png" alt="Me">',
    );
    expect(images).toEqual([
      {
        src: 'https://cdn.example/a.png?x=1&y=2',
        alt: 'A',
        width: 80,
        height: 20,
        blockId: 'logo',
        blockType: 'image',
      },
      { src: 'http://cdn.example/me.png', alt: 'Me', blockId: 'av', blockType: 'avatar' },
    ]);
  });

  it('is exposed on the compile result without leaking markers', () => {
    const result = compile([
      { id: 'logo', type: 'image', src: 'https://cdn.example/logo.png', alt: 'Logo', width: 100 },
    ]);
    expect(result.images).toEqual([
      expect.objectContaining({
        src: 'https://cdn.example/logo.png',
        blockId: 'logo',
        blockType: 'image',
      }),
    ]);
    expect(result.html).not.toContain('imgsig-block');
    expect(result.width).toBe(600);
    expect(result.fluid).toBe(false);
  });
});
