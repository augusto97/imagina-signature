import { useMemo, useState, type FC } from 'react';
import { compileSignature } from '@/core/compiler/compile';
import { useSchemaStore } from '@/stores/schemaStore';
import { useEditorStore } from '@/stores/editorStore';
import { __ } from '@/i18n/helpers';
import { Modal } from '@/components/shared/Modal';

/**
 * Export modal — runs the compile pipeline and lets the user copy
 * the HTML or download it as a `.html` file. Surfaces compile-time
 * warnings (Gmail clipping, missing alt / width / href) so the
 * user knows about subtle rendering issues before pasting into
 * their email client.
 */
export const ExportModal: FC = () => {
  const modal = useEditorStore((s) => s.modal);
  const closeModal = useEditorStore((s) => s.closeModal);
  const schema = useSchemaStore((s) => s.schema);

  const [copied, setCopied] = useState(false);

  const result = useMemo(
    () => (modal === 'export' ? compileSignature(schema) : null),
    [modal, schema],
  );

  const open = modal === 'export';

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.html);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    if (!result) return;
    const blob = new Blob([result.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'signature.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal open={open} title={__('Export HTML')} onClose={closeModal} width={680}>
      {result && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded bg-[var(--accent)] px-3 py-1.5 text-white hover:bg-[var(--accent-hover)]"
              onClick={copy}
            >
              {copied ? __('Copied!') : __('Copy HTML')}
            </button>
            <button
              type="button"
              className="rounded border border-[var(--border-default)] px-3 py-1.5 text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              onClick={download}
            >
              {__('Download .html')}
            </button>
            <span className="text-xs text-[var(--text-muted)]">
              {__('Size: %s bytes', String(result.size))}
            </span>
          </div>

          {result.warnings.length > 0 && (
            <div className="rounded border border-yellow-300 bg-yellow-50 p-2 text-xs text-yellow-800">
              <div className="mb-1 font-semibold">{__('Warnings')}</div>
              <ul className="list-disc space-y-0.5 pl-4">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <pre className="max-h-[40vh] overflow-auto rounded bg-[var(--bg-hover)] p-2 font-mono text-[10px] leading-snug text-[var(--text-secondary)]">
            {result.html}
          </pre>
        </div>
      )}
    </Modal>
  );
};
