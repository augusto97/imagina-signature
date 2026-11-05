import { useState, type FC } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@admin/components/Button';
import { __ } from '@admin/i18n';
import type { RecompileProgress } from './recompile';

interface Props {
  progress: RecompileProgress;
  onCancel: () => void;
  onDismiss: () => void;
}

/** Progress of "Recompile outdated": bar, counts, cancel, and the rows that failed. */
export const RecompilePanel: FC<Props> = ({ progress, onCancel, onDismiss }) => {
  const [showErrors, setShowErrors] = useState(true);
  const percent =
    progress.total > 0
      ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
      : 100;

  let status: string;
  if (progress.running) {
    status = __('Recompiling %1$s of %2$s…', String(progress.processed), String(progress.total));
  } else if (progress.cancelled) {
    status = __('Stopped after %1$s of %2$s.', String(progress.processed), String(progress.total));
  } else {
    status = __('Done: %s recompiled.', String(progress.succeeded));
  }

  return (
    <section
      aria-label={__('Recompile outdated signatures')}
      className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] p-4 shadow-[var(--shadow-xs)]"
    >
      <div className="flex flex-wrap items-center gap-3">
        <RefreshCw
          size={15}
          className={
            progress.running ? 'animate-spin text-[var(--accent)]' : 'text-[var(--accent)]'
          }
          aria-hidden
        />
        <p className="min-w-0 flex-1 text-[13px] text-[var(--text-primary)]" aria-live="polite">
          {status}
          {progress.failed > 0 && (
            <span className="ml-2 text-[var(--danger)]">
              {__('%s failed', String(progress.failed))}
            </span>
          )}
        </p>
        {progress.running ? (
          <Button size="sm" variant="secondary" onClick={onCancel}>
            {__('Cancel')}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            {__('Close')}
          </Button>
        )}
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--bg-panel-soft)] ring-1 ring-inset ring-[var(--border-default)]"
        role="progressbar"
        aria-label={__('Progress')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      {progress.errors.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--danger)]"
            onClick={() => setShowErrors((v) => !v)}
            aria-expanded={showErrors}
          >
            <AlertTriangle size={13} aria-hidden />
            {showErrors ? __('Hide the errors') : __('Show the errors')}
          </button>
          {showErrors && (
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-[12px]">
              {progress.errors.map((e) => (
                <li key={e.signatureId} className="flex flex-wrap gap-x-2">
                  <span className="font-medium text-[var(--text-primary)]">
                    {e.name || __('Signature #%s', String(e.signatureId))}
                  </span>
                  <span className="text-[var(--text-secondary)]">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
