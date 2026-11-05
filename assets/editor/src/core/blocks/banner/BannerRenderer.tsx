import type { CSSProperties, FC } from 'react';
import type { BannerBlock } from '@/core/schema/blocks';
import { paddingCss } from '@/core/compiler/css';
import { AlignedCell, ImagePlaceholder, LinkWrap } from '../image/ImageRenderer';
import { alignMargin } from '../image/markup';
import { bannerHeight, resolveBanner } from './model';

/**
 * Canvas renderer for the Banner block — mirrors `compileBanner()`.
 * A full-width banner fills its cell (the compiler resolves that to the
 * exact pixel width available).
 */
export const BannerRenderer: FC<{ block: BannerBlock }> = ({ block }) => {
  const banner = resolveBanner(block);
  const width = banner.fullWidth ? undefined : banner.width;
  const height = width ? bannerHeight(banner, width) || undefined : undefined;

  const style: CSSProperties = {
    display: 'block',
    width: banner.fullWidth ? '100%' : undefined,
    maxWidth: '100%',
    height: 'auto',
    border: 0,
    outline: 'none',
    borderRadius: banner.radius ? `${banner.radius}px` : 0,
    margin: alignMargin(banner.align),
  };

  const content = banner.src ? (
    <img src={banner.src} alt={banner.alt} width={width} height={height} style={style} />
  ) : (
    <ImagePlaceholder
      width={width ?? 600}
      height={Math.round((width ?? 600) * 0.3)}
      radius={banner.radius}
      align={banner.align}
    />
  );

  return (
    <AlignedCell padding={paddingCss(block.padding)} align={banner.align}>
      {banner.link && banner.src ? <LinkWrap href={banner.link}>{content}</LinkWrap> : content}
    </AlignedCell>
  );
};
