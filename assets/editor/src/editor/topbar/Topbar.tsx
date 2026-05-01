import { useState, type FC } from 'react';
import {
  Undo2,
  Redo2,
  LayoutTemplate,
  Code2,
  Eye,
  ArrowLeft,
  FileSignature,
  Bookmark,
  Save,
  AlertTriangle,
  Loader2,
  Check,
} from 'lucide-react';
import { useEditorStore } from '@/stores/editorStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { useToastStore } from '@/stores/toastStore';
import { getConfig } from '@/bridge/apiClient';
import { persistence } from '@/services/persistence';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { DeviceSwitcher } from './DeviceSwitcher';

/**
 * Compile-time version baked into the bundle by Vite (`define`
 * config reads `IMGSIG_VERSION` from the PHP main file). The runtime
 * `IMGSIG_EDITOR_CONFIG.pluginVersion` is the version PHP just
 * served with this request — they should match. When they don't,
 * the user's browser is serving a cached bundle from a previous
 * release, which is the #1 reason "your fixes aren't landing".
 */
const BUNDLE_VERSION = __BUNDLE_VERSION__;

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
  const showToast = useToastStore((s) => s.show);
  const [manualSaving, setManualSaving] = useState(false);

  const onManualSave = async (): Promise<void> => {
    if (manualSaving) return;
    setManualSaving(true);
    try {
      const id = await persistence.saveNow();
      if (id > 0) {
        showToast(__('Saved'), 'success');
      } else {
        showToast(__('Nothing to save yet — add a block first.'), 'info');
      }
    } catch {
      // Errors already surfaced as a toast inside the engine.
    } finally {
      setManualSaving(false);
    }
  };

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
            await persistence.saveNow();
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
          <VersionPill />
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

      {/* Right: save state + actions */}
      <div className="flex items-center gap-2">
        <SaveButton
          onClick={() => void onManualSave()}
          isSaving={isSaving || manualSaving}
          isDirty={isDirty}
          hasError={Boolean(lastError)}
          lastSavedAt={lastSavedAt}
        />
        {getConfig().capabilities?.manage_templates && (
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] px-3 text-[12.5px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
            onClick={() => openModal('save-as-template')}
            title={__('Save the current canvas as a global template')}
          >
            <Bookmark size={14} />
            {__('Save as template')}
          </button>
        )}
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

interface SaveButtonProps {
  onClick: () => void;
  isSaving: boolean;
  isDirty: boolean;
  hasError: boolean;
  lastSavedAt: string | null;
}

/**
 * Manual save button. Five visual states, picked in priority order:
 *   1. Saving — spinner, disabled.
 *   2. Error — red, "Retry save".
 *   3. Dirty — accent blue, "Save".
 *   4. Saved with timestamp — subtle, "Saved · 14:32".
 *   5. Idle (never saved yet) — outline, "Save".
 *
 * Click in every state runs `persistence.saveNow()` (the
 * Topbar host wires it). Cmd/Ctrl + S calls the same path via the
 * keyboard shortcut hook — this button is the visible counterpart
 * so the user always has a clear "I'm done" lever.
 */
const SaveButton: FC<SaveButtonProps> = ({ onClick, isSaving, isDirty, hasError, lastSavedAt }) => {
  let label = __('Save');
  let icon: React.ReactNode = <Save size={14} />;
  let tone =
    'border-[var(--border-default)] bg-[var(--bg-panel)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]';

  if (isSaving) {
    label = __('Saving…');
    icon = <Loader2 size={14} className="animate-spin" />;
    tone = 'border-[var(--accent)]/30 bg-[var(--bg-selected)] text-[var(--accent)] cursor-wait';
  } else if (hasError) {
    label = __('Retry save');
    icon = <AlertTriangle size={14} />;
    tone = 'border-[var(--danger)]/40 bg-red-50 text-[var(--danger)] hover:bg-red-100';
  } else if (isDirty) {
    label = __('Save');
    icon = <Save size={14} />;
    tone =
      'border-transparent bg-[var(--accent)] text-white shadow-[var(--shadow-xs)] hover:bg-[var(--accent-hover)]';
  } else if (lastSavedAt) {
    label = __('Saved · %s', formatTime(lastSavedAt));
    icon = <Check size={14} />;
    tone = 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isSaving}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed',
        tone,
      )}
      title={__('Save now (Cmd/Ctrl + S)')}
    >
      {icon}
      {label}
    </button>
  );
};

function formatTime(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/**
 * Plugin version pill. Two version sources:
 *
 *   - `BUNDLE_VERSION` — baked into the JS bundle at build time
 *     (Vite reads `IMGSIG_VERSION` from the PHP main file).
 *   - `getConfig().pluginVersion` — what PHP just served with
 *     this request.
 *
 * When they match, it's a quiet grey pill. When they don't, it
 * means the user's browser served a cached bundle from a previous
 * release while the plugin itself was upgraded — and that's the
 * #1 reason past "fixes" appeared not to land. Surface it loudly:
 * red pill with a hard-refresh CTA. Click reloads with cache
 * bypass via `window.location.reload()` after a query-string
 * cache-bust.
 */
const VersionPill: FC = () => {
  let runtimeVersion = '0.0.0';
  try {
    runtimeVersion = getConfig().pluginVersion ?? '0.0.0';
  } catch {
    // Bootstrap missing — leave as 0.0.0; the mismatch view kicks in.
  }
  const stale = runtimeVersion !== BUNDLE_VERSION;

  if (!stale) {
    return (
      <span
        className="rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-slate-500"
        title={__('Plugin version (PHP and JS bundle agree).')}
      >
        v{runtimeVersion}
      </span>
    );
  }

  const reload = (): void => {
    // Append a unique query string so even an aggressive CDN /
    // page-cache layer can't serve the same response we just
    // received. The browser will fetch the new HTML, which links
    // to the freshly-hashed bundle filenames.
    const url = new URL(window.location.href);
    url.searchParams.set('imgsig_cache_bust', String(Date.now()));
    window.location.href = url.toString();
  };

  return (
    <button
      type="button"
      onClick={reload}
      title={__(
        'Stale bundle detected. The plugin is on PHP %s but your browser is running JS %s. Click to hard-refresh.',
        runtimeVersion,
        BUNDLE_VERSION,
      )}
      className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-[var(--danger)] ring-1 ring-inset ring-red-200 transition-colors hover:bg-red-100"
    >
      v{BUNDLE_VERSION} → {runtimeVersion} ↻
    </button>
  );
};
