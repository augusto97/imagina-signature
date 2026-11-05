import type { CSSProperties, FC } from 'react';
import { alignMarginCss } from '../text/blockLayout';
import type { ButtonSpec } from './buttonMarkup';

interface Props {
  spec: ButtonSpec;
  /** Canvas href (links never navigate on the canvas). */
  href?: string;
}

/**
 * Canvas rendering of a {@link ButtonSpec}: the same table-cell button
 * `compileButton()` ships to non-Outlook clients (Outlook desktop gets
 * the VML version), or a plain link for the `text` preset.
 */
export const ButtonPreview: FC<Props> = ({ spec, href }) => {
  const t = spec.typography;
  const padding = spec.padding;
  const outer: CSSProperties = {
    padding: padding
      ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`
      : '0',
    textAlign: spec.align,
  };
  const label: CSSProperties = {
    color: spec.textColor,
    fontFamily: t.fontFamily,
    fontSize: `${t.fontSize}px`,
    fontWeight: t.fontWeight as CSSProperties['fontWeight'],
    lineHeight: `${spec.lineHeight}px`,
  };
  if (t.fontStyle) label.fontStyle = t.fontStyle;
  if (t.letterSpacing !== null) label.letterSpacing = `${t.letterSpacing}px`;
  if (t.textTransform) label.textTransform = t.textTransform;

  const link = href ?? spec.href;

  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ borderCollapse: 'collapse', width: '100%' }}
    >
      <tbody>
        <tr>
          <td align={spec.align} style={outer}>
            {spec.preset === 'text' ? (
              <a href={link} style={{ ...label, textDecoration: 'underline' }}>
                {spec.label}
              </a>
            ) : (
              <table
                role="presentation"
                cellPadding={0}
                cellSpacing={0}
                border={0}
                width={spec.fullWidth ? '100%' : undefined}
                style={{
                  borderCollapse: 'separate',
                  ...(spec.fullWidth ? { width: '100%' } : alignMarginCss(spec.align)),
                }}
              >
                <tbody>
                  <tr>
                    <td
                      align={spec.fullWidth ? 'center' : undefined}
                      style={{
                        background: spec.fill ?? undefined,
                        borderRadius: `${spec.radius}px`,
                        padding: `${spec.paddingY}px ${spec.paddingX}px`,
                        border:
                          spec.borderWidth > 0 && spec.borderColor
                            ? `${spec.borderWidth}px solid ${spec.borderColor}`
                            : undefined,
                        textAlign: spec.fullWidth ? 'center' : undefined,
                      }}
                    >
                      <a
                        href={link}
                        style={{ display: 'inline-block', ...label, textDecoration: 'none' }}
                      >
                        {spec.label}
                      </a>
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
};
