import type { FC } from 'react';
import { useSchemaStore } from '@/stores/schemaStore';
import { __ } from '@/i18n/helpers';

/**
 * Sidebar contents shown when nothing is selected — controls global
 * canvas attributes (width, default font, background, etc.).
 */
export const CanvasProperties: FC = () => {
  const canvas = useSchemaStore((s) => s.schema.canvas);
  const updateCanvas = useSchemaStore((s) => s.updateCanvas);

  return (
    <div className="space-y-3 text-xs">
      <label className="block">
        <span className="mb-1 block text-[var(--text-secondary)]">{__('Canvas width (px)')}</span>
        <input
          type="number"
          min={320}
          max={800}
          className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
          value={canvas.width}
          onChange={(e) => updateCanvas({ width: Number(e.target.value) || 600 })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[var(--text-secondary)]">{__('Background')}</span>
        <input
          type="color"
          className="h-8 w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)]"
          value={canvas.background_color}
          onChange={(e) => updateCanvas({ background_color: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[var(--text-secondary)]">{__('Default text colour')}</span>
        <input
          type="color"
          className="h-8 w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)]"
          value={canvas.text_color}
          onChange={(e) => updateCanvas({ text_color: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[var(--text-secondary)]">{__('Default link colour')}</span>
        <input
          type="color"
          className="h-8 w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)]"
          value={canvas.link_color}
          onChange={(e) => updateCanvas({ link_color: e.target.value })}
        />
      </label>
    </div>
  );
};
