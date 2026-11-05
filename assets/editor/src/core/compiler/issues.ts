import { __ } from '@/i18n/helpers';
import { getBlockDefinition } from '@/core/blocks/registry';
import { attr } from './css';

/**
 * Structured compile diagnostics.
 *
 * `error`   — the exported signature is broken for recipients (an
 *             embedded data: image, a disabled javascript: link, a QR
 *             that was never uploaded…). Surfaced prominently.
 * `warning` — it works but probably not the way the user expects
 *             (http image, placeholder host, missing alt, too long for
 *             Gmail…).
 */
export type CompileIssueLevel = 'error' | 'warning';

export interface CompileIssue {
  level: CompileIssueLevel;
  /** Human-readable, already translated. */
  message: string;
  /** Id of the block the issue belongs to, when known. */
  blockId?: string;
  /** Type of that block. */
  blockType?: string;
  /** Machine-readable code (e.g. `data-uri`, `unsafe-url`, `qr-not-uploaded`). */
  code?: string;
}

export interface IssueSink {
  issues: CompileIssue[];
}

export interface BlockRef {
  id: string;
  type: string;
}

export function report(
  sink: IssueSink,
  level: CompileIssueLevel,
  message: string,
  block?: BlockRef | null,
  code?: string,
): void {
  const issue: CompileIssue = { level, message };
  if (block) {
    issue.blockId = block.id;
    issue.blockType = block.type;
  }
  if (code) issue.code = code;
  // De-duplicate identical diagnostics (same block, same message).
  if (
    sink.issues.some(
      (i) => i.level === level && i.message === message && i.blockId === issue.blockId,
    )
  ) {
    return;
  }
  sink.issues.push(issue);
}

/** Translated, human label of a block type ("Avatar", "QR Code", …). */
export function blockLabel(type: string | undefined): string {
  if (!type) return __('Signature');
  const def = getBlockDefinition(type);
  return def ? __(def.label) : type;
}

/**
 * Attribute that tags an emitted `<img>` / `<a>` with the block that
 * produced it, so the post-substitution URL pass can name the block in
 * its diagnostics. Always stripped before the HTML leaves the compiler.
 */
export const MARKER_ATTR = 'data-imgsig-src';

export function markerAttr(block: BlockRef): string {
  return ` ${MARKER_ATTR}="${attr(block.type)}:${attr(block.id)}"`;
}

/** Removes every compile-time marker attribute. */
export function stripMarkers(html: string): string {
  return html.replace(new RegExp(`\\s${MARKER_ATTR}="[^"]*"`, 'g'), '');
}

/** Parses a marker value back into a block ref. */
export function parseMarker(value: string | undefined): BlockRef | null {
  if (!value) return null;
  const decoded = value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const idx = decoded.indexOf(':');
  if (idx <= 0) return null;
  return { type: decoded.slice(0, idx), id: decoded.slice(idx + 1) };
}

// ---------------------------------------------------------------------------
// Shared block-level checks
// ---------------------------------------------------------------------------

/** Warns when an image-like block has no alt text. */
export function checkAlt(sink: IssueSink, block: BlockRef, alt: string | undefined): void {
  if (!alt || alt.trim() === '') {
    report(
      sink,
      'warning',
      __('%s block: the image has no alt text, so nothing describes it when images are blocked.', blockLabel(block.type)),
      block,
      'missing-alt',
    );
  }
}

/**
 * Clamps an image's display width to the pixels actually available and
 * warns when the requested width does not fit.
 */
export function clampToAvailable(
  sink: IssueSink,
  block: BlockRef,
  requested: number,
  available: number,
): number {
  const max = Math.max(1, Math.floor(available));
  if (requested > max) {
    report(
      sink,
      'warning',
      __(
        '%s block is %spx wide but only %spx are available here; it was scaled down to fit.',
        blockLabel(block.type),
        String(Math.round(requested)),
        String(max),
      ),
      block,
      'image-too-wide',
    );
    return max;
  }
  return Math.max(1, Math.round(requested));
}

/**
 * Warns about small text whose colour barely contrasts with the canvas
 * background (WCAG AA 4.5:1). Only hex colours are evaluated.
 */
export function checkContrast(
  sink: IssueSink,
  block: BlockRef,
  color: string,
  background: string,
  fontSize: number,
): void {
  if (fontSize > 12) return;
  const ratio = contrastRatio(color, background);
  if (ratio !== null && ratio < 4.5) {
    report(
      sink,
      'warning',
      __(
        '%s block: %spx text has low contrast against the background (%s:1); it may be hard to read.',
        blockLabel(block.type),
        String(fontSize),
        ratio.toFixed(1),
      ),
      block,
      'low-contrast',
    );
  }
}

function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function luminance(hex: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const channels = [0, 2, 4].map((i) => {
    const v = Number.parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}
