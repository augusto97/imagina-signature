import type { CSSProperties, FC } from 'react';
import { UserRound } from 'lucide-react';
import type { AvatarBlock } from '@/core/schema/blocks';
import { paddingCss } from '@/core/compiler/css';
import { AlignedCell, LinkWrap } from '../image/ImageRenderer';
import { alignMargin } from '../image/markup';
import { cssRadius, resolveAvatar } from './model';

/**
 * Canvas renderer for the Avatar block — mirrors `compileAvatar()`:
 * square image at `size`, shape radius, ring (baked into the PNG or
 * drawn as a padded coloured cell), alignment and link.
 */
export const AvatarRenderer: FC<{ block: AvatarBlock }> = ({ block }) => {
  const avatar = resolveAvatar(block);
  const ringBaked = avatar.processed !== null && avatar.processed.ring_width > 0;
  const cssRing =
    !ringBaked && avatar.ringWidth > 0 ? Math.min(avatar.ringWidth, Math.floor(avatar.size / 4)) : 0;
  const imgSize = Math.max(1, avatar.size - cssRing * 2);
  const radius = cssRadius(avatar.shape, imgSize) ?? 0;

  const imgStyle: CSSProperties = {
    display: 'block',
    width: `${imgSize}px`,
    height: `${imgSize}px`,
    maxWidth: '100%',
    borderRadius: radius,
    objectFit: 'cover',
    border: 0,
    margin: cssRing ? undefined : alignMargin(avatar.align),
  };

  let content = avatar.src ? (
    <img src={avatar.src} alt={avatar.alt} width={imgSize} height={imgSize} style={imgStyle} />
  ) : (
    <span
      aria-hidden
      style={{
        ...imgStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#e2e8f0',
        color: '#94a3b8',
      }}
    >
      <UserRound size={Math.max(14, Math.round(imgSize / 2.4))} />
    </span>
  );
  if (avatar.link && avatar.src) content = <LinkWrap href={avatar.link}>{content}</LinkWrap>;

  return (
    <AlignedCell padding={paddingCss(block.padding)} align={avatar.align}>
      {cssRing > 0 ? (
        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          style={{ borderCollapse: 'separate', margin: alignMargin(avatar.align) }}
        >
          <tbody>
            <tr>
              <td
                style={{
                  padding: `${cssRing}px`,
                  backgroundColor: avatar.ringColor,
                  borderRadius: cssRadius(avatar.shape, avatar.size) ?? 0,
                }}
              >
                {content}
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        content
      )}
    </AlignedCell>
  );
};
