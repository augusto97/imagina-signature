/**
 * Small, dependency-free PNG encoder tuned for icon-sized images.
 *
 * resvg renders premultiplied RGBA and its own `asPng()` writes plain
 * truecolour with default compression (~2.6 KB for a 96 px icon). Our
 * icons are flat artwork — two or three colours plus anti-aliased
 * edges — so an indexed (palette) PNG with a transparency table is
 * usually a third of that size. This encoder:
 *
 *  1. un-premultiplies the pixels (fully transparent → 0,0,0,0);
 *  2. builds an exact palette; when the image has more than 256
 *     colours (gradients, edges where two blends meet) it rounds every
 *     channel to the nearest multiple of 2, 3, 4… until it fits —
 *     at most ±4/255 per channel, invisible at icon sizes;
 *  3. tries every PNG row filter (and an adaptive per-row choice) with
 *     two zlib strategies, for both the palette and the lossless
 *     truecolour encodings, and keeps the smallest file.
 *
 * Output is deterministic for a given Node / zlib version.
 */

import { constants, deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function ihdr(width, height, bitDepth, colorType) {
  const b = Buffer.alloc(13);
  b.writeUInt32BE(width, 0);
  b.writeUInt32BE(height, 4);
  b[8] = bitDepth;
  b[9] = colorType;
  b[10] = 0; // deflate
  b[11] = 0; // adaptive filtering
  b[12] = 0; // no interlace
  return b;
}

/** Premultiplied RGBA → straight RGBA (transparent pixels zeroed). */
function unpremultiply(src) {
  const out = Buffer.alloc(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3];
    if (a === 0) continue;
    if (a === 255) {
      out[i] = src[i];
      out[i + 1] = src[i + 1];
      out[i + 2] = src[i + 2];
    } else {
      out[i] = Math.min(255, Math.round((src[i] * 255) / a));
      out[i + 1] = Math.min(255, Math.round((src[i + 1] * 255) / a));
      out[i + 2] = Math.min(255, Math.round((src[i + 2] * 255) / a));
    }
    out[i + 3] = a;
  }
  return out;
}

function quantise(rgba, step) {
  if (step <= 1) return rgba;
  const out = Buffer.alloc(rgba.length);
  const q = (v) => Math.min(255, Math.round(v / step) * step);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    // Keep fully opaque / fully transparent exact so solid areas and
    // the background never shift.
    const qa = a === 0 || a === 255 ? a : Math.max(1, Math.min(254, q(a)));
    if (qa === 0) continue;
    out[i] = q(rgba[i]);
    out[i + 1] = q(rgba[i + 1]);
    out[i + 2] = q(rgba[i + 2]);
    out[i + 3] = qa;
  }
  return out;
}

/** Map of packed RGBA → count, or null once it exceeds `limit` entries. */
function palette(rgba, limit = 256) {
  const seen = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    const key = rgba.readUInt32BE(i);
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (seen.size > limit) return null;
  }
  return seen;
}

/**
 * Median-cut reduction to at most 256 colours (for gradients, where
 * per-channel rounding is not enough). Fully transparent and fully
 * opaque pixels keep their alpha exactly.
 */
function medianCut(rgba) {
  const counts = palette(rgba, Infinity);
  const colours = [];
  for (const [key, count] of counts) {
    if ((key & 0xff) === 0) continue; // transparent: exact entry below
    colours.push([(key >>> 24) & 0xff, (key >>> 16) & 0xff, (key >>> 8) & 0xff, key & 0xff, count]);
  }
  const boxes = [colours];
  const budget = counts.has(0) ? 255 : 256;
  const spread = (box) => {
    let best = { channel: 0, range: -1 };
    for (let c = 0; c < 4; c++) {
      let lo = 255;
      let hi = 0;
      for (const col of box) {
        if (col[c] < lo) lo = col[c];
        if (col[c] > hi) hi = col[c];
      }
      if (hi - lo > best.range) best = { channel: c, range: hi - lo };
    }
    return best;
  };
  while (boxes.length < budget) {
    let pick = -1;
    let score = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      const pixels = box.reduce((n, col) => n + col[4], 0);
      const s = spread(box).range * Math.sqrt(pixels);
      if (s > score) {
        score = s;
        pick = i;
      }
    });
    if (pick === -1) break;
    const box = boxes[pick];
    const { channel } = spread(box);
    box.sort((a, b) => a[channel] - b[channel] || a[3] - b[3]);
    const total = box.reduce((n, col) => n + col[4], 0);
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < box.length - 1; i++) {
      acc += box[i][4];
      if (acc >= total / 2) {
        cut = i + 1;
        break;
      }
    }
    boxes.splice(pick, 1, box.slice(0, cut), box.slice(cut));
  }

  const mapping = new Map([[0, 0]]);
  for (const box of boxes) {
    const total = box.reduce((n, col) => n + col[4], 0);
    const mean = [0, 1, 2, 3].map((c) =>
      Math.round(box.reduce((n, col) => n + col[c] * col[4], 0) / total),
    );
    const opaque = box.every((col) => col[3] === 255);
    if (opaque) mean[3] = 255;
    else mean[3] = Math.min(254, Math.max(1, mean[3]));
    const rep = ((mean[0] << 24) | (mean[1] << 16) | (mean[2] << 8) | mean[3]) >>> 0;
    for (const col of box) {
      const key = ((col[0] << 24) | (col[1] << 16) | (col[2] << 8) | col[3]) >>> 0;
      mapping.set(key, rep);
    }
  }
  const out = Buffer.alloc(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    out.writeUInt32BE(mapping.get(rgba.readUInt32BE(i)), i);
  }
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function filterRow(type, row, prev, bpp) {
  const out = Buffer.alloc(row.length + 1);
  out[0] = type;
  for (let i = 0; i < row.length; i++) {
    const left = i >= bpp ? row[i - bpp] : 0;
    const up = prev ? prev[i] : 0;
    const upLeft = prev && i >= bpp ? prev[i - bpp] : 0;
    let v;
    switch (type) {
      case 1:
        v = row[i] - left;
        break;
      case 2:
        v = row[i] - up;
        break;
      case 3:
        v = row[i] - ((left + up) >> 1);
        break;
      case 4:
        v = row[i] - paeth(left, up, upLeft);
        break;
      default:
        v = row[i];
    }
    out[i + 1] = v & 0xff;
  }
  return out;
}

function rowCost(filtered) {
  let sum = 0;
  for (let i = 1; i < filtered.length; i++) {
    const v = filtered[i];
    sum += v < 128 ? v : 256 - v;
  }
  return sum;
}

/** Smallest zlib stream over every filter strategy. */
function bestIdat(rows, bpp) {
  const candidates = [];
  for (const type of [0, 1, 2, 3, 4]) {
    candidates.push(Buffer.concat(rows.map((row, y) => filterRow(type, row, rows[y - 1], bpp))));
  }
  candidates.push(
    Buffer.concat(
      rows.map((row, y) => {
        let best = null;
        for (const type of [0, 1, 2, 3, 4]) {
          const f = filterRow(type, row, rows[y - 1], bpp);
          if (!best || rowCost(f) < rowCost(best)) best = f;
        }
        return best;
      }),
    ),
  );
  let smallest = null;
  for (const raw of candidates) {
    for (const strategy of [constants.Z_DEFAULT_STRATEGY, constants.Z_FILTERED]) {
      const z = deflateSync(raw, { level: 9, memLevel: 9, strategy });
      if (!smallest || z.length < smallest.length) smallest = z;
    }
  }
  return smallest;
}

function encodeIndexed(rgba, width, height, colours) {
  // Translucent entries first so the tRNS table can stop early; then
  // by frequency (stable, deterministic order).
  const entries = Array.from(colours.entries()).sort((a, b) => {
    const aa = a[0] & 0xff;
    const ba = b[0] & 0xff;
    if ((aa === 255) !== (ba === 255)) return aa === 255 ? 1 : -1;
    return b[1] - a[1] || a[0] - b[0];
  });
  const index = new Map(entries.map(([key], i) => [key, i]));
  const n = entries.length;
  const bitDepth = n <= 2 ? 1 : n <= 4 ? 2 : n <= 16 ? 4 : 8;

  const plte = Buffer.alloc(n * 3);
  const trnsLen = entries.findIndex(([key]) => (key & 0xff) === 255);
  const trns = Buffer.alloc(trnsLen === -1 ? n : trnsLen);
  entries.forEach(([key], i) => {
    plte[i * 3] = (key >>> 24) & 0xff;
    plte[i * 3 + 1] = (key >>> 16) & 0xff;
    plte[i * 3 + 2] = (key >>> 8) & 0xff;
    if (i < trns.length) trns[i] = key & 0xff;
  });

  const rowBytes = Math.ceil((width * bitDepth) / 8);
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(rowBytes);
    for (let x = 0; x < width; x++) {
      const idx = index.get(rgba.readUInt32BE((y * width + x) * 4));
      const bit = x * bitDepth;
      row[bit >> 3] |= idx << (8 - bitDepth - (bit & 7));
    }
    rows.push(row);
  }

  const parts = [SIGNATURE, chunk('IHDR', ihdr(width, height, bitDepth, 3)), chunk('PLTE', plte)];
  if (trns.length > 0) parts.push(chunk('tRNS', trns));
  parts.push(chunk('IDAT', bestIdat(rows, 1)), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

function encodeTruecolour(rgba, width, height) {
  const rows = [];
  for (let y = 0; y < height; y++) rows.push(rgba.subarray(y * width * 4, (y + 1) * width * 4));
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr(width, height, 8, 6)),
    chunk('IDAT', bestIdat(rows, 4)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * @param {Buffer} premultiplied RGBA pixels as resvg renders them.
 * @param {number} width
 * @param {number} height
 * @returns {{ png: Buffer, mode: string }}
 */
export function encodePng(premultiplied, width, height) {
  const straight = unpremultiply(premultiplied);
  const truecolour = encodeTruecolour(straight, width, height);

  for (const step of [1, 2, 3, 4, 5, 6, 8]) {
    const pixels = quantise(straight, step);
    const colours = palette(pixels);
    if (!colours) continue;
    const indexed = encodeIndexed(pixels, width, height, colours);
    if (indexed.length < truecolour.length) {
      return { png: indexed, mode: step === 1 ? 'indexed' : `indexed~${step}` };
    }
    return { png: truecolour, mode: 'rgba' };
  }

  // Gradients: median-cut to 256 colours.
  const reduced = medianCut(straight);
  const indexed = encodeIndexed(reduced, width, height, palette(reduced));
  if (indexed.length < truecolour.length) return { png: indexed, mode: 'indexed-mc' };
  return { png: truecolour, mode: 'rgba' };
}
