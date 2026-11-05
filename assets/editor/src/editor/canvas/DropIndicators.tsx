import type { FC } from 'react';
import type { DropIndicatorPosition } from '@/stores/dropIndicatorStore';

/**
 * 2px accent line drawn above or below the block a drag would land
 * next to (CLAUDE.md §11.2). Absolutely positioned inside the
 * block's (relatively positioned) sortable wrapper and centred on the
 * block edge, so it never shifts layout.
 */
export const DropIndicator: FC<{ position: DropIndicatorPosition }> = ({ position }) => (
  <div
    aria-hidden
    data-imgsig-drop-indicator={position}
    className="pointer-events-none absolute left-0 right-0 z-30 h-0.5 rounded-full bg-[var(--accent)]"
    style={{
      [position === 'before' ? 'top' : 'bottom']: -1,
      boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.15)',
    }}
  >
    <span
      className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full border-2 border-[var(--accent)] bg-white"
    />
  </div>
);
