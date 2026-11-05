import { useMemo, useState, type FC } from 'react';
import { Monitor, Tablet, Smartphone, CheckCircle2 } from 'lucide-react';
import { compileSignature } from '@/core/compiler/compile';
import { CompileIssues } from './ExportModal';
import { DarkModeImageWarnings } from './preview/DarkModeImageWarnings';
import {
  buildPreviewDocument,
  mobileBehaviour,
  mobileScale,
  type PreviewClient,
  type PreviewDarkMode,
} from './preview/transforms';
import { useSchemaStore } from '@/stores/schemaStore';
import { useEditorStore } from '@/stores/editorStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { Modal } from '@/components/shared/Modal';

type PreviewDevice = 'desktop' | 'tablet' | 'mobile';

/** Labels are lazy so they translate at render time. */
const DEVICE_PRESETS: Record<
  PreviewDevice,
  { label: () => string; width: number; icon: typeof Monitor }
> = {
  desktop: { label: () => __('Desktop'), width: 720, icon: Monitor },
  tablet: { label: () => __('Tablet'), width: 480, icon: Tablet },
  mobile: { label: () => __('Mobile'), width: 360, icon: Smartphone },
};

const CLIENT_IDS: PreviewClient[] = ['gmail', 'outlook', 'apple'];

/** Wide enough for the preview + issues column, never wider than the window. */
function modalWidth(): number {
  return typeof window === 'undefined'
    ? 1040
    : Math.max(360, Math.min(1040, window.innerWidth - 32));
}

function clientLabel(client: PreviewClient, handheld: boolean): string {
  switch (client) {
    case 'gmail':
      return handheld ? __('Gmail app') : __('Gmail');
    case 'outlook':
      return handheld ? __('Outlook app') : __('Outlook for Windows');
    default:
      return handheld ? __('iOS Mail') : __('Apple Mail');
  }
}

function viewDescription(client: PreviewClient, handheld: boolean): string {
  if (client === 'gmail') {
    return __('Gmail removes the document head, style sheets and embedded (data:) images.');
  }
  if (client === 'outlook' && !handheld) {
    return __(
      'Outlook for Windows renders with Word: Outlook-only code is shown, rounded corners, max-width, inline-block and background images are ignored, buttons use their VML size.',
    );
  }
  if (client === 'outlook') {
    return __('The Outlook app keeps wide signatures at full size and scrolls sideways.');
  }
  return __('Apple Mail renders the signature as-is.');
}

/**
 * Multi-client + multi-device preview modal.
 *
 * The compiled email HTML runs inside a sandboxed `<iframe srcdoc>` so
 * it paints unaffected by the editor's own CSS. Each client tab applies
 * a pure transform approximating that client (see `preview/transforms`):
 *
 *  - **Gmail** strips `<head>` / `<style>` and data: images.
 *  - **Outlook for Windows** evaluates the `<!--[if mso]>` conditionals,
 *    draws VML buttons at their VML size and applies a Word-like
 *    stylesheet (no radius, max-width, inline-block, background images).
 *    On phone / tablet widths the tab becomes the Outlook app.
 *  - **Apple Mail** renders as-is.
 *
 * Device widths simulate the viewport: a 600 px signature in a 360 px
 * phone is shrunk to fit (Gmail app, iOS Mail) or scrolls sideways
 * (Outlook app). A dark-mode switch simulates full inversion and
 * partial (light backgrounds only) darkening.
 *
 * The issues list sits beside the preview; clicking an issue that
 * belongs to a block selects that block and closes the modal.
 */
export const PreviewModal: FC = () => {
  const modal = useEditorStore((s) => s.modal);
  const closeModal = useEditorStore((s) => s.closeModal);
  const schema = useSchemaStore((s) => s.schema);

  const [client, setClient] = useState<PreviewClient>('gmail');
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [darkMode, setDarkMode] = useState<PreviewDarkMode>('off');

  const open = modal === 'preview';
  const compiled = useMemo(() => (open ? compileSignature(schema) : null), [open, schema]);

  const handheld = device !== 'desktop';
  const viewportWidth = DEVICE_PRESETS[device].width;

  const srcDoc = useMemo(
    () =>
      compiled
        ? buildPreviewDocument({
            html: compiled.html,
            client,
            darkMode,
            viewportWidth,
            contentWidth: compiled.width,
            fluid: compiled.fluid,
            mobile: handheld,
          })
        : '',
    [compiled, client, darkMode, viewportWidth, handheld],
  );

  const scaled =
    compiled !== null &&
    handheld &&
    mobileScale(compiled.width, viewportWidth - 16, mobileBehaviour(client), compiled.fluid) < 1;

  const size = compiled?.size ?? 0;
  const sizeKb = (size / 1024).toFixed(1);
  const sizeWarn = size > 102 * 1024;

  const selectIssueBlock = (blockId: string): void => {
    useSelectionStore.getState().select(blockId);
    closeModal();
  };

  const hasIssues = (compiled?.issues.length ?? 0) > 0;

  return (
    <Modal open={open} title={__('Preview')} onClose={closeModal} width={modalWidth()}>
      <div className="flex flex-col gap-3">
        {/* Toolbar: client + device + dark mode + size */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
          <div className="flex gap-1" role="tablist" aria-label={__('Email client')}>
            {CLIENT_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={client === id}
                onClick={() => setClient(id)}
                className={cn(
                  'rounded-md border px-2.5 py-1 font-medium transition-colors',
                  client === id
                    ? 'border-[var(--accent)] bg-[var(--bg-selected)] text-[var(--accent)]'
                    : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
                )}
              >
                {clientLabel(id, handheld)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] p-0.5">
            {(['desktop', 'tablet', 'mobile'] as const).map((id) => {
              const { label: deviceLabel, icon: Icon } = DEVICE_PRESETS[id];
              const label = deviceLabel();
              const active = device === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDevice(id)}
                  title={label}
                  aria-pressed={active}
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

          <label className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--text-secondary)]">
            {__('Dark mode (simulation)')}
            <select
              value={darkMode}
              onChange={(e) => setDarkMode(e.target.value as PreviewDarkMode)}
              className="h-7 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] px-1.5 text-[11.5px] text-[var(--text-primary)]"
            >
              <option value="off">{__('Off')}</option>
              <option value="full">{__('Full inversion (Gmail iOS / Outlook app)')}</option>
              <option value="partial">{__('Partial (Outlook.com / Apple Mail)')}</option>
            </select>
          </label>

          <span
            className={cn(
              'rounded-full px-2 py-0.5 font-mono text-[10.5px]',
              sizeWarn
                ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                : 'bg-slate-100 text-slate-600',
            )}
            title={
              sizeWarn ? __('Gmail clips messages larger than 102 KB.') : __('HTML payload size.')
            }
          >
            {__('%s KB', sizeKb)}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]">
          {/* Iframe — width locked by device preset, centred */}
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="overflow-x-auto rounded-md bg-slate-100 p-3">
              <iframe
                title={__('Signature preview')}
                srcDoc={srcDoc}
                sandbox=""
                className="mx-auto block h-[60vh] rounded border border-[var(--border-default)] bg-white"
                style={{
                  width: viewportWidth,
                  maxWidth: device === 'desktop' ? '100%' : undefined,
                }}
              />
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
              <span className="font-semibold">{__('Simulation.')}</span>{' '}
              {viewDescription(client, handheld)}
              {scaled && ` ${__('Shrunk to fit the screen, as this app does.')}`}
              {darkMode === 'full' &&
                ` ${__('Full inversion: every colour is inverted except images.')}`}
              {darkMode === 'partial' &&
                ` ${__('Partial: light backgrounds are darkened and dark text lightened; dark backgrounds and images stay.')}`}{' '}
              {__('Always confirm in the real client before rolling the signature out.')}
            </p>
          </div>

          {/* Issues beside the preview */}
          <aside className="flex min-w-0 flex-col gap-2" aria-label={__('Issues')}>
            <h3 className="text-[12px] font-semibold text-[var(--text-primary)]">{__('Issues')}</h3>
            {compiled && (
              <>
                <CompileIssues issues={compiled.issues} onSelect={selectIssueBlock} expanded />
                <DarkModeImageWarnings images={compiled.images} enabled={open} />
              </>
            )}
            {compiled && !hasIssues && (
              <p className="flex items-center gap-1.5 text-[11.5px] text-emerald-700">
                <CheckCircle2 size={13} />
                {__('No problems found.')}
              </p>
            )}
            {hasIssues && (
              <p className="text-[11px] text-[var(--text-muted)]">
                {__('Click an underlined issue to select its block.')}
              </p>
            )}
          </aside>
        </div>
      </div>
    </Modal>
  );
};
