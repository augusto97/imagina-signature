import type { FC } from 'react';
import type { TextBlock } from '@/core/schema/blocks';
import { __ } from '@/i18n/helpers';

interface Props {
  block: TextBlock;
  onChange: (updates: Partial<TextBlock>) => void;
}

/**
 * Properties panel for a Text block — Sprint 5 ships a plain
 * <textarea> for the HTML content. Sprint 7 swaps in TiptapEditor
 * with the email-safe formatting toolbar.
 */
export const TextProperties: FC<Props> = ({ block, onChange }) => {
  return (
    <div className="space-y-3 text-xs">
      <label className="block">
        <span className="mb-1 block text-[var(--text-secondary)]">{__('Content (HTML)')}</span>
        <textarea
          className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-2 font-mono text-xs text-[var(--text-primary)]"
          rows={5}
          value={block.content}
          onChange={(e) => onChange({ content: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[var(--text-secondary)]">{__('Color')}</span>
        <input
          type="color"
          className="h-8 w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)]"
          value={block.style.color}
          onChange={(e) =>
            onChange({
              style: { ...block.style, color: e.target.value },
            })
          }
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[var(--text-secondary)]">{__('Font size (px)')}</span>
        <input
          type="number"
          min={8}
          max={72}
          className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5 text-xs"
          value={block.style.font_size}
          onChange={(e) =>
            onChange({
              style: { ...block.style, font_size: Number(e.target.value) || 14 },
            })
          }
        />
      </label>
    </div>
  );
};
