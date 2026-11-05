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
  // i18n-dynamic: registry labels are listed in i18n/dynamic-strings.ts.
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
  const decoded = value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  const idx = decoded.indexOf(':');
  if (idx <= 0) return null;
  return { type: decoded.slice(0, idx), id: decoded.slice(idx + 1) };
}

// ---------------------------------------------------------------------------
// Block boundary markers
// ---------------------------------------------------------------------------

/**
 * Comments that delimit the markup of ONE block while the document is
 * being compiled (`compileBlock()` emits them when
 * `CompileContext.markBlocks` is set). Document-level passes that only
 * see HTML — contrast analysis, alt enforcement, image collection — use
 * them to attribute what they find to the innermost block. Always
 * stripped ({@link stripBlockMarkers}) before the HTML leaves the
 * compiler; `attr()` escapes `>` so an id can never close the comment.
 */
const BLOCK_MARKER_OPEN = '<!--imgsig-block:';
export const BLOCK_END_MARKER = '<!--/imgsig-block-->';

export function blockStartMarker(block: BlockRef): string {
  return `${BLOCK_MARKER_OPEN}${attr(block.type)}:${attr(block.id)}-->`;
}

/** Wraps one block's compiled markup in its boundary markers. */
export function wrapWithBlockMarkers(html: string, block: BlockRef): string {
  return `${blockStartMarker(block)}${html}${BLOCK_END_MARKER}`;
}

/** `'end'` for a closing marker, the block for an opening one, else null. */
export function parseBlockMarkerComment(raw: string): BlockRef | 'end' | null {
  if (raw === BLOCK_END_MARKER) return 'end';
  if (!raw.startsWith(BLOCK_MARKER_OPEN) || !raw.endsWith('-->')) return null;
  return parseMarker(raw.slice(BLOCK_MARKER_OPEN.length, -3));
}

/** Removes every block boundary marker. */
export function stripBlockMarkers(html: string): string {
  return html.replace(/<!--(?:imgsig-block:[^>]*|\/imgsig-block)-->/g, '');
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
      __(
        '%s block: the image has no alt text, so nothing describes it when images are blocked.',
        blockLabel(block.type),
      ),
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
 * Former block-level contrast check (small text vs the CANVAS colour
 * only). Contrast is now evaluated once on the compiled document by
 * `validateContrast()` (validate.ts), which knows each text run's
 * effective background (box / column / button cell / canvas), its
 * inherited size and weight, and applies the WCAG AA large-text rule —
 * so this no longer reports anything, to avoid duplicate warnings.
 * Kept so existing block compile functions keep compiling.
 *
 * @deprecated Rely on the document-level contrast pass.
 */
export function checkContrast(
  _sink: IssueSink,
  _block: BlockRef,
  _color: string,
  _background: string,
  _fontSize: number,
): void {
  // Intentionally empty — see the docblock.
}

/** Low-contrast warning text (shared by the document-level contrast pass). */
export function lowContrastMessage(
  block: BlockRef | null,
  fontSize: number,
  ratio: number,
): string {
  // Floor, not round: a 4.46:1 ratio must not be displayed as "4.5:1".
  const shown = (Math.floor(ratio * 10) / 10).toFixed(1);
  return __(
    '%s block: %spx text has low contrast against the background (%s:1); it may be hard to read.',
    blockLabel(block?.type),
    String(Math.round(fontSize * 100) / 100),
    shown,
  );
}
