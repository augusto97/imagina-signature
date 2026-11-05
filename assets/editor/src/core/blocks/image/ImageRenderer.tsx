import type { CSSProperties, FC, ReactNode } from 'react';
import { ImagePlus } from 'lucide-react';
import type { ImageBlock } from '@/core/schema/blocks';
import { paddingCss } from '@/core/compiler/css';
import { resolveImage, scaledHeight, type ImageAlign } from './model';
import { alignMargin } from './markup';

/**
 * Canvas renderer for the Image block — mirrors `compileImage()`
 * (aligned full-width cell, width / height attributes, border, radius,
 * link) so the canvas shows what recipients get. An empty source shows
 * a local placeholder (no request to a placeholder service).
 */
export const ImageRenderer: FC<{ block: ImageBlock }> = ({ block }) => {
  const image = resolveImage(block);
  const requested = image.width ?? image.naturalWidth ?? 0;
  const width = requested || undefined;
  const height = width ? scaledHeight(image, width, requested) || undefined : undefined;

  const style: CSSProperties = {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    outline: 'none',
    border: image.border
      ? `${image.border.width}px ${image.border.style} ${image.border.color}`
      : 0,
    borderRadius: image.radius ? `${image.radius}px` : 0,
    margin: alignMargin(image.align),
  };

  const content = image.src ? (
    <img src={image.src} alt={image.alt} width={width} height={height} style={style} />
  ) : (
    <ImagePlaceholder
      width={width ?? 120}
      height={height ?? Math.round((width ?? 120) * 0.66)}
      radius={image.radius}
      align={image.align}
    />
  );

  return (
    <AlignedCell padding={paddingCss(block.padding)} align={image.align}>
      {image.link && image.src ? <LinkWrap href={image.link}>{content}</LinkWrap> : content}
    </AlignedCell>
  );
};

/** Full-width table + aligned cell, as emitted by `alignedBlockTable()`. */
export const AlignedCell: FC<{ padding: string; align: ImageAlign; children: ReactNode }> = ({
  padding,
  align,
  children,
}) => (
  <table
    role="presentation"
    cellPadding={0}
    cellSpacing={0}
    border={0}
    width="100%"
    style={{ borderCollapse: 'collapse', width: '100%' }}
  >
    <tbody>
      <tr>
        <td align={align} style={{ padding, textAlign: align }}>
          {children}
        </td>
      </tr>
    </tbody>
  </table>
);

/** Link that never navigates away from the editor. */
export const LinkWrap: FC<{ href: string; children: ReactNode }> = ({ href, children }) => (
  <a href={href} onClick={(e) => e.preventDefault()} style={{ textDecoration: 'none' }}>
    {children}
  </a>
);

/** Local "no image yet" tile for the canvas. */
export const ImagePlaceholder: FC<{
  width: number;
  height: number;
  radius?: number | string;
  align: ImageAlign;
}> = ({ width, height, radius = 0, align }) => (
  <div
    aria-hidden
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width,
      maxWidth: '100%',
      height: Math.max(24, height),
      margin: alignMargin(align),
      borderRadius: typeof radius === 'number' ? `${radius}px` : radius,
      border: '1px dashed #cbd5e1',
      background: '#f1f5f9',
      color: '#94a3b8',
      boxSizing: 'border-box',
    }}
  >
    <ImagePlus size={Math.max(14, Math.min(28, Math.round(Math.min(width, height) / 3)))} />
  </div>
);
