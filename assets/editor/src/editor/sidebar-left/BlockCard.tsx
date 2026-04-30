import type { FC } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { LucideIcon } from 'lucide-react';
import { useSchemaStore } from '@/stores/schemaStore';
import { getBlockDefinition } from '@/core/blocks/registry';
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
    if (definition) addBlock(definition.create());
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      className="flex cursor-grab flex-col items-center gap-1 rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-3 text-xs text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] active:cursor-grabbing"
      style={{ opacity: isDragging ? 0.5 : 1 }}
      onClick={handleClick}
      {...attributes}
      {...listeners}
    >
      <Icon size={20} />
      <span>{__(label)}</span>
    </button>
  );
};
