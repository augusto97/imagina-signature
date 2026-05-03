import { useState, type FC } from 'react';
import { Image as ImageIcon, Crop } from 'lucide-react';
import type { ImageBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { ImageCropperModal } from '@/editor/modals/ImageCropperModal';
import { escapeAttr } from '@/core/compiler/compile';
import { isUploadEnabled } from '@/bridge/apiClient';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';

const Renderer: FC<{ block: ImageBlock }> = ({ block }) => {
  const padding = block.padding;
  const td: React.CSSProperties = {
    padding: padding
      ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`
      : '0',
    textAlign: 'left',
  };

  const img = (
    <img
      src={block.src || 'https://placehold.co/120x120?text=Image'}
      alt={block.alt}
      width={block.width}
      height={block.height}
      style={{
        display: 'block',
        maxWidth: '100%',
        height: 'auto',
        border: 0,
        borderRadius: block.border_radius ? `${block.border_radius}px` : 0,
      }}
    />
  );

  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ borderCollapse: 'collapse' }}
    >
      <tbody>
        <tr>
          <td style={td}>{block.link ? <a href={block.link}>{img}</a> : img}</td>
        </tr>
      </tbody>
    </table>
  );
};

const Properties: FC<{ block: ImageBlock; onChange: (updates: Partial<ImageBlock>) => void }> = ({
  block,
  onChange,
}) => {
  const [cropping, setCropping] = useState(false);

  return (
  <div className="space-y-3 text-xs">
    <label className="block">
      <span className="mb-1 block text-[var(--text-secondary)]">{__('Image URL')}</span>
      <input
        type="url"
        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
        value={block.src}
        onChange={(e) => onChange({ src: e.target.value })}
      />
    </label>
    {/* Cropping produces a data-URL that gets stored in the schema —
        effectively the editor "hosting" image bytes inside the
        signature row. URL-only mode (1.0.29) forbids that, so the
        Crop button is hidden when uploads are disabled. */}
    {isUploadEnabled() && (
      <button
        type="button"
        disabled={!block.src}
        onClick={() => setCropping(true)}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] px-2 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Crop size={12} />
        {__('Crop image')}
      </button>
    )}
    <label className="block">
      <span className="mb-1 block text-[var(--text-secondary)]">{__('Alt text')}</span>
      <input
        type="text"
        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
        value={block.alt}
        onChange={(e) => onChange({ alt: e.target.value })}
      />
    </label>
    <label className="block">
      <span className="mb-1 block text-[var(--text-secondary)]">{__('Width (px)')}</span>
      <input
        type="number"
        min={1}
        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
        value={block.width ?? ''}
        onChange={(e) =>
          onChange({ width: e.target.value === '' ? undefined : Number(e.target.value) })
        }
      />
    </label>
    <label className="block">
      <span className="mb-1 block text-[var(--text-secondary)]">{__('Border radius (px)')}</span>
      <input
        type="number"
        min={0}
        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
        value={block.border_radius ?? 0}
        onChange={(e) => onChange({ border_radius: Number(e.target.value) })}
      />
    </label>
    <label className="block">
      <span className="mb-1 block text-[var(--text-secondary)]">{__('Link (optional)')}</span>
      <input
        type="url"
        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
        value={block.link ?? ''}
        onChange={(e) => onChange({ link: e.target.value || undefined })}
      />
    </label>

    {isAnimatedGif(block.src) && (
      <label className="block">
        <span className="mb-1 block text-[var(--text-secondary)]">
          {__('Static fallback URL')}
        </span>
        <input
          type="url"
          className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
          value={block.static_fallback_url ?? ''}
          onChange={(e) => onChange({ static_fallback_url: e.target.value || undefined })}
          placeholder="https://example.com/banner-static.png"
        />
        <span className="mt-1 block text-[10.5px] text-[var(--text-muted)]">
          {__('Outlook 2007–2019 freezes GIFs on the first frame. Provide a static PNG/JPG and modern clients keep the animation while old Outlook shows this instead.')}
        </span>
      </label>
    )}

    <ImageCropperModal
      open={cropping}
      src={block.src}
      onCancel={() => setCropping(false)}
      onConfirm={(croppedDataUrl) => {
        onChange({ src: croppedDataUrl });
        setCropping(false);
      }}
    />
  </div>
  );
};

function compile(block: ImageBlock, _ctx: CompileContext): string {
  const p = block.padding;
  const padding = p
    ? `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`
    : '0';
  const widthAttr = block.width ? ` width="${block.width}"` : '';
  const heightAttr = block.height ? ` height="${block.height}"` : '';
  const radius = block.border_radius ? `;border-radius:${block.border_radius}px` : '';
  const baseStyle = `display:block;max-width:100%;height:auto;border:0${radius}`;

  const inner = withOutlookFallback(
    block.src,
    block.static_fallback_url,
    block.alt,
    widthAttr + heightAttr,
    baseStyle,
    block.link,
  );

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="padding:${padding}">${inner}</td></tr></table>`;
}

/**
 * Returns true when `src` looks like an animated-GIF URL — used to
 * show / hide the Static fallback URL input. Best-effort by file
 * extension only (we can't sniff arbitrary remote URLs from the
 * editor without a CORS round-trip).
 */
export function isAnimatedGif(src: string): boolean {
  if (!src) return false;
  // Strip query string, then test extension.
  const noQuery = src.split('?')[0]?.toLowerCase() ?? '';
  return noQuery.endsWith('.gif');
}

/**
 * Builds the `<img>` (optionally wrapped in `<a>`) with an Outlook
 * 2007–2019 fallback when `fallback` is set. Pattern:
 *
 *   <!--[if !mso]><!--><img src=ANIMATED ...><!--<![endif]-->
 *   <!--[if mso]><img src=STATIC ...><![endif]-->
 *
 * Modern clients ignore the conditional comments and render the
 * first `<img>`; Outlook desktop only renders what's inside
 * `[if mso]` so it gets the static frame.
 */
export function withOutlookFallback(
  src: string,
  fallback: string | undefined,
  alt: string,
  dimAttrs: string,
  styles: string,
  link: string | undefined,
): string {
  // Use the strict attribute-context escaper from compile.ts. The
  // local helper that lived here only escaped `"` — leaving `&`,
  // `<`, `>` raw, which let user-controlled URLs / alt text break out
  // of the attribute and inject HTML.
  const safeSrc = escapeAttr(src);
  const safeAlt = escapeAttr(alt);
  const safeLink = link ? escapeAttr(link) : '';
  const wrap = (img: string): string => (link ? `<a href="${safeLink}">${img}</a>` : img);

  if (!fallback) {
    const img = `<img src="${safeSrc}" alt="${safeAlt}"${dimAttrs} style="${styles}" />`;
    return wrap(img);
  }

  const safeFallback = escapeAttr(fallback);
  const animated = `<img src="${safeSrc}" alt="${safeAlt}"${dimAttrs} style="${styles}" />`;
  const staticImg = `<img src="${safeFallback}" alt="${safeAlt}"${dimAttrs} style="${styles}" />`;
  return (
    `<!--[if !mso]><!-->${wrap(animated)}<!--<![endif]-->` +
    `<!--[if mso]>${wrap(staticImg)}<![endif]-->`
  );
}

const definition: BlockDefinition<ImageBlock> = {
  type: 'image',
  label: 'Image',
  description: 'A single image with optional link.',
  icon: ImageIcon,
  category: 'content',

  create: (): ImageBlock => ({
    id: generateId('img'),
    type: 'image',
    src: '',
    alt: '',
    width: 120,
    border_radius: 0,
    padding: { top: 4, right: 0, bottom: 4, left: 0 },
  }),

  Renderer,
  PropertiesPanel: Properties,
  compile,
};

registerBlock(definition);

export { definition as imageDefinition };
