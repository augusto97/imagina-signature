import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react';
import {
  Check,
  Copy,
  Download,
  Mail,
  ExternalLink,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { compileSignature } from '@/core/compiler/compile';
import { useSchemaStore } from '@/stores/schemaStore';
import { useEditorStore } from '@/stores/editorStore';
import { apiCall, ApiError } from '@/bridge/apiClient';
import { useToastStore } from '@/stores/toastStore';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { Modal } from '@/components/shared/Modal';

/**
 * Export modal — three-stage flow:
 *
 *  1. Compile the signature and surface size + warnings.
 *  2. Big "Copy HTML" / "Send to my email" actions for the easy
 *     paths.
 *  3. Per-client install tabs with deep-links to the right settings
 *     screen and numbered paste-here steps. This is the path real
 *     users take — competitors that push OAuth admit (in their own
 *     usage data) that 80%+ of installations are still copy / paste.
 */
type Client = 'gmail' | 'outlook-web' | 'outlook-desktop' | 'apple-mail' | 'thunderbird';

const CLIENTS: Array<{
  id: Client;
  label: string;
  deepLink?: string;
  steps: string[];
}> = [
  {
    id: 'gmail',
    label: 'Gmail',
    deepLink: 'https://mail.google.com/mail/u/0/#settings/general',
    steps: [
      'Click the link above (Gmail opens on the General settings tab in a new window).',
      'Scroll to the "Signature" section.',
      'Click "Create new" to add a signature, give it a name, then click into the editor.',
      'Paste the HTML you just copied (Cmd/Ctrl + V).',
      'Pick the new signature in the "For new emails use" dropdown, then "Save changes" at the bottom.',
    ],
  },
  {
    id: 'outlook-web',
    label: 'Outlook Web',
    deepLink: 'https://outlook.live.com/mail/0/options/mail/messageContent',
    steps: [
      'Click the link above to open Outlook on the web on the message-content settings page.',
      'Under "Email signature", click "+ New signature" and give it a name.',
      'Click into the rich-text area and paste (Cmd/Ctrl + V).',
      'Set it as your default signature for new messages and replies if you want.',
      'Click "Save".',
    ],
  },
  {
    id: 'outlook-desktop',
    label: 'Outlook Desktop',
    steps: [
      'Open Outlook → File → Options → Mail → Signatures…',
      'Click "New", give the signature a name, click "OK".',
      'Click into the editor area at the bottom and paste (Cmd/Ctrl + V).',
      'Pick the signature for "New messages" and "Replies/forwards" if you want it default.',
      'Click "OK" twice. Outlook 2007–2019 will freeze any animated GIFs on the first frame — the editor offers a static-fallback URL field to handle that gracefully.',
    ],
  },
  {
    id: 'apple-mail',
    label: 'Apple Mail',
    steps: [
      'Open Mail → Settings… → Signatures.',
      'Pick the email account on the left, click "+" to add a new signature, give it a name.',
      'Click into the editor on the right and paste (Cmd + V).',
      'Tip: Apple Mail strips inline `<style>` blocks but keeps inline styles — our compiler emits inline styles only, so the layout survives.',
      'If images don\'t show, untick "Always match my default message font" in the same panel.',
    ],
  },
  {
    id: 'thunderbird',
    label: 'Thunderbird',
    steps: [
      'Open Thunderbird → Account Settings → pick your account on the left.',
      'Tick "Use HTML (e.g. <b>bold</b>)" under the Signature text area.',
      'Save the HTML to a `.html` file (use the "Download .html" button above).',
      'Tick "Attach the signature from a file instead" and choose the file.',
      'Click "OK". Thunderbird re-reads the file each send so editing the file updates every future email.',
    ],
  },
];

export const ExportModal: FC = () => {
  const modal = useEditorStore((s) => s.modal);
  const closeModal = useEditorStore((s) => s.closeModal);
  const schema = useSchemaStore((s) => s.schema);
  const showToast = useToastStore((s) => s.show);

  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [client, setClient] = useState<Client>('gmail');

  const result = useMemo(
    () => (modal === 'export' ? compileSignature(schema) : null),
    [modal, schema],
  );

  const open = modal === 'export';

  useEffect(() => {
    if (open) {
      setCopied(false);
      setSending(false);
      setSentTo(null);
      setClient('gmail');
    }
  }, [open]);

  const copy = async (): Promise<void> => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.html);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(__('Could not copy — try selecting the HTML below manually.'), 'error');
    }
  };

  const download = (): void => {
    if (!result) return;
    const blob = new Blob([result.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'signature.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const sendToEmail = async (): Promise<void> => {
    if (!result || sending) return;
    setSending(true);
    try {
      const resp = await apiCall<{ sent: boolean; recipient: string }>(
        '/signatures/test-send',
        {
          method: 'POST',
          body: { html: result.html },
        },
      );
      setSentTo(resp.recipient);
      showToast(__('Sent to %s', resp.recipient), 'success');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      showToast(__('Could not send: %s', msg), 'error');
    } finally {
      setSending(false);
    }
  };

  const sizeKb = result ? (result.size / 1024).toFixed(1) : '0';
  const oversize = result ? result.size > 102 * 1024 : false;
  const activeClient = CLIENTS.find((c) => c.id === client) ?? CLIENTS[0]!;

  return (
    <Modal open={open} title={__('Export & install')} onClose={closeModal} width={760}>
      {result && (
        <div className="flex flex-col gap-4 text-[13px]">
          {/* Action row */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-3">
            <button
              type="button"
              onClick={copy}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-md px-4 font-medium transition-colors',
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
              )}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? __('Copied!') : __('Copy HTML')}
            </button>

            <button
              type="button"
              onClick={() => void sendToEmail()}
              disabled={sending}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] px-4 font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
              title={__('Sends the compiled HTML to your WP account email so you can copy it from your real client.')}
            >
              <Mail size={14} />
              {sending ? __('Sending…') : sentTo ? __('Sent!') : __('Send to my email')}
            </button>

            <button
              type="button"
              onClick={download}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] px-3 font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              <Download size={14} />
              {__('Download .html')}
            </button>

            <span className="ml-auto inline-flex items-center gap-2 text-[11.5px] text-[var(--text-muted)]">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 font-mono',
                  oversize
                    ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                    : 'bg-slate-100 text-slate-600',
                )}
                title={
                  oversize
                    ? __('Gmail clips messages over 102 KB. Trim images / banners.')
                    : __('Compiled HTML payload size.')
                }
              >
                {sizeKb} KB
              </span>
            </span>
          </div>

          {result.warnings.length > 0 && (
            <details className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
              <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
                <AlertTriangle size={12} />
                {__('%s compile warning(s)', String(result.warnings.length))}
              </summary>
              <ul className="mt-2 list-disc pl-4">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}

          {/* Install guides */}
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)]">
            <header className="border-b border-[var(--border-default)] px-4 py-2.5">
              <div className="text-[12.5px] font-semibold text-[var(--text-primary)]">
                {__('Install in your email client')}
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                {__('Copy the HTML above first, then follow the steps for your client.')}
              </p>
            </header>

            <div className="flex flex-wrap gap-1 border-b border-[var(--border-default)] bg-[var(--bg-panel-soft)] px-3 py-2">
              {CLIENTS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setClient(c.id)}
                  className={cn(
                    'h-7 rounded-md px-2.5 text-[11.5px] font-medium transition-colors',
                    client === c.id
                      ? 'bg-[var(--bg-selected)] text-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="space-y-3 px-4 py-3">
              {activeClient.deepLink && (
                <a
                  href={activeClient.deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--accent)]/30 bg-[var(--bg-selected)] px-3 text-[12px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/15"
                >
                  {__('Open %s settings', activeClient.label)}
                  <ExternalLink size={12} />
                </a>
              )}

              <ol className="flex flex-col gap-1.5 text-[12.5px] text-[var(--text-secondary)]">
                {activeClient.steps.map((step, i) => (
                  <Step key={i} number={i + 1}>
                    {step}
                  </Step>
                ))}
              </ol>
            </div>
          </div>

          {/* Raw HTML, collapsed by default */}
          <details>
            <summary className="cursor-pointer text-[11.5px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
              {__('Show raw HTML')}
            </summary>
            <pre className="mt-2 max-h-[30vh] overflow-auto rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-3 font-mono text-[10.5px] leading-snug text-[var(--text-secondary)]">
              {result.html}
            </pre>
          </details>
        </div>
      )}
    </Modal>
  );
};

const Step: FC<{ number: number; children: ReactNode }> = ({ number, children }) => (
  <li className="flex items-start gap-2">
    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--bg-panel-soft)] text-[10.5px] font-semibold text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-default)]">
      {number}
    </span>
    <span className="flex-1 leading-relaxed">{children}</span>
    <ChevronRight size={11} className="mt-1 shrink-0 text-[var(--text-muted)]" />
  </li>
);
