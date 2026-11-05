import { Fragment, type CSSProperties, type FC, type ReactNode } from 'react';
import type { ContactRowBlock as ContactRowBlockType } from '@/core/schema/blocks';
import { iconUrl } from '@/core/compiler/assets';
import { CONTACT_ICON_GAP } from './compileContact';
import {
  CONTACT_ICON,
  contactHref,
  displayValue,
  itemPrefix,
  normalizeContactRow,
  type ContactItem,
  typeLabel,
} from './normalize';

/**
 * Canvas renderer — same structure as `compileContactRow()` (stacked
 * rows or a single line, hosted PNG icons in fixed-width cells). Text
 * without a `font_family` inherits the canvas font, as in the export.
 */
export const ContactRowBlock: FC<{ block: ContactRowBlockType }> = ({ block }) => {
  const c = normalizeContactRow(block);
  const p = block.padding;
  const padding = p ? `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px` : 0;
  const align = c.style.text_align ?? 'left';
  const color = c.style.color;
  const linkColor = c.link_color ?? color;
  const items = c.items.filter((item) => item.value.trim() !== '');

  const text: CSSProperties = {
    fontFamily: c.style.font_family,
    fontSize: `${c.style.font_size}px`,
    fontWeight: c.style.font_weight,
    color,
    lineHeight: c.style.line_height ?? 1.4,
  };
  const iconWidth = c.icon_size + CONTACT_ICON_GAP;

  const value = (item: ContactItem): ReactNode => {
    const href = contactHref(item);
    const prefix = itemPrefix(item, c.label_mode);
    return (
      <>
        {prefix !== '' && (
          <>
            <span style={{ fontWeight: 'bold' }}>{prefix}</span>
            {' '}
          </>
        )}
        {href ? (
          <a href={href} style={{ color: linkColor, textDecoration: 'none' }}>
            {displayValue(item)}
          </a>
        ) : (
          displayValue(item)
        )}
      </>
    );
  };

  const icon = (item: ContactItem, padTop: number): ReactNode => (
    <td
      width={iconWidth}
      valign="middle"
      style={{ width: iconWidth, paddingTop: padTop || undefined, lineHeight: 0, fontSize: 0 }}
    >
      <img
        src={iconUrl(CONTACT_ICON[item.type], c.icon_shape, c.icon_tone)}
        width={c.icon_size}
        height={c.icon_size}
        alt={typeLabel(item.type)}
        draggable={false}
        style={{ display: 'block', border: 0, width: c.icon_size, height: c.icon_size }}
      />
    </td>
  );

  let body: ReactNode;
  if (c.layout === 'inline' && !c.show_icons) {
    body = (
      <tr>
        <td style={text}>
          {items.map((item, i) => (
            <Fragment key={item.id}>
              {i > 0 && <InlineSeparator separator={c.separator} />}
              <span style={{ whiteSpace: 'nowrap' }}>{value(item)}</span>
            </Fragment>
          ))}
        </td>
      </tr>
    );
  } else if (c.layout === 'inline') {
    const sep = c.separator.trim();
    body = (
      <tr>
        {items.map((item, i) => (
          <Fragment key={item.id}>
            {i > 0 &&
              (sep === '' ? (
                <td width={12} style={{ width: 12 }} />
              ) : (
                <td valign="middle" style={{ ...text, padding: '0 8px' }}>
                  {sep}
                </td>
              ))}
            {icon(item, 0)}
            <td valign="middle" style={{ ...text, whiteSpace: 'nowrap' }}>
              {value(item)}
            </td>
          </Fragment>
        ))}
      </tr>
    );
  } else {
    body = items.map((item, i) => {
      const padTop = i > 0 ? c.row_gap : 0;
      return (
        <tr key={item.id}>
          {c.show_icons && icon(item, padTop)}
          <td valign="middle" style={{ ...text, paddingTop: padTop || undefined }}>
            {value(item)}
          </td>
        </tr>
      );
    });
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
          <td align={align} style={{ padding, textAlign: align }}>
            <table
              role="presentation"
              cellPadding={0}
              cellSpacing={0}
              border={0}
              align={align === 'left' ? undefined : align}
              style={{ borderCollapse: 'collapse' }}
            >
              <tbody>{body}</tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  );
};

/** Leading / inner spaces non-breaking, trailing space breakable — as in the export. */
const InlineSeparator: FC<{ separator: string }> = ({ separator }) => {
  const trailing = /\s$/.test(separator);
  const core = separator.replace(/\s+$/, '').replace(/ /g, ' ');
  return <>{trailing ? `${core} ` : core}</>;
};
