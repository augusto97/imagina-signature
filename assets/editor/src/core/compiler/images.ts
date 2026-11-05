import { parseAttributes, tokenizeHtml } from './html-tokens';
import { MARKER_ATTR, parseBlockMarkerComment, parseMarker, type BlockRef } from './issues';
import { classifyUrl, decodeEntities } from './urls';

/** One `<img>` of the exported signature, as non-Outlook clients see it. */
export interface CompiledImage {
  /** Entity-decoded `src`. */
  src: string;
  /** Entity-decoded `alt` ('' when empty / missing). */
  alt: string;
  /** `width` attribute in px, when numeric. */
  width?: number;
  /** `height` attribute in px, when numeric. */
  height?: number;
  /** Block that produced the image, when known. */
  blockId?: string;
  blockType?: string;
}

/**
 * Lists the images of a compiled document in source order, attributed
 * to their block through the compile-time markers (`data-imgsig-src`
 * on the tag, else the innermost block boundary comment). Images inside
 * Outlook-only conditional comments are not listed.
 *
 * Only http(s) images are returned — exactly the ones the URL safety
 * pass keeps (data: / blob: / empty sources are removed and reported
 * there).
 */
export function collectImages(html: string): CompiledImage[] {
  const out: CompiledImage[] = [];
  const blocks: Array<BlockRef | null> = [];
  for (const token of tokenizeHtml(html)) {
    if (token.kind === 'comment') {
      const marker = parseBlockMarkerComment(token.raw);
      if (marker === 'end') blocks.pop();
      else if (marker) blocks.push(marker);
      continue;
    }
    if (token.kind !== 'open' || token.name !== 'img') continue;
    const attrs = parseAttributes(token.attrs);
    const rawSrc = attrs.get('src') ?? '';
    const kind = classifyUrl(rawSrc);
    if (kind !== 'https' && kind !== 'http') continue;

    const image: CompiledImage = {
      src: decodeEntities(rawSrc).trim(),
      alt: decodeEntities(attrs.get('alt') ?? '').trim(),
    };
    const width = Number.parseInt(attrs.get('width') ?? '', 10);
    const height = Number.parseInt(attrs.get('height') ?? '', 10);
    if (Number.isFinite(width)) image.width = width;
    if (Number.isFinite(height)) image.height = height;
    const block =
      parseMarker(attrs.get(MARKER_ATTR)) ??
      (blocks.length > 0 ? blocks[blocks.length - 1]! : null);
    if (block) {
      image.blockId = block.id;
      image.blockType = block.type;
    }
    out.push(image);
  }
  return out;
}
