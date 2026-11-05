import type { FC } from 'react';
import type { Editor } from '@tiptap/react';
import { ALargeSmall } from 'lucide-react';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { ToolbarMenu } from './ToolbarMenu';

/** Preset sizes (px) — email-safe, readable range. */
const FONT_SIZE_PRESETS = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32];

interface Props {
  editor: Editor;
}

/**
 * Font-size menu for the selection. "Default" removes the size so the
 * block's own size applies.
 */
export const FontSizeMenu: FC<Props> = ({ editor }) => {
  const raw = editor.getAttributes('textStyle').fontSize as string | undefined;
  const current = raw ? Number.parseFloat(raw) : null;

  return (
    <ToolbarMenu
      label={__('Font size')}
      active={current !== null}
      width={132}
      trigger={
        current !== null ? (
          <span className="min-w-[14px] text-center text-[11px] font-semibold tabular-nums">
            {current}
          </span>
        ) : (
          <ALargeSmall size={14} />
        )
      }
    >
      {(close) => (
        <div className="space-y-1.5">
          <div className="grid grid-cols-4 gap-1">
            {FONT_SIZE_PRESETS.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => {
                  editor.chain().focus().setFontSize(`${size}px`).run();
                  close();
                }}
                className={cn(
                  'rounded py-0.5 tabular-nums hover:bg-[var(--bg-hover)]',
                  current === size && 'bg-[var(--bg-selected)] font-semibold text-[var(--accent)]',
                )}
              >
                {size}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="w-full rounded py-0.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            onClick={() => {
              editor.chain().focus().unsetFontSize().run();
              close();
            }}
          >
            {__('Default size')}
          </button>
        </div>
      )}
    </ToolbarMenu>
  );
};
