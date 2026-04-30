import type { FC } from 'react';
import { Eye, EyeOff, Layers } from 'lucide-react';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { rendererForBlock } from '@/core/blocks/registry';
import type { Block } from '@/core/schema/blocks';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';

/**
 * Layers panel — flat list of every block on the canvas.
 *
 * Each row shows the block's registered icon + label, the user's
 * custom label (best-guess: first words of text content / image alt /
 * social link, falls back to the block type), and a visibility toggle
 * that flips `block.visible`.
 *
 * Clicking a row selects the block (mirrors the canvas SelectionOverlay
 * behaviour). Hover does the same — keeps the canvas overlay in sync
 * so it's easy to see "which block am I about to click on the layers
 * panel".
 *
 * Drag-to-reorder isn't wired in this panel yet (the canvas already
 * supports it via dnd-kit; surfacing it here too is a future
 * iteration). Nested children (Container) also fall to a flat
 * rendering for now.
 */
export const LayersPanel: FC = () => {
  const blocks = useSchemaStore((s) => s.schema.blocks);
  const updateBlock = useSchemaStore((s) => s.updateBlock);
  const { selectedBlockId, hoveredBlockId, select, hover } = useSelectionStore();

  if (blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-[var(--border-strong)] text-[var(--text-muted)]">
          <Layers size={16} strokeWidth={1.6} />
        </span>
        <p className="text-[12px] font-medium text-[var(--text-secondary)]">
          {__('No layers yet')}
        </p>
        <p className="text-[11px] text-[var(--text-muted)]">
          {__('Add blocks from the Blocks tab and they appear here.')}
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5 p-2">
      {blocks.map((block) => {
        const def = rendererForBlock(block);
        const Icon = def?.icon;
        const isSelected = block.id === selectedBlockId;
        const isHovered = block.id === hoveredBlockId;
        const visible = block.visible !== false;

        return (
          <li key={block.id}>
            <div
              className={cn(
                'group flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors',
                isSelected
                  ? 'bg-[var(--bg-selected)] text-[var(--accent)]'
                  : isHovered
                    ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                !visible && 'opacity-50',
              )}
              onMouseEnter={() => hover(block.id)}
              onMouseLeave={() => hover(null)}
            >
              <button
                type="button"
                className="flex flex-1 items-center gap-2 truncate text-left"
                onClick={() => select(block.id)}
              >
                {Icon && (
                  <Icon
                    size={13}
                    strokeWidth={1.8}
                    className={cn(
                      isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]',
                    )}
                  />
                )}
                <span className="truncate font-medium">
                  {def?.label ?? block.type}
                </span>
                <span className="ml-1 truncate text-[11px] font-normal text-[var(--text-muted)]">
                  {labelForBlock(block)}
                </span>
              </button>
              <button
                type="button"
                title={visible ? __('Hide') : __('Show')}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--bg-panel)] hover:text-[var(--text-secondary)] group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  updateBlock(block.id, { visible: !visible });
                }}
                style={{ opacity: visible ? undefined : 1 }}
              >
                {visible ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

/**
 * Best-effort short label for the layer row.
 *
 * Returns the first ~30 chars of content / alt / first social URL,
 * falling back to nothing when the block type doesn't expose any
 * obvious user-facing string.
 */
function labelForBlock(block: Block): string {
  let raw = '';
  switch (block.type) {
    case 'text':
    case 'heading':
    case 'disclaimer':
      raw = stripHtml((block as { content: string }).content);
      break;
    case 'image':
    case 'avatar':
      raw = (block as { alt?: string }).alt ?? '';
      break;
    case 'button_cta':
      raw = (block as { label: string }).label;
      break;
    case 'social_icons': {
      const networks = (block as { networks: Array<{ platform: string }> }).networks;
      raw = networks.map((n) => n.platform).join(', ');
      break;
    }
    case 'contact_row': {
      const rows = (block as { rows: Array<{ icon: string }> }).rows;
      raw = rows.map((r) => r.icon).join(' · ');
      break;
    }
    default:
      raw = '';
  }
  if (!raw) return '';
  return raw.length > 30 ? `${raw.slice(0, 28)}…` : raw;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}
