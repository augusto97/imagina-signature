import { useMemo, type FC } from 'react';
import { FileText } from 'lucide-react';
import type { DisclaimerBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { sanitizeEmailHtml } from '@/core/compiler/sanitize';
import { PaddingInput } from '@/editor/sidebar-right/inputs/PaddingInput';
import { TypographySection } from '@/editor/sidebar-right/inputs/TypographySection';
import { PropertySection } from '@/editor/sidebar-right/sections/PropertySection';
import { TiptapEditor } from '@/tiptap/TiptapEditor';
import { useSchemaStore } from '@/stores/schemaStore';
import { compileRichTextCell } from '../text/compileText';
import {
  plainTextToHtml,
  resolveRichContent,
  richContentPatch,
  richTextToPlain,
  scaleSpanLineHeights,
} from '../text/richText';
import {
  DISCLAIMER_TYPOGRAPHY,
  inheritedTypography,
  resolveTypography,
  typographyCss,
} from '../text/typography';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';

/**
 * Disclaimer — small print with bold / italic / links.
 *
 * Pre-1.2 disclaimers stored plain text (newlines = line breaks) in
 * `content`; they keep rendering that way — escaped, newlines → `<br>` —
 * until the first edit writes `content_html` (see `../text/richText.ts`).
 * Unset family / size / colour inherit the canvas: size scaled ×10/14,
 * colour a muted tone of the canvas text colour.
 */

const Renderer: FC<{ block: DisclaimerBlock }> = ({ block }) => {
  const canvas = useSchemaStore((s) => s.schema.canvas);
  const typography = useMemo(
    () => resolveTypography(block.style, canvas, DISCLAIMER_TYPOGRAPHY),
    [block.style, canvas],
  );
  const { content, content_html } = block;
  const html = useMemo(() => {
    const safe = sanitizeEmailHtml(resolveRichContent({ content, content_html }), {
      linkColor: canvas.link_color,
    });
    return typography.lineHeightPx !== null
      ? scaleSpanLineHeights(safe, typography.lineHeight)
      : safe;
  }, [content, content_html, canvas.link_color, typography.lineHeightPx, typography.lineHeight]);

  const padding = block.padding;
  const td: React.CSSProperties = {
    ...typographyCss(typography),
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
          <td style={td} dangerouslySetInnerHTML={{ __html: html }} />
        </tr>
      </tbody>
    </table>
  );
};

const Properties: FC<{
  block: DisclaimerBlock;
  onChange: (u: Partial<DisclaimerBlock>) => void;
}> = ({ block, onChange }) => {
  const canvas = useSchemaStore((s) => s.schema.canvas);
  return (
    <>
      <PropertySection title={__('Disclaimer text')}>
        <TiptapEditor
          content={resolveRichContent(block)}
          onChange={(html) => onChange(richContentPatch(html))}
          allowedFormats={['bold', 'italic', 'link']}
        />
      </PropertySection>
      <TypographySection
        value={block.style}
        onChange={(style) => onChange({ style })}
        inherited={inheritedTypography(canvas, DISCLAIMER_TYPOGRAPHY)}
        sizeRange={[6, 16]}
      />
      <PropertySection title={__('Spacing')} defaultOpen={false}>
        <PaddingInput
          value={block.padding ?? { top: 0, right: 0, bottom: 0, left: 0 }}
          onChange={(p) => onChange({ padding: p })}
        />
      </PropertySection>
    </>
  );
};

function compile(block: DisclaimerBlock, ctx: CompileContext): string {
  return compileRichTextCell(
    block,
    resolveRichContent(block),
    block.style,
    block.padding,
    ctx,
    DISCLAIMER_TYPOGRAPHY,
  );
}

/**
 * Normalises a disclaimer in place to the 1.2 storage model: a legacy
 * plain-text `content` gets its `content_html` twin (escaped, newlines →
 * `<br>`). Idempotent.
 */
export function normaliseDisclaimer(block: DisclaimerBlock): DisclaimerBlock {
  const html = resolveRichContent(block);
  return { ...block, content_html: html, content: richTextToPlain(html) };
}

const definition: BlockDefinition<DisclaimerBlock> = {
  type: 'disclaimer',
  label: 'Disclaimer',
  description: 'Small print at the bottom of the signature.',
  icon: FileText,
  category: 'content',
  create: (): DisclaimerBlock => {
    const text = __(
      'This email and any attachments are confidential. If you received it in error, please notify the sender and delete it.',
    );
    return {
      id: generateId('dsc'),
      type: 'disclaimer',
      content: text,
      content_html: `<p>${plainTextToHtml(text)}</p>`,
      // Family, size and colour follow the canvas (smaller, muted).
      style: {
        line_height: 1.4,
      },
      padding: { top: 8, right: 0, bottom: 0, left: 0 },
    };
  },
  Renderer,
  PropertiesPanel: Properties,
  compile,
  wrap_in_section: false,
};

registerBlock(definition);
export { definition as disclaimerDefinition };
