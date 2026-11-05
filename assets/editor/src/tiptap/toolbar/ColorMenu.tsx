import type { FC } from 'react';
import type { Editor } from '@tiptap/react';
import { Baseline } from 'lucide-react';
import { brandPalette } from '@/editor/sidebar-right/inputs/brandPalette';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { toHex } from './colors';
import { ToolbarMenu } from './ToolbarMenu';

/** Neutral + saturated defaults offered after the brand palette. */
const STANDARD_COLORS = [
  '#111827',
  '#374151',
  '#6b7280',
  '#9ca3af',
  '#ffffff',
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0d9488',
  '#2563eb',
  '#7c3aed',
  '#db2777',
];

interface Props {
  editor: Editor;
}

/**
 * Text-colour popover for the selection: brand swatches
 * (`IMGSIG_EDITOR_CONFIG.brandPalette`) first, a standard palette, a
 * custom picker and "Default colour" (removes the colour mark so the
 * block colour applies).
 */
export const ColorMenu: FC<Props> = ({ editor }) => {
  const current = toHex(editor.getAttributes('textStyle').color as string | undefined);
  const brand = brandPalette();

  const apply = (color: string) => editor.chain().focus().setColor(color).run();

  return (
    <ToolbarMenu
      label={__('Text color')}
      active={current !== null}
      trigger={
        <span className="flex flex-col items-center leading-none">
          <Baseline size={13} />
          <span
            className="mt-px h-[3px] w-3 rounded-full"
            style={{ backgroundColor: current ?? 'currentColor' }}
          />
        </span>
      }
    >
      {(close) => (
        <div className="space-y-2">
          {brand.length > 0 && (
            <Swatches
              title={__('Brand palette')}
              colors={brand}
              current={current}
              onPick={(c) => {
                apply(c);
                close();
              }}
            />
          )}
          <Swatches
            title={__('Colors')}
            colors={STANDARD_COLORS}
            current={current}
            onPick={(c) => {
              apply(c);
              close();
            }}
          />
          <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2">
            <label className="flex items-center gap-1.5 text-[var(--text-secondary)]">
              <input
                type="color"
                className="!h-6 !w-7 !p-0.5"
                value={current ?? '#111827'}
                onChange={(e) => apply(e.target.value)}
              />
              {__('Custom')}
            </label>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              onClick={() => {
                editor.chain().focus().unsetColor().run();
                close();
              }}
            >
              {__('Default color')}
            </button>
          </div>
        </div>
      )}
    </ToolbarMenu>
  );
};

const Swatches: FC<{
  title: string;
  colors: string[];
  current: string | null;
  onPick: (color: string) => void;
}> = ({ title, colors, current, onPick }) => (
  <div>
    <span className="is-section-label mb-1 block">{title}</span>
    <div className="flex flex-wrap gap-1">
      {colors.map((color) => {
        const active = current !== null && toHex(color) === current;
        return (
          <button
            key={color}
            type="button"
            title={color}
            aria-label={color}
            onClick={() => onPick(color)}
            className={cn(
              'h-5 w-5 rounded-full ring-1 ring-inset transition-transform hover:scale-110',
              active ? 'ring-2 ring-[var(--accent)] ring-offset-1' : 'ring-[var(--border-strong)]',
            )}
            style={{ backgroundColor: color }}
          />
        );
      })}
    </div>
  </div>
);
