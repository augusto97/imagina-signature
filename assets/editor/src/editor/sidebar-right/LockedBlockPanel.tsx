import type { FC } from 'react';
import { Lock } from 'lucide-react';
import type { Block, DisclaimerBlock, HeadingBlock, TextBlock } from '@/core/schema/blocks';
import { resolveRichContent, richContentPatch } from '@/core/blocks/text/richText';
import { useSchemaStore } from '@/stores/schemaStore';
import { TiptapEditor } from '@/tiptap/TiptapEditor';
import { __ } from '@/i18n/helpers';
import { PropertySection } from './sections/PropertySection';
import { VariablesEditor } from './VariablesEditor';

/**
 * Right-sidebar panels for a signature whose template restricts what
 * the user may change (1.3.0, see `core/schema/locks.ts`).
 */

/** Why the selected block can't be edited. */
export const LockedNotice: FC<{ reason: 'locked' | 'design' }> = ({ reason }) => (
  <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-panel-soft)] text-[var(--text-muted)]">
      <Lock size={15} />
    </span>
    <p className="text-[12.5px] font-medium text-[var(--text-primary)]">
      {reason === 'locked' ? __('This block is locked') : __('Managed by your company template')}
    </p>
    <p className="text-[11.5px] leading-relaxed text-[var(--text-muted)]">
      {reason === 'locked'
        ? __('Your administrator locked this block so every signature keeps the company design.')
        : __('Only the text of unlocked text blocks can be changed in this signature.')}
    </p>
  </div>
);

/**
 * `locked_design`: only the text of an unlocked text / heading /
 * disclaimer block. The editor keeps the formats of the block's own
 * panel so inline styling from the template (a coloured word, a larger
 * name) survives the employee's edit instead of being normalised away.
 */
export const ContentOnlyPanel: FC<{ block: Block }> = ({ block }) => {
  const updateBlock = useSchemaStore((s) => s.updateBlock);

  if (block.type === 'text') {
    const text = block as TextBlock;
    return (
      <PropertySection title={__('Content')}>
        <TiptapEditor
          content={text.content}
          onChange={(html) => updateBlock(text.id, { content: html })}
        />
        <DesignHint />
      </PropertySection>
    );
  }

  const rich = block as HeadingBlock | DisclaimerBlock;
  return (
    <PropertySection title={__('Text')}>
      <TiptapEditor
        content={resolveRichContent(rich)}
        onChange={(html) => updateBlock(rich.id, richContentPatch(html))}
        allowedFormats={
          block.type === 'heading'
            ? ['bold', 'italic', 'underline', 'link', 'color', 'fontSize']
            : ['bold', 'italic', 'link']
        }
        singleParagraph={block.type === 'heading'}
        minHeight={block.type === 'heading' ? 36 : undefined}
      />
      <DesignHint />
    </PropertySection>
  );
};

const DesignHint: FC = () => (
  <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
    <Lock size={11} className="mt-0.5 shrink-0" />
    {__('Fonts, colours and layout come from your company template.')}
  </p>
);

/** Canvas panel when the canvas is fixed: only the signature's variables. */
export const LockedCanvasPanel: FC = () => (
  <>
    <div className="flex items-start gap-2 border-b border-[var(--border-default)] px-4 py-3 text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
      <Lock size={12} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
      {__(
        'The canvas and layout come from your company template. You can fill in the variables below.',
      )}
    </div>
    <VariablesEditor />
  </>
);
