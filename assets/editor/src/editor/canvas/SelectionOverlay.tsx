import type { FC, ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface Props {
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  children: ReactNode;
}

/**
 * Wraps a block with the selection / hover outline.
 *
 * The outline is drawn as a positioned `::before`-style absolutely-
 * placed div instead of a border on the wrapper itself so it doesn't
 * mess with the table-based block layout below.
 */
export const SelectionOverlay: FC<Props> = ({
  selected,
  hovered,
  onSelect,
  onHoverEnter,
  onHoverLeave,
  children,
}) => {
  return (
    <div
      className="relative"
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {children}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 rounded-sm transition-shadow',
          selected
            ? 'ring-2 ring-[var(--border-selected)]'
            : hovered
              ? 'ring-1 ring-[var(--border-default)]'
              : '',
        )}
      />
    </div>
  );
};
