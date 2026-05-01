import type { FC } from 'react';
import { Undo2, Redo2, LayoutTemplate, Code2, Eye, ArrowLeft, FileSignature } from 'lucide-react';
import { useEditorStore } from '@/stores/editorStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { getConfig } from '@/bridge/apiClient';
import { persistenceEngine } from '@/services/persistenceEngine';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { DeviceSwitcher } from './DeviceSwitcher';

/**
 * Editor topbar — three regions:
 *
 *  - Left:  back-to-dashboard link + plugin label (anchors the user).
 *  - Center: device switcher + undo/redo (canvas-affecting controls).
 *  - Right: save indicator + Preview + Export HTML.
 */
export const Topbar: FC<{ className?: string }> = ({ className }) => {
  const { isSaving, isDirty, lastSavedAt, lastError } = usePersistenceStore();
  const openModal = useEditorStore((s) => s.openModal);
  const canUndo = useHistoryStore((s) => s.canUndo());
  const canRedo = useHistoryStore((s) => s.canRedo());
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);
  const schema = useSchemaStore((s) => s.schema);
  const setSchema = useSchemaStore((s) => s.setSchema);

  let status = __('Saved');
  let statusTone = 'text-[var(--text-muted)]';
  if (lastError) {
    status = __('Save failed — click Save to retry');
    statusTone = 'text-[var(--danger)]';
  } else if (isSaving) {
    status = __('Saving…');
    statusTone = 'text-[var(--accent)]';
  } else if (isDirty) {
    status = __('Unsaved');
    statusTone = 'text-[var(--warning)]';
  } else if (!lastSavedAt) {
    status = __('Ready');
  }

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
        'flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--border-default)] bg-[var(--bg-panel)] px-5',
        className,
      )}
    >
      {/* Left: navigation back + brand */}
      <div className="flex min-w-0 items-center gap-3">
        <a
          href={getConfig().signaturesUrl}
          onClick={async (e) => {
            // Flush any pending / in-flight save BEFORE the browser
            // navigates and aborts the request. Without this, clicking
            // back during the 1500ms autosave debounce drops the user's
            // most recent edits.
            e.preventDefault();
            await persistenceEngine.flushNow();
            window.location.href = getConfig().signaturesUrl;
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title={__('Back to signatures')}
        >
          <ArrowLeft size={16} />
        </a>
        <div className="flex items-center gap-2 truncate">
          <span
            aria-hidden
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--accent)] text-white"
          >
            <FileSignature size={14} />
          </span>
          <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]">
            {__('Imagina Signatures')}
          </span>
        </div>
      </div>

      {/* Center: device switcher + history controls */}
      <div className="flex items-center gap-3">
        <DeviceSwitcher />
        <div className="inline-flex items-center gap-0.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] p-0.5">
          <IconButton title={__('Undo')} onClick={onUndo} disabled={!canUndo}>
            <Undo2 size={16} />
          </IconButton>
          <IconButton title={__('Redo')} onClick={onRedo} disabled={!canRedo}>
            <Redo2 size={16} />
          </IconButton>
        </div>
        <IconButton
          title={__('Pick a template')}
          onClick={() => openModal('template-picker')}
        >
          <LayoutTemplate size={16} />
        </IconButton>
      </div>

      {/* Right: status + actions */}
      <div className="flex items-center gap-2">
        <span aria-live="polite" className={cn('text-[12px] font-medium', statusTone)}>
          {status}
        </span>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] px-3 text-[12.5px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
          onClick={() => openModal('preview')}
        >
          <Eye size={14} />
          {__('Preview')}
        </button>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-[12.5px] font-medium text-white shadow-[var(--shadow-xs)] transition-colors hover:bg-[var(--accent-hover)]"
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
    className="inline-flex h-7 w-8 items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
  >
    {children}
  </button>
);
