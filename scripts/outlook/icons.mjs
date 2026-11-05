#!/usr/bin/env node
/**
 * Renders the Outlook add-in icons into `assets/outlook/icon-{size}.png`
 * (16, 32, 80 for the ribbon button; 64 / 128 for the manifest's
 * IconUrl / HighResolutionIconUrl — see src/Deployment/OutlookManifest.php).
 *
 *   node scripts/outlook/icons.mjs
 *
 * Build-time only (uses the @resvg/resvg-js devDependency). The PNGs are
 * committed: assets/outlook/ ships in the plugin ZIP as-is.
 */

import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../icons/png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = resolve(ROOT, 'assets/outlook');
const SIZES = [16, 32, 64, 80, 128];
const BRAND = '#2563eb';

/**
 * Envelope with a signature stroke on a rounded brand square. Drawn on a
 * 128 grid; the small sizes get thicker strokes so they stay legible.
 */
function svg(size) {
  const stroke = size <= 16 ? 12 : size <= 32 ? 10 : 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <rect x="2" y="2" width="124" height="124" rx="28" fill="${BRAND}"/>
  <rect x="22" y="32" width="84" height="58" rx="9" fill="none" stroke="#ffffff" stroke-width="${stroke}" stroke-linejoin="round"/>
  <path d="M27 39 L64 66 L101 39" fill="none" stroke="#ffffff" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
  ${size >= 64 ? `<path d="M30 106 C40 96 46 112 56 102 S72 98 80 104 S94 104 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>` : ''}
</svg>`;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const rendered = new Resvg(svg(size), { fitTo: { mode: 'original' } }).render();
  const { png, mode } = encodePng(rendered.pixels, rendered.width, rendered.height);
  const file = resolve(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, png);
  console.warn(`${relative(ROOT, file)}  ${size}x${size}  ${png.length} B  (${mode})`);
}
