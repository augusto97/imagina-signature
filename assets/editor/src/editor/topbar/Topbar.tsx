import type { FC } from 'react';
import { Undo2, Redo2, LayoutTemplate, Code2 } from 'lucide-react';
import { useEditorStore } from '@/stores/editorStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';

interface TopbarProps {
  className?: string;
}

/**
 * Editor topbar — 48px high. Hosts undo/redo, the template picker
 * trigger, the save status indicator, and the export trigger.
 */
export const Topbar: FC<TopbarProps> = ({ className }) => {
  const { isSaving, isDirty, lastSavedAt } = usePersistenceStore();
  const openModal = useEditorStore((s) => s.openModal);
  const canUndo = useHistoryStore((s) => s.canUndo());
  const canRedo = useHistoryStore((s) => s.canRedo());
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);
  const schema = useSchemaStore((s) => s.schema);
  const setSchema = useSchemaStore((s) => s.setSchema);

  let status = __('Saved');
  if (isSaving) status = __('Saving…');
  else if (isDirty) status = __('Unsaved changes');
  else if (!lastSavedAt) status = __('Ready');

  const onUndo = () => {
    const previous = undo(schema);
    if (previous) setSchema(previous);
  };
  const onRedo = () => {
    const next = redo(schema);
    if (next) setSchema(next);
  };

  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center justify-between border-b border-[var(--border-default)] bg-[var(--bg-panel)] px-4',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          {__('Imagina Signatures')}
        </span>
        <div className="flex items-center gap-1">
          <IconButton title={__('Undo')} onClick={onUndo} disabled={!canUndo}>
            <Undo2 size={14} />
          </IconButton>
          <IconButton title={__('Redo')} onClick={onRedo} disabled={!canRedo}>
            <Redo2 size={14} />
          </IconButton>
          <IconButton
            title={__('Pick a template')}
            onClick={() => openModal('template-picker')}
          >
            <LayoutTemplate size={14} />
          </IconButton>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span aria-live="polite" className="text-xs text-[var(--text-secondary)]">
          {status}
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded bg-[var(--accent)] px-3 py-1 text-xs text-white hover:bg-[var(--accent-hover)]"
          onClick={() => openModal('export')}
        >
          <Code2 size={14} />
          {__('Export HTML')}
        </button>
      </div>
    </header>
  );
};

const IconButton: FC<{
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ title, onClick, disabled, children }) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    disabled={disabled}
    className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
  >
    {children}
  </button>
);
