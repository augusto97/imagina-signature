#!/usr/bin/env node
/**
 * `node scripts/templates/generate-assets.mjs` — renders the neutral
 * placeholder images the shipped templates (and the template picker
 * previews) use into `assets/templates/`.
 *
 * Templates never hard-code a host: they reference these files as
 * `{{imgsig_assets_url}}/templates/<file>.png`, a system variable the
 * editor bootstrap resolves to `plugins_url( 'assets', IMGSIG_FILE )`
 * (see `src/Settings/SystemVariables.php`), so a template shows the
 * same placeholders on every site.
 *
 * Output (all 2× their display size, PNG, no external services, no
 * photos of real people):
 *   avatar-1…6.png   240×240  soft gradient + generic silhouette
 *                              (1–4 round, 5–6 rounded square; the
 *                              corners are transparent so the shape
 *                              survives in Outlook, which ignores CSS
 *                              border-radius)
 *   logo-1…4.png     transparent logo marks with "ACME"-style wordmarks
 *                    (logo-2 is a square emblem for narrow columns)
 *   banner-webinar.png, banner-collection.png, banner-hiring.png
 *                    1200×300 promotional banners (Spanish copy)
 *   qr-sample.png    192×192 sample QR code, used only by the template
 *                    picker / onboarding previews before the editor has
 *                    uploaded the real one
 *
 * Text is rendered with Inter when the machine has it installed (it is
 * looked up in the usual font folders), otherwise with the system's
 * default sans-serif. The PNGs are committed, so this only matters when
 * the art is regenerated. PNGs go through the icon set's palette
 * encoder (`scripts/icons/png.mjs`), which keeps the smaller of an
 * indexed and a truecolour encoding.
 */

import { Resvg } from '@resvg/resvg-js';
import qrcode from 'qrcode-generator';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { encodePng } from '../icons/png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = resolve(ROOT, 'assets/templates');

const FONT_DIRS = [
  '/usr/share/fonts/opentype/inter',
  '/usr/share/fonts/truetype/inter',
  '/usr/local/share/fonts',
  `${process.env.HOME ?? ''}/.local/share/fonts`,
  `${process.env.HOME ?? ''}/Library/Fonts`,
  '/Library/Fonts',
];
const INTER_FILES = ['Inter-Regular.otf', 'Inter-Medium.otf', 'Inter-SemiBold.otf', 'Inter-Bold.otf', 'Inter-ExtraBold.otf'];

function interFontFiles() {
  for (const dir of FONT_DIRS) {
    const files = INTER_FILES.map((f) => resolve(dir, f)).filter((f) => existsSync(f));
    if (files.length === INTER_FILES.length) return files;
  }
  return [];
}

const FONT_FILES = interFontFiles();
const SANS = "Inter, 'Helvetica Neue', Arial, sans-serif";

/**
 * Renders `svg` and encodes it.
 *
 * `flat` art (logos, the QR) goes through the icon set's palette
 * encoder. Gradient art (avatars, banners) is encoded losslessly as
 * truecolour: a 256-colour palette posterises smooth gradients into
 * visible blotches.
 */
function render(svg, kind) {
  const rendered = new Resvg(svg, {
    fitTo: { mode: 'original' },
    font: {
      fontFiles: FONT_FILES,
      loadSystemFonts: FONT_FILES.length === 0,
      defaultFontFamily: FONT_FILES.length > 0 ? 'Inter' : 'sans-serif',
    },
  }).render();
  if (kind === 'flat') return encodePng(rendered.pixels, rendered.width, rendered.height);
  return encodeTruecolour(rendered.pixels, rendered.width, rendered.height);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
  return Buffer.concat([head, data, crc]);
}

/**
 * Lossless truecolour PNG (RGB when every pixel is opaque, else RGBA)
 * with a per-row adaptive filter (minimum sum of absolute differences).
 */
function encodeTruecolour(premultiplied, width, height) {
  const opaque = premultiplied.every((v, i) => i % 4 !== 3 || v === 255);
  const bpp = opaque ? 3 : 4;
  const stride = width * bpp;
  const raw = Buffer.alloc(width * height * bpp);
  for (let p = 0, o = 0; p < premultiplied.length; p += 4) {
    const a = premultiplied[p + 3];
    for (let c = 0; c < 3; c++) {
      const v = premultiplied[p + c];
      raw[o++] = a === 0 ? 0 : a === 255 ? v : Math.min(255, Math.round((v * 255) / a));
    }
    if (!opaque) raw[o++] = a;
  }

  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = raw.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? raw.subarray((y - 1) * stride, y * stride) : null;
    let best = null;
    let bestCost = Infinity;
    for (let type = 0; type <= 4; type++) {
      const out = Buffer.alloc(stride + 1);
      out[0] = type;
      let cost = 0;
      for (let i = 0; i < stride; i++) {
        const left = i >= bpp ? row[i - bpp] : 0;
        const up = prev ? prev[i] : 0;
        const upLeft = prev && i >= bpp ? prev[i - bpp] : 0;
        let pred = 0;
        if (type === 1) pred = left;
        else if (type === 2) pred = up;
        else if (type === 3) pred = (left + up) >> 1;
        else if (type === 4) {
          const est = left + up - upLeft;
          const pa = Math.abs(est - left);
          const pb = Math.abs(est - up);
          const pc = Math.abs(est - upLeft);
          pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        }
        const v = (row[i] - pred) & 0xff;
        out[i + 1] = v;
        cost += v < 128 ? v : 256 - v;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = out;
      }
    }
    rows.push(best);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  const idat = deflateSync(Buffer.concat(rows), { level: 9, memLevel: 9 });
  return {
    png: Buffer.concat([
      PNG_SIGNATURE,
      pngChunk('IHDR', ihdr),
      pngChunk('IDAT', idat),
      pngChunk('IEND', Buffer.alloc(0)),
    ]),
    mode: opaque ? 'rgb' : 'rgba',
  };
}

function svgDoc(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

// ---------------------------------------------------------------------------
// Avatars — 240×240, generic silhouette on a soft gradient
// ---------------------------------------------------------------------------

const AVATARS = [
  { file: 'avatar-1', shape: 'circle', from: '#e0e7ff', to: '#a5b4fc', figure: '#ffffff', shade: '#6366f1' },
  { file: 'avatar-2', shape: 'circle', from: '#ccfbf1', to: '#5eead4', figure: '#ffffff', shade: '#0d9488' },
  { file: 'avatar-3', shape: 'circle', from: '#ffedd5', to: '#fdba74', figure: '#ffffff', shade: '#ea580c' },
  { file: 'avatar-4', shape: 'circle', from: '#f1f5f9', to: '#cbd5e1', figure: '#ffffff', shade: '#475569' },
  { file: 'avatar-5', shape: 'rounded', from: '#e9d5ff', to: '#8b5cf6', figure: '#ffffff', shade: '#5b21b6' },
  { file: 'avatar-6', shape: 'rounded', from: '#1e3a8a', to: '#3b82f6', figure: '#dbeafe', shade: '#1e40af' },
];

function avatarSvg({ shape, from, to, figure, shade }) {
  const S = 240;
  const clip =
    shape === 'circle'
      ? `<circle cx="120" cy="120" r="120"/>`
      : `<rect x="0" y="0" width="${S}" height="${S}" rx="44" ry="44"/>`;
  return svgDoc(
    S,
    S,
    `<defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${from}"/>
        <stop offset="1" stop-color="${to}"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.3" cy="0.22" r="0.75">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
      <clipPath id="shape">${clip}</clipPath>
    </defs>
    <g clip-path="url(#shape)">
      <rect width="${S}" height="${S}" fill="url(#bg)"/>
      <rect width="${S}" height="${S}" fill="url(#glow)"/>
      <ellipse cx="120" cy="252" rx="98" ry="78" fill="${shade}" fill-opacity="0.18"/>
      <circle cx="120" cy="100" r="42" fill="${figure}" fill-opacity="0.92"/>
      <path d="M38 252 C38 186 76 154 120 154 C164 154 202 186 202 252 Z" fill="${figure}" fill-opacity="0.92"/>
    </g>`,
  );
}

// ---------------------------------------------------------------------------
// Logos — transparent, 2×
// ---------------------------------------------------------------------------

/** "ACME"-style horizontal logo: geometric mark + wordmark. */
function logoAcme() {
  // 2× of 128×44.
  return svgDoc(
    256,
    88,
    `<rect x="4" y="8" width="72" height="72" rx="20" fill="#4338ca"/>
    <path d="M22 62 L40 24 L58 62 Z" fill="none" stroke="#ffffff" stroke-width="7" stroke-linejoin="round"/>
    <circle cx="40" cy="50" r="5" fill="#ffffff"/>
    <text x="96" y="60" font-family="${SANS}" font-size="40" font-weight="800" letter-spacing="4" fill="#111827">ACME</text>`,
  );
}

/** Square emblem for narrow columns: teal tile with an abstract "N". */
function logoEmblem() {
  // 2× of 64×64.
  return svgDoc(
    128,
    128,
    `<rect x="0" y="0" width="128" height="128" rx="28" fill="#0f766e"/>
    <path d="M36 92 L36 36 L92 92 L92 36" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="92" cy="36" r="9" fill="#5eead4"/>`,
  );
}

/** Warm "Lumen" wordmark with a sun mark. */
function logoLumen() {
  // 2× of 176×44.
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const x1 = 44 + Math.cos(a) * 28;
    const y1 = 44 + Math.sin(a) * 28;
    const x2 = 44 + Math.cos(a) * 38;
    const y2 = 44 + Math.sin(a) * 38;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#f59e0b" stroke-width="6" stroke-linecap="round"/>`;
  }).join('');
  return svgDoc(
    352,
    88,
    `<circle cx="44" cy="44" r="18" fill="#f59e0b"/>${rays}
    <text x="100" y="59" font-family="${SANS}" font-size="40" font-weight="700" letter-spacing="0.5" fill="#1f2937">Lumen</text>
    <text x="236" y="59" font-family="${SANS}" font-size="40" font-weight="400" fill="#b45309">studio</text>`,
  );
}

/** Ring mark + "ORBITA" spaced wordmark. */
function logoOrbita() {
  // 2× of 176×44.
  return svgDoc(
    352,
    88,
    `<circle cx="44" cy="44" r="28" fill="none" stroke="#e11d48" stroke-width="9"/>
    <circle cx="66" cy="22" r="10" fill="#111827"/>
    <text x="96" y="58" font-family="${SANS}" font-size="34" font-weight="700" letter-spacing="9" fill="#111827">ORBITA</text>`,
  );
}

// ---------------------------------------------------------------------------
// Banners — 1200×300 (shown at ≤ 600 px)
// ---------------------------------------------------------------------------

function pill(x, y, label, fill, color, width) {
  return `<rect x="${x}" y="${y}" width="${width}" height="60" rx="30" fill="${fill}"/>
    <text x="${x + width / 2}" y="${y + 39}" text-anchor="middle" font-family="${SANS}" font-size="24" font-weight="700" fill="${color}">${label}</text>`;
}

function bannerWebinar() {
  return svgDoc(
    1200,
    300,
    `<defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#1e3a8a"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.85" cy="0.3" r="0.6">
        <stop offset="0" stop-color="#38bdf8" stop-opacity="0.45"/>
        <stop offset="1" stop-color="#38bdf8" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="300" fill="url(#bg)"/>
    <rect width="1200" height="300" fill="url(#glow)"/>
    <circle cx="1030" cy="150" r="96" fill="none" stroke="#38bdf8" stroke-opacity="0.55" stroke-width="3"/>
    <circle cx="1030" cy="150" r="136" fill="none" stroke="#38bdf8" stroke-opacity="0.25" stroke-width="3"/>
    <circle cx="1030" cy="150" r="56" fill="#38bdf8"/>
    <path d="M1014 124 L1052 150 L1014 176 Z" fill="#0f172a"/>
    <rect x="72" y="62" width="196" height="40" rx="20" fill="#38bdf8" fill-opacity="0.18"/>
    <circle cx="96" cy="82" r="7" fill="#f43f5e"/>
    <text x="112" y="90" font-family="${SANS}" font-size="20" font-weight="700" letter-spacing="3" fill="#e0f2fe">EN DIRECTO</text>
    <text x="72" y="168" font-family="${SANS}" font-size="58" font-weight="800" fill="#ffffff">Webinar gratuito</text>
    <text x="72" y="222" font-family="${SANS}" font-size="28" font-weight="400" fill="#bfdbfe">Inscríbete y reserva tu plaza · Cupo limitado</text>`,
  );
}

function bannerCollection() {
  return svgDoc(
    1200,
    300,
    `<defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fdf6ec"/><stop offset="1" stop-color="#f6e3cc"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="300" fill="url(#bg)"/>
    <path d="M820 300 L820 150 A110 110 0 0 1 1040 150 L1040 300 Z" fill="#c2410c" fill-opacity="0.88"/>
    <path d="M900 300 L900 190 A70 70 0 0 1 1040 190 L1040 300 Z" fill="#7c2d12"/>
    <circle cx="1110" cy="86" r="40" fill="#f59e0b"/>
    <text x="72" y="96" font-family="${SANS}" font-size="20" font-weight="700" letter-spacing="4" fill="#9a3412">LO MÁS NUEVO</text>
    <text x="72" y="170" font-family="${SANS}" font-size="62" font-weight="800" fill="#1c1917">Nueva colección</text>
    <text x="72" y="222" font-family="${SANS}" font-size="28" font-weight="400" fill="#44403c">Descúbrela ya en nuestra tienda online</text>`,
  );
}

function bannerHiring() {
  return svgDoc(
    1200,
    300,
    `<defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#4338ca"/><stop offset="1" stop-color="#7c3aed"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="300" fill="url(#bg)"/>
    <circle cx="1080" cy="40" r="150" fill="#ffffff" fill-opacity="0.07"/>
    <circle cx="960" cy="300" r="110" fill="#ffffff" fill-opacity="0.07"/>
    <g transform="translate(905 92)">
      <circle cx="36" cy="30" r="22" fill="#c7d2fe"/>
      <path d="M0 116 C0 78 16 62 36 62 C56 62 72 78 72 116 Z" fill="#c7d2fe"/>
      <circle cx="122" cy="22" r="26" fill="#ffffff"/>
      <path d="M80 116 C80 72 100 56 122 56 C144 56 164 72 164 116 Z" fill="#ffffff"/>
      <circle cx="208" cy="30" r="22" fill="#c7d2fe"/>
      <path d="M172 116 C172 78 188 62 208 62 C228 62 244 78 244 116 Z" fill="#c7d2fe"/>
    </g>
    ${pill(72, 52, 'ÚNETE AL EQUIPO', '#ffffff', '#4338ca', 236)}
    <text x="72" y="182" font-family="${SANS}" font-size="60" font-weight="800" fill="#ffffff">Estamos contratando</text>
    <text x="72" y="232" font-family="${SANS}" font-size="28" font-weight="400" fill="#e0e7ff">Descubre nuestras vacantes abiertas</text>`,
  );
}

// ---------------------------------------------------------------------------
// Sample QR — preview only (the editor uploads the real one on apply)
// ---------------------------------------------------------------------------

function qrSample() {
  const qr = qrcode(0, 'M');
  qr.addData('https://example.com');
  qr.make();
  const count = qr.getModuleCount();
  const margin = 2;
  const cell = Math.floor(192 / (count + margin * 2));
  const size = cell * (count + margin * 2);
  let rects = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        rects += `<rect x="${(c + margin) * cell}" y="${(r + margin) * cell}" width="${cell}" height="${cell}"/>`;
      }
    }
  }
  return svgDoc(size, size, `<rect width="${size}" height="${size}" fill="#ffffff"/><g fill="#111827">${rects}</g>`);
}

// ---------------------------------------------------------------------------

const OUTPUTS = [
  ...AVATARS.map((a) => [a.file, avatarSvg(a), 'gradient']),
  ['logo-1', logoAcme(), 'flat'],
  ['logo-2', logoEmblem(), 'flat'],
  ['logo-3', logoLumen(), 'flat'],
  ['logo-4', logoOrbita(), 'flat'],
  ['banner-webinar', bannerWebinar(), 'gradient'],
  ['banner-collection', bannerCollection(), 'gradient'],
  ['banner-hiring', bannerHiring(), 'gradient'],
  ['qr-sample', qrSample(), 'flat'],
];

mkdirSync(OUT_DIR, { recursive: true });
let total = 0;
for (const [name, svg, kind] of OUTPUTS) {
  const { png, mode } = render(svg, kind);
  const file = resolve(OUT_DIR, `${name}.png`);
  writeFileSync(file, png);
  total += png.length;
  console.log(`${relative(ROOT, file)}  ${(png.length / 1024).toFixed(1)} KB  (${mode})`);
}
if (FONT_FILES.length === 0) {
  console.warn('! Inter not found — text was rendered with the system sans-serif.');
}
console.log(`${OUTPUTS.length} files, ${(total / 1024).toFixed(1)} KB`);
