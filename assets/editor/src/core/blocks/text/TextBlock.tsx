import { useMemo, type FC } from 'react';
import type { TextBlock as TextBlockType } from '@/core/schema/blocks';
import { sanitizeEmailHtml } from '@/core/compiler/sanitize';

interface Props {
  block: TextBlockType;
  isPreview?: boolean;
}

/**
 * Canvas renderer for a Text block.
 *
 * Produces a single-cell table that mirrors the email-safe shape
 * the compiler emits, so what the user sees on the canvas is
 * pixel-faithful to the export. `block.content` is sanitised through
 * the same email-safe whitelist used at compile time before being
 * passed to `dangerouslySetInnerHTML` — Tiptap is one trust layer,
 * but a corrupted JSON row / template-pick / undo replay could put
 * arbitrary HTML in the store, and the canvas renderer must not be
 * the path that executes it.
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

  const safeContent = useMemo(() => sanitizeEmailHtml(block.content), [block.content]);

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
          <td style={td} dangerouslySetInnerHTML={{ __html: safeContent }} />
        </tr>
      </tbody>
    </table>
  );
};
