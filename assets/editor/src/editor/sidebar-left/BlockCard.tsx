import type { FC } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { LucideIcon } from 'lucide-react';
import { useSchemaStore } from '@/stores/schemaStore';
import { getBlockDefinition } from '@/core/blocks/registry';
import type { Block } from '@/core/schema/blocks';
import { __ } from '@/i18n/helpers';

interface Props {
  type: string;
  label: string;
  icon: LucideIcon;
}

/**
 * One library card.
 *
 * Click  → append the block at the end (low-friction default).
 * Drag   → drop onto a precise position via dnd-kit; the data payload
 *          carries `{ source: 'library', blockType }` so the shared
 *          drag handler in {@link useDragAndDrop} knows how to route
 *          the drop.
 */
export const BlockCard: FC<Props> = ({ type, label, icon: Icon }) => {
  const addBlock = useSchemaStore((s) => s.addBlock);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `library-${type}`,
    data: { source: 'library', blockType: type },
  });

  const handleClick = () => {
    const definition = getBlockDefinition(type);
    if (definition) addBlock(definition.create() as Block);
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      className="group flex aspect-[4/3] cursor-grab flex-col items-center justify-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] px-2 py-3 text-[11px] font-medium text-[var(--text-secondary)] transition-all duration-150 hover:-translate-y-px hover:border-[var(--accent)] hover:bg-[var(--bg-selected)] hover:text-[var(--accent)] hover:shadow-sm active:cursor-grabbing"
      style={{ opacity: isDragging ? 0.4 : 1 }}
      onClick={handleClick}
      {...attributes}
      {...listeners}
    >
      <Icon size={20} strokeWidth={1.6} className="text-[var(--text-secondary)] transition-colors group-hover:text-[var(--accent)]" />
      <span className="text-[11px]">{__(label)}</span>
    </button>
  );
};
