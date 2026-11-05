import { useMemo, type FC } from 'react';
import { Heading as HeadingIcon } from 'lucide-react';
import type { HeadingBlock } from '@/core/schema/blocks';
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
  HEADING_TYPOGRAPHY,
  inheritedTypography,
  resolveTypography,
  typographyCss,
} from '../text/typography';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';

/**
 * Heading block — single-paragraph rich text (so part of a name can be
 * bold or coloured), larger by default than body text.
 *
 * Pre-1.2 headings stored plain text in `content`; those still render
 * (escaped) until the first edit writes `content_html` — see
 * `../text/richText.ts`. Typography inherits the canvas font and colour
 * and scales its size from the canvas default (18px at 14px).
 */

const Renderer: FC<{ block: HeadingBlock }> = ({ block }) => {
  const canvas = useSchemaStore((s) => s.schema.canvas);
  const typography = useMemo(
    () => resolveTypography(block.style, canvas, HEADING_TYPOGRAPHY),
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

const Properties: FC<{ block: HeadingBlock; onChange: (u: Partial<HeadingBlock>) => void }> = ({
  block,
  onChange,
}) => {
  const canvas = useSchemaStore((s) => s.schema.canvas);
  return (
    <>
      <PropertySection title={__('Text')}>
        <TiptapEditor
          content={resolveRichContent(block)}
          onChange={(html) => onChange(richContentPatch(html))}
          allowedFormats={['bold', 'italic', 'underline', 'link', 'color', 'fontSize']}
          singleParagraph
          minHeight={36}
        />
      </PropertySection>
      <TypographySection
        value={block.style}
        onChange={(style) => onChange({ style })}
        inherited={inheritedTypography(canvas, HEADING_TYPOGRAPHY)}
        sizeRange={[10, 72]}
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

function compile(block: HeadingBlock, ctx: CompileContext): string {
  return compileRichTextCell(
    block,
    resolveRichContent(block),
    block.style,
    block.padding,
    ctx,
    HEADING_TYPOGRAPHY,
  );
}

/**
 * Normalises a heading in place to the 1.2 storage model: a legacy
 * plain-text `content` gets its escaped `content_html` twin. Idempotent.
 * (Rendering never needs this — {@link resolveRichContent} migrates on
 * the fly — but callers that want explicit HTML can use it.)
 */
export function normaliseHeading(block: HeadingBlock): HeadingBlock {
  const html = resolveRichContent(block);
  return { ...block, content_html: html, content: richTextToPlain(html) };
}

const definition: BlockDefinition<HeadingBlock> = {
  type: 'heading',
  label: 'Heading',
  description: 'Larger text for emphasis.',
  icon: HeadingIcon,
  category: 'content',
  create: (): HeadingBlock => {
    const text = __('Your Name');
    return {
      id: generateId('h'),
      type: 'heading',
      content: text,
      content_html: `<p>${plainTextToHtml(text)}</p>`,
      // Family, size and colour follow the canvas defaults (size scaled ×18/14).
      style: {
        font_weight: 700,
        line_height: 1.2,
        text_align: 'left',
      },
      padding: { top: 4, right: 0, bottom: 4, left: 0 },
    };
  },
  Renderer,
  PropertiesPanel: Properties,
  compile,
  wrap_in_section: false,
};

registerBlock(definition);
export { definition as headingDefinition };
