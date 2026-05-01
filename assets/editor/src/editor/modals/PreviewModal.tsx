import { useMemo, useState, type FC } from 'react';
import { Monitor, Tablet, Smartphone } from 'lucide-react';
import { compileSignature } from '@/core/compiler/compile';
import { useSchemaStore } from '@/stores/schemaStore';
import { useEditorStore } from '@/stores/editorStore';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { Modal } from '@/components/shared/Modal';

type PreviewClient = 'gmail' | 'outlook' | 'apple';
type PreviewDevice = 'desktop' | 'tablet' | 'mobile';

const CLIENT_LABELS: Record<PreviewClient, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  apple: 'Apple Mail',
};

const DEVICE_PRESETS: Record<PreviewDevice, { label: string; width: number; icon: typeof Monitor }> = {
  desktop: { label: 'Desktop', width: 720, icon: Monitor },
  tablet: { label: 'Tablet', width: 480, icon: Tablet },
  mobile: { label: 'Mobile', width: 360, icon: Smartphone },
};

/**
 * Multi-client + multi-device preview modal.
 *
 * The compiled email HTML runs inside an `<iframe srcdoc>` so it
 * paints unaffected by the editor's own CSS. Two axes:
 *
 *  - **Client wrapper** — per-client font + background approximate
 *    Gmail / Outlook / Apple Mail surroundings. Approximation only;
 *    cross-client QA still belongs in real clients (CLAUDE.md §20.3).
 *  - **Device width** — Desktop (720px), Tablet (480px), Mobile
 *    (360px) lock the iframe width so the user can verify the
 *    signature reflows / clips correctly at each breakpoint.
 *
 * A small inspection bar above the iframe surfaces the compiled
 * HTML size and any compile warnings (Gmail clipping > 102KB,
 * missing alt / width / href, undefined variables).
 */
export const PreviewModal: FC = () => {
  const modal = useEditorStore((s) => s.modal);
  const closeModal = useEditorStore((s) => s.closeModal);
  const schema = useSchemaStore((s) => s.schema);

  const [client, setClient] = useState<PreviewClient>('gmail');
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  const compiled = useMemo(
    () =>
      modal === 'preview'
        ? compileSignature(schema)
        : { html: '', warnings: [], size: 0 },
    [modal, schema],
  );

  const open = modal === 'preview';

  const wrapperStyle: Record<PreviewClient, string> = {
    gmail: 'background:#f6f8fc;font-family:Roboto,Arial,sans-serif;padding:24px;',
    outlook: 'background:#ffffff;font-family:"Segoe UI",Arial,sans-serif;padding:24px;',
    apple: 'background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px;',
  };

  const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body style="${wrapperStyle[client]}">${compiled.html}</body></html>`;

  const sizeKb = (compiled.size / 1024).toFixed(1);
  const sizeWarn = compiled.size > 102 * 1024;

  return (
    <Modal open={open} title={__('Preview')} onClose={closeModal} width={840}>
      <div className="flex flex-col gap-3">
        {/* Toolbar: client + device + size */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
          <div className="flex gap-1">
            {(['gmail', 'outlook', 'apple'] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setClient(id)}
                className={cn(
                  'rounded-md border px-2.5 py-1 font-medium transition-colors',
                  client === id
                    ? 'border-[var(--accent)] bg-[var(--bg-selected)] text-[var(--accent)]'
                    : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
                )}
              >
                {CLIENT_LABELS[id]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] p-0.5">
            {(['desktop', 'tablet', 'mobile'] as const).map((id) => {
              const { label, icon: Icon } = DEVICE_PRESETS[id];
              const active = device === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDevice(id)}
                  title={label}
                  className={cn(
                    'inline-flex h-6 items-center gap-1 rounded px-2 transition-colors',
                    active
                      ? 'bg-[var(--bg-selected)] text-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
                  )}
                >
                  <Icon size={12} />
                  <span className="text-[11px]">{label}</span>
                </button>
              );
            })}
          </div>

          <span
            className={cn(
              'rounded-full px-2 py-0.5 font-mono text-[10.5px]',
              sizeWarn
                ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                : 'bg-slate-100 text-slate-600',
            )}
            title={
              sizeWarn
                ? __('Gmail clips messages larger than 102 KB.')
                : __('HTML payload size.')
            }
          >
            {sizeKb} KB
          </span>
        </div>

        {/* Iframe — width locked by device preset, centred */}
        <div className="rounded-md bg-slate-100 p-3">
          <iframe
            title={__('Signature preview')}
            srcDoc={srcDoc}
            sandbox=""
            className="mx-auto block h-[55vh] rounded border border-[var(--border-default)] bg-white"
            style={{ width: DEVICE_PRESETS[device].width, maxWidth: '100%' }}
          />
        </div>

        {/* Compile warnings */}
        {compiled.warnings.length > 0 && (
          <details className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
            <summary className="cursor-pointer font-medium">
              {__('%s compile warning(s)', String(compiled.warnings.length))}
            </summary>
            <ul className="mt-2 list-disc pl-4">
              {compiled.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Modal>
  );
};
