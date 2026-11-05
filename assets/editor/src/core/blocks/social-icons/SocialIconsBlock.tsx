import type { FC } from 'react';
import type { SocialIconsBlock as SocialIconsBlockType } from '@/core/schema/blocks';
import { iconUrl } from '@/core/compiler/assets';
import { __ } from '@/i18n/helpers';
import { iconTitle } from './iconSet';
import { normalizeSocialIcons, socialHref } from './normalize';

/**
 * Canvas renderer — the same hosted PNGs and table structure as
 * `compileSocialIcons()`. Items without a link are shown faded (the
 * export leaves them out) so the user can see what still needs a URL.
 */
export const SocialIconsBlock: FC<{ block: SocialIconsBlockType }> = ({ block }) => {
  const s = normalizeSocialIcons(block);
  const p = block.padding;
  const padding = p ? `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px` : 0;

  if (s.items.length === 0) {
    return (
      <div style={{ padding, textAlign: s.align, fontSize: 12, color: '#9ca3af' }}>
        {__('Add your social networks in the panel on the right.')}
      </div>
    );
  }

  return (
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
          <td align={s.align} style={{ padding, textAlign: s.align }}>
            <table
              role="presentation"
              cellPadding={0}
              cellSpacing={0}
              border={0}
              align={s.align === 'left' ? undefined : s.align}
              style={{ borderCollapse: 'collapse' }}
            >
              <tbody>
                <tr>
                  {s.items.map((item, i) => {
                    const href = socialHref(item.network, item.url);
                    const title = iconTitle(item.network);
                    return (
                      <td
                        key={item.id}
                        valign="middle"
                        style={{
                          padding: i < s.items.length - 1 ? `0 ${s.spacing}px 0 0` : 0,
                          lineHeight: 0,
                          fontSize: 0,
                        }}
                      >
                        <a
                          href={href || undefined}
                          title={href ? title : __('%s: no link yet', title)}
                          style={{ textDecoration: 'none', opacity: href ? 1 : 0.35 }}
                        >
                          <img
                            src={iconUrl(item.network, s.shape, s.tone)}
                            width={s.size}
                            height={s.size}
                            alt={title}
                            draggable={false}
                            style={{
                              display: 'block',
                              border: 0,
                              outline: 'none',
                              width: s.size,
                              height: s.size,
                            }}
                          />
                        </a>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  );
};
