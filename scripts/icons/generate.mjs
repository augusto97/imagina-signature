#!/usr/bin/env node
/**
 * `npm run icons:build` — renders the hosted PNG icon set used by the
 * Social icons and Contact blocks into `assets/icons/`.
 *
 * Email clients cannot show inline SVG or `data:` images (Gmail and
 * Outlook strip them), so every icon ships as a PNG on the customer's
 * own site: `<pluginUrl>/assets/icons/<shape>-<tone>/<name>.png`.
 * Icons are 96×96 px so they stay crisp at up to 48 px on 2× screens.
 *
 * Variants (3 shapes × 4 tones):
 *   shapes  circle  · rounded (rounded square) · plain (glyph only)
 *   tones   brand   — official brand colour (shapes: white glyph on it)
 *           dark    — #111827      gray — #6b7280
 *           light   — for dark backgrounds (shapes: white with a dark
 *                     glyph; plain: white glyph)
 *
 * Glyph sources (build-time only, never shipped as code):
 *   - simple-icons (CC0-1.0) for brand marks,
 *   - lucide-static (ISC) for generic contact glyphs,
 *   - the LinkedIn "in" mark is drawn here (simple-icons no longer
 *     carries it).
 *
 * The output (PNGs + manifest.json) is committed; rerun this script
 * after changing the icon list, then commit `assets/icons/`.
 */

import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = resolve(ROOT, 'assets/icons');
const SIMPLE_ICONS = resolve(ROOT, 'node_modules/simple-icons');
const LUCIDE = resolve(ROOT, 'node_modules/lucide-static/icons');

const SIZE = 96;
/** Breathing room around plain glyphs so anti-aliasing never clips. */
const PLAIN_PAD = 4;
const ROUNDED_RADIUS = 20;

export const SHAPES = ['circle', 'rounded', 'plain'];
export const TONES = ['brand', 'dark', 'gray', 'light'];
const TONE_COLOURS = { dark: '#111827', gray: '#6b7280', light: '#ffffff' };
const WHITE = '#ffffff';
/** Brand colour for the generic (non-brand) glyphs. */
const GENERIC = '#2563eb';

// ---------------------------------------------------------------------------
// Glyph loaders
// ---------------------------------------------------------------------------

const siData = JSON.parse(readFileSync(resolve(SIMPLE_ICONS, 'data/simple-icons.json'), 'utf8'));
const siList = Array.isArray(siData) ? siData : siData.icons;

/** simple-icons glyph: one filled path in a 24×24 box. */
function simpleIcon(slug) {
  const svg = readFileSync(resolve(SIMPLE_ICONS, 'icons', `${slug}.svg`), 'utf8');
  const d = /<path d="([^"]+)"/.exec(svg)?.[1];
  if (!d) throw new Error(`simple-icons/${slug}: no path`);
  const meta = siList.find((i) => i.slug === slug);
  return {
    viewBox: [0, 0, 24, 24],
    color: meta ? `#${meta.hex.toLowerCase()}` : undefined,
    body: (paint) => `<path d="${d}" fill="${paint}"/>`,
  };
}

/**
 * Lucide glyph: stroked outline drawn inside 2…22 of a 24 box. The
 * viewBox is cropped to 1…23 (content + half the stroke) so stroked
 * glyphs are optically as large as the filled brand marks.
 */
function lucide(name) {
  const svg = readFileSync(resolve(LUCIDE, `${name}.svg`), 'utf8');
  const inner = svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>[\s\S]*$/, '')
    .trim();
  return {
    viewBox: [1, 1, 22, 22],
    body: (paint) =>
      `<g fill="none" stroke="${paint}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`,
  };
}

/** The LinkedIn "in" letters — original artwork for this plugin. */
const LINKEDIN_IN =
  '<circle cx="4.6" cy="4.6" r="2.3"/>' +
  '<rect x="2.6" y="8.6" width="4" height="12.9"/>' +
  '<path d="M9.4 8.6H13.2V10.4C13.9 9.2 15.3 8.3 17.3 8.3C20.6 8.3 21.6 10.4 21.6 13.6V21.5H17.6V14.6C17.6 13 17.3 11.7 15.7 11.7C14 11.7 13.4 12.9 13.4 14.6V21.5H9.4Z"/>';
const LINKEDIN_BOX = [2.3, 2.3, 19.3, 19.2];

function linkedin() {
  return {
    viewBox: LINKEDIN_BOX,
    body: (paint) => `<g fill="${paint}">${LINKEDIN_IN}</g>`,
    // Glyph-only (plain) LinkedIn is the familiar rounded "bug":
    // a filled square with the letters knocked out.
    plain: {
      viewBox: [0, 0, 24, 24],
      body: (paint, id) => {
        const [x, y, w, h] = LINKEDIN_BOX;
        const s = 15 / Math.max(w, h);
        const tx = 12 - (x + w / 2) * s;
        const ty = 12.3 - (y + h / 2) * s;
        return (
          `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">` +
          `<rect width="24" height="24" rx="3" fill="#fff"/>` +
          `<g fill="#000" transform="translate(${r(tx)} ${r(ty)}) scale(${r(s)})">${LINKEDIN_IN}</g>` +
          `</mask><rect width="24" height="24" fill="${paint}" mask="url(#${id})"/>`
        );
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Icon list
// ---------------------------------------------------------------------------

const INSTAGRAM_GRADIENT = {
  type: 'radial',
  // Instagram's published gradient, as the familiar CSS
  // radial-gradient(circle at 30% 107%, …).
  attrs: 'cx="0.3" cy="1.07" r="1.5"',
  stops: [
    [0, '#fdf497'],
    [0.05, '#fdf497'],
    [0.45, '#fd5949'],
    [0.6, '#d6249f'],
    [0.9, '#285aeb'],
  ],
};

/**
 * `scale`: glyph box on a shape, as a fraction of the icon (default
 * 0.52) — tuned per mark so the row reads evenly.
 * `container: 'circle'`: the brand mark is itself a disc with the
 * symbol cut out — Facebook's "f", the GitHub cat…. On a coloured
 * shape we draw only the cut-out symbol at the mark's own scale, so
 * the circle variant IS the official logo instead of a disc in a disc.
 * `onBrand`: glyph colour on a brand-coloured shape (default white).
 * `outline`: stroke for a plain brand glyph too pale to see on white.
 */
const ICONS = [
  { name: 'linkedin', title: 'LinkedIn', glyph: linkedin(), color: '#0a66c2', scale: 0.46 },
  { name: 'x', title: 'X', glyph: simpleIcon('x'), scale: 0.44 },
  { name: 'facebook', title: 'Facebook', glyph: simpleIcon('facebook'), container: 'circle' },
  {
    name: 'instagram',
    title: 'Instagram',
    glyph: simpleIcon('instagram'),
    gradient: INSTAGRAM_GRADIENT,
  },
  { name: 'youtube', title: 'YouTube', glyph: simpleIcon('youtube'), scale: 0.56 },
  { name: 'tiktok', title: 'TikTok', glyph: simpleIcon('tiktok'), scale: 0.48 },
  { name: 'github', title: 'GitHub', glyph: simpleIcon('github'), container: 'circle' },
  { name: 'whatsapp', title: 'WhatsApp', glyph: simpleIcon('whatsapp') },
  { name: 'telegram', title: 'Telegram', glyph: simpleIcon('telegram'), container: 'circle' },
  { name: 'threads', title: 'Threads', glyph: simpleIcon('threads'), scale: 0.48 },
  { name: 'bluesky', title: 'Bluesky', glyph: simpleIcon('bluesky') },
  { name: 'mastodon', title: 'Mastodon', glyph: simpleIcon('mastodon'), scale: 0.5 },
  { name: 'pinterest', title: 'Pinterest', glyph: simpleIcon('pinterest'), container: 'circle' },
  { name: 'behance', title: 'Behance', glyph: simpleIcon('behance'), scale: 0.56 },
  { name: 'dribbble', title: 'Dribbble', glyph: simpleIcon('dribbble'), scale: 0.56 },
  // Medium's mark is a tile with "Me" cut out and the "e" breaking the
  // edge, so on a shape it is drawn whole (a tile inside the shape).
  { name: 'medium', title: 'Medium', glyph: simpleIcon('medium'), scale: 0.5 },
  { name: 'discord', title: 'Discord', glyph: simpleIcon('discord'), scale: 0.56 },
  {
    name: 'spotify',
    title: 'Spotify',
    glyph: simpleIcon('spotify'),
    container: 'circle',
    onBrand: '#000000',
  },
  { name: 'vimeo', title: 'Vimeo', glyph: simpleIcon('vimeo'), scale: 0.5 },
  { name: 'twitch', title: 'Twitch', glyph: simpleIcon('twitch'), scale: 0.48 },
  { name: 'reddit', title: 'Reddit', glyph: simpleIcon('reddit'), container: 'circle' },
  {
    name: 'snapchat',
    title: 'Snapchat',
    glyph: simpleIcon('snapchat'),
    onBrand: '#000000',
    outline: '#000000',
  },
  { name: 'calendly', title: 'Calendly', glyph: simpleIcon('calendly') },
  { name: 'website', title: 'Website', glyph: lucide('globe'), color: GENERIC },
  { name: 'email', title: 'Email', glyph: lucide('mail'), color: GENERIC },
  // Contact-only glyphs.
  { name: 'phone', title: 'Phone', glyph: lucide('phone'), color: GENERIC },
  { name: 'mobile', title: 'Mobile', glyph: lucide('smartphone'), color: GENERIC },
  { name: 'address', title: 'Address', glyph: lucide('map-pin'), color: GENERIC },
  { name: 'calendar', title: 'Calendar', glyph: lucide('calendar'), color: GENERIC },
  { name: 'link', title: 'Link', glyph: lucide('link'), color: GENERIC },
];

/** Order of the Social icons network picker. */
const SOCIAL = [
  'linkedin',
  'x',
  'facebook',
  'instagram',
  'youtube',
  'tiktok',
  'github',
  'whatsapp',
  'telegram',
  'threads',
  'bluesky',
  'mastodon',
  'pinterest',
  'behance',
  'dribbble',
  'medium',
  'discord',
  'spotify',
  'vimeo',
  'twitch',
  'reddit',
  'snapchat',
  'calendly',
  'website',
  'email',
];

/** Icons the Contact block can show (keyed by the row type it serves). */
const CONTACT = [
  'email',
  'phone',
  'mobile',
  'website',
  'address',
  'whatsapp',
  'calendar',
  'linkedin',
  'link',
];

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

function r(n) {
  return Math.round(n * 1000) / 1000;
}

/** `transform` that fits `viewBox` centred into the square `[x, y, size]`. */
function fit([vx, vy, vw, vh], x, y, size) {
  const s = size / Math.max(vw, vh);
  const dx = x + (size - vw * s) / 2 - vx * s;
  const dy = y + (size - vh * s) / 2 - vy * s;
  return `translate(${r(dx)} ${r(dy)}) scale(${r(s)})`;
}

function gradientDef(id, g) {
  const stops = g.stops
    .map(([offset, colour]) => `<stop offset="${offset}" stop-color="${colour}"/>`)
    .join('');
  return `<radialGradient id="${id}" ${g.attrs}>${stops}</radialGradient>`;
}

function shapeElement(shape, paint) {
  if (shape === 'circle') return `<circle cx="48" cy="48" r="48" fill="${paint}"/>`;
  return `<rect width="${SIZE}" height="${SIZE}" rx="${ROUNDED_RADIUS}" fill="${paint}"/>`;
}

/**
 * Only the symbol a container mark cuts out of its disc: a disc
 * (slightly inset so the mark's own rim fully covers it) masked by the
 * mark itself.
 */
function containerInner(icon, paint, id) {
  return (
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">` +
    `<circle cx="12" cy="12" r="11.6" fill="#fff"/>${icon.glyph.body('#000')}</mask>` +
    `<rect width="24" height="24" fill="${paint}" mask="url(#${id})"/>`
  );
}

function compose(icon, shape, tone) {
  const defs = [];
  const parts = [];
  const brand = icon.color;
  let fill;
  if (tone === 'brand') {
    if (icon.gradient) {
      defs.push(gradientDef('g', icon.gradient));
      fill = 'url(#g)';
    } else {
      fill = brand;
    }
  }

  if (shape === 'plain') {
    const glyph = icon.glyph.plain ?? icon.glyph;
    const paint = tone === 'brand' ? fill : TONE_COLOURS[tone];
    let body = glyph.body(paint, 'k');
    if (tone === 'brand' && icon.outline) {
      body = `<g stroke="${icon.outline}" stroke-width="0.9" stroke-linejoin="round">${body}</g>`;
    }
    parts.push(
      `<g transform="${fit(glyph.viewBox, PLAIN_PAD, PLAIN_PAD, SIZE - 2 * PLAIN_PAD)}">${body}</g>`,
    );
  } else {
    const bg = tone === 'brand' ? fill : tone === 'light' ? WHITE : TONE_COLOURS[tone];
    const fg =
      tone === 'brand' ? (icon.onBrand ?? WHITE) : tone === 'light' ? TONE_COLOURS.dark : WHITE;
    parts.push(shapeElement(shape, bg));
    if (icon.container) {
      parts.push(
        `<g transform="${fit(icon.glyph.viewBox, 0, 0, SIZE)}">${containerInner(icon, fg, 'k')}</g>`,
      );
    } else {
      const box = SIZE * (icon.scale ?? 0.52);
      const offset = (SIZE - box) / 2;
      parts.push(
        `<g transform="${fit(icon.glyph.viewBox, offset, offset, box)}">${icon.glyph.body(fg, 'k')}</g>`,
      );
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
    parts.join('') +
    '</svg>'
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  for (const icon of ICONS) {
    icon.color = (icon.color ?? icon.glyph.color ?? GENERIC).toLowerCase();
  }
  const byName = new Map(ICONS.map((i) => [i.name, i]));
  for (const name of [...SOCIAL, ...CONTACT]) {
    if (!byName.has(name)) throw new Error(`Unknown icon in a picker list: ${name}`);
  }

  for (const shape of SHAPES) {
    for (const tone of TONES)
      rmSync(resolve(OUT_DIR, `${shape}-${tone}`), { recursive: true, force: true });
  }

  const variants = SHAPES.flatMap((shape) => TONES.map((tone) => `${shape}-${tone}`));
  const stats = { files: 0, bytes: 0, max: 0, maxFile: '', modes: {} };
  const manifestIcons = {};

  for (const icon of ICONS) {
    for (const shape of SHAPES) {
      for (const tone of TONES) {
        const svg = compose(icon, shape, tone);
        const rendered = new Resvg(svg, { fitTo: { mode: 'original' } }).render();
        const { png, mode } = encodePng(rendered.pixels, rendered.width, rendered.height);
        const dir = resolve(OUT_DIR, `${shape}-${tone}`);
        mkdirSync(dir, { recursive: true });
        const file = resolve(dir, `${icon.name}.png`);
        writeFileSync(file, png);
        stats.files++;
        stats.bytes += png.length;
        stats.modes[mode] = (stats.modes[mode] ?? 0) + 1;
        if (png.length > stats.max) {
          stats.max = png.length;
          stats.maxFile = relative(ROOT, file);
        }
      }
    }
    manifestIcons[icon.name] = {
      title: icon.title,
      color: icon.color,
      variants,
    };
  }

  const manifest = {
    $comment: 'Generated by scripts/icons/generate.mjs — do not edit by hand.',
    version: 1,
    size: SIZE,
    path: 'assets/icons/{shape}-{tone}/{name}.png',
    shapes: SHAPES,
    tones: TONES,
    toneColors: TONE_COLOURS,
    social: SOCIAL,
    contact: CONTACT,
    icons: manifestIcons,
  };
  writeFileSync(resolve(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  console.log(
    `Wrote ${stats.files} icons (${ICONS.length} glyphs × ${variants.length} variants), ` +
      `${kb(stats.bytes)} total, avg ${kb(stats.bytes / stats.files)}, ` +
      `largest ${kb(stats.max)} (${stats.maxFile}).`,
  );
  console.log('Encodings:', stats.modes);
}

main();
