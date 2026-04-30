import type { FC } from 'react';
import type { TextBlock as TextBlockType } from '@/core/schema/blocks';

interface Props {
  block: TextBlockType;
  isPreview?: boolean;
}

/**
 * Canvas renderer for a Text block.
 *
 * Produces a single-cell table that mirrors the email-safe shape
 * the compiler emits, so what the user sees on the canvas is
 * pixel-faithful to the export. `dangerouslySetInnerHTML` is OK
 * here because the content is whitelisted by Tiptap on the way in
 * (Sprint 7) and HtmlSanitizer on the server.
 */
export const TextBlock: FC<Props> = ({ block }) => {
  const padding = block.padding;
  const td: React.CSSProperties = {
    fontFamily: block.style.font_family,
    fontSize: `${block.style.font_size}px`,
    fontWeight: block.style.font_weight,
    color: block.style.color,
    lineHeight: block.style.line_height ?? 1.4,
    textAlign: block.style.text_align ?? 'left',
    padding: padding
      ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`
      : '0',
  };

  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ borderCollapse: 'collapse', width: '100%' }}
    >
      <tbody>
        <tr>
          <td style={td} dangerouslySetInnerHTML={{ __html: block.content }} />
        </tr>
      </tbody>
    </table>
  );
};
