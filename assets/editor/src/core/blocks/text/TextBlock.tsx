import { useMemo, type FC } from 'react';
import type { TextBlock as TextBlockType } from '@/core/schema/blocks';
import { sanitizeEmailHtml } from '@/core/compiler/sanitize';
import { useSchemaStore } from '@/stores/schemaStore';
import { scaleSpanLineHeights } from './richText';
import { TEXT_TYPOGRAPHY, resolveTypography, typographyCss } from './typography';

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
 *
 * Unset font family / size / colour inherit the canvas defaults via the
 * same resolver the compiler uses.
 */
export const TextBlock: FC<Props> = ({ block }) => {
  const canvas = useSchemaStore((s) => s.schema.canvas);
  const typography = useMemo(
    () => resolveTypography(block.style, canvas, TEXT_TYPOGRAPHY),
    [block.style, canvas],
  );
  const padding = block.padding;
  const td: React.CSSProperties = {
    ...typographyCss(typography),
    padding: padding
      ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`
      : '0',
  };

  // Same sanitiser + link colour as the compile path so links look the
  // same on the canvas as in the recipient's inbox (WYSIWYG).
  const safeContent = useMemo(() => {
    const html = sanitizeEmailHtml(block.content, { linkColor: canvas.link_color });
    return typography.lineHeightPx !== null
      ? scaleSpanLineHeights(html, typography.lineHeight)
      : html;
  }, [block.content, canvas.link_color, typography.lineHeightPx, typography.lineHeight]);

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
