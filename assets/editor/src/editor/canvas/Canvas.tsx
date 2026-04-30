import type { FC } from 'react';
import { __ } from '@/i18n/helpers';

interface CanvasProps {
  width?: number;
}

/**
 * Editor canvas placeholder.
 *
 * Sprint 4 ships an empty centred panel so the layout is verifiable
 * end-to-end. Sprint 5 wires in the schema store, the BlockRenderer,
 * selection / hover overlays, and the `is-canvas-root` styling.
 */
export const Canvas: FC<CanvasProps> = ({ width = 600 }) => {
  return (
    <main className="flex flex-1 flex-col items-center overflow-y-auto bg-[var(--bg-primary)] p-6">
      <div
        className="is-canvas-root border border-[var(--border-default)]"
        style={{ width, minHeight: 240, padding: 24 }}
      >
        <p className="text-center text-sm text-[var(--text-muted)]">
          {__('Drop blocks from the left sidebar to start your signature.')}
        </p>
      </div>
    </main>
  );
};
