import { useMemo, useState, type FC } from 'react';
import { compileSignature } from '@/core/compiler/compile';
import { useSchemaStore } from '@/stores/schemaStore';
import { useEditorStore } from '@/stores/editorStore';
import { __ } from '@/i18n/helpers';
import { Modal } from '@/components/shared/Modal';

type PreviewClient = 'gmail' | 'outlook' | 'apple';

const CLIENT_LABELS: Record<PreviewClient, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  apple: 'Apple Mail',
};

/**
 * Multi-client preview modal — renders the compiled HTML inside an
 * `<iframe srcdoc>` so the email markup runs unaffected by the
 * editor's CSS. Per-client styling tweaks (max-width, font
 * substitution) approximate the rendering of each major client.
 *
 * This is approximation, not perfect emulation; cross-client visual
 * QA still belongs in real clients (CLAUDE.md §20.3).
 */
export const PreviewModal: FC = () => {
  const modal = useEditorStore((s) => s.modal);
  const closeModal = useEditorStore((s) => s.closeModal);
  const schema = useSchemaStore((s) => s.schema);

  const [client, setClient] = useState<PreviewClient>('gmail');

  const html = useMemo(
    () => (modal === 'preview' ? compileSignature(schema).html : ''),
    [modal, schema],
  );

  const open = modal === 'preview';

  // Per-client wrapper CSS — applied to the iframe srcdoc so the
  // inner email HTML stays untouched.
  const wrapperStyle: Record<PreviewClient, string> = {
    gmail: 'background:#f6f8fc;font-family:Roboto,Arial,sans-serif;padding:24px;',
    outlook: 'background:#ffffff;font-family:"Segoe UI",Arial,sans-serif;padding:24px;',
    apple: 'background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px;',
  };

  const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body style="${wrapperStyle[client]}">${html}</body></html>`;

  return (
    <Modal open={open} title={__('Preview')} onClose={closeModal} width={760}>
      <div className="space-y-3">
        <div className="flex gap-1 text-xs">
          {(['gmail', 'outlook', 'apple'] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={`rounded border px-2 py-1 ${
                client === id
                  ? 'border-[var(--accent)] bg-[var(--bg-selected)] text-[var(--accent)]'
                  : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
              onClick={() => setClient(id)}
            >
              {CLIENT_LABELS[id]}
            </button>
          ))}
        </div>
        <iframe
          title={__('Signature preview')}
          srcDoc={srcDoc}
          className="h-[60vh] w-full rounded border border-[var(--border-default)]"
          sandbox=""
        />
      </div>
    </Modal>
  );
};
