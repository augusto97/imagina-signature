import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react';
import {
  Check,
  Copy,
  Download,
  Mail,
  ExternalLink,
  AlertTriangle,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { compileSignature } from '@/core/compiler/compile';
import { useSchemaStore } from '@/stores/schemaStore';
import { useEditorStore } from '@/stores/editorStore';
import { apiCall, ApiError } from '@/bridge/apiClient';
import { useToastStore } from '@/stores/toastStore';
import { copyText, copyRichHtml } from '@/utils/clipboard';
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
  /** Which copy mode the steps assume the user took — drives the highlighted button. */
  recommend: 'visual' | 'html';
  deepLink?: string;
  steps: string[];
}> = [
  {
    id: 'gmail',
    label: 'Gmail',
    recommend: 'visual',
    deepLink: 'https://mail.google.com/mail/u/0/#settings/general',
    steps: [
      'Press "Copy visual" above so the rendered signature is in your clipboard.',
      'Click the link below — Gmail opens on the General settings tab in a new window.',
      'Scroll to the "Signature" section, click "Create new", give it a name.',
      'Click into the editor and paste (Cmd/Ctrl + V). The signature renders visually.',
      'Pick the new signature in the "For new emails use" dropdown, then "Save changes" at the bottom.',
    ],
  },
  {
    id: 'outlook-web',
    label: 'Outlook Web',
    recommend: 'visual',
    deepLink: 'https://outlook.live.com/mail/0/options/mail/messageContent',
    steps: [
      'Press "Copy visual" above so the rendered signature is in your clipboard.',
      'Click the link below to open Outlook on the web on the message-content settings page.',
      'Under "Email signature", click "+ New signature" and give it a name.',
      'Click into the rich-text area and paste (Cmd/Ctrl + V). The signature renders visually.',
      'Set it as default for new messages and replies if you want, then click "Save".',
    ],
  },
  {
    id: 'outlook-desktop',
    label: 'Outlook Desktop',
    recommend: 'visual',
    steps: [
      'Press "Copy visual" above so the rendered signature is in your clipboard.',
      'Open Outlook → File → Options → Mail → Signatures…',
      'Click "New", give the signature a name, click "OK".',
      'Click into the editor area at the bottom and paste (Cmd/Ctrl + V).',
      'Outlook 2007–2019 freezes animated GIFs on the first frame — the editor offers a static-fallback URL field to handle that. Click "OK" twice when done.',
    ],
  },
  {
    id: 'apple-mail',
    label: 'Apple Mail',
    recommend: 'visual',
    steps: [
      'Press "Copy visual" above so the rendered signature is in your clipboard.',
      'Open Mail → Settings… → Signatures.',
      'Pick the email account on the left, click "+" to add a new signature, give it a name.',
      'Click into the editor on the right and paste (Cmd + V). The signature renders visually.',
      'If images don\'t show, untick "Always match my default message font" in the same panel.',
    ],
  },
  {
    id: 'thunderbird',
    label: 'Thunderbird',
    recommend: 'html',
    steps: [
      'Press "Download .html" above to save the signature to disk.',
      'Open Thunderbird → Account Settings → pick your account on the left.',
      'Tick "Use HTML (e.g. <b>bold</b>)" under the Signature text area.',
      'Tick "Attach the signature from a file instead" and choose the .html you just saved.',
      'Click "OK". Thunderbird re-reads the file each send so editing the file updates every future email.',
    ],
  },
];

export const ExportModal: FC = () => {
  const modal = useEditorStore((s) => s.modal);
  const closeModal = useEditorStore((s) => s.closeModal);
  const schema = useSchemaStore((s) => s.schema);
  const showToast = useToastStore((s) => s.show);

  const [copied, setCopied] = useState<'html' | 'visual' | null>(null);
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
      setCopied(null);
      setSending(false);
      setSentTo(null);
      setClient('gmail');
    }
  }, [open]);

  const copyHtml = async (): Promise<void> => {
    if (!result) return;
    const ok = await copyText(result.html);
    if (ok) {
      setCopied('html');
      window.setTimeout(() => setCopied(null), 2000);
    } else {
      showToast(__('Could not copy — try selecting the HTML below manually.'), 'error');
    }
  };

  const copyVisual = async (): Promise<void> => {
    if (!result) return;
    const ok = await copyRichHtml(result.html);
    if (ok) {
      setCopied('visual');
      window.setTimeout(() => setCopied(null), 2000);
    } else {
      showToast(
        __('Could not copy — your browser blocked rich-clipboard access. Try the "Copy HTML" button instead.'),
        'error',
      );
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
              onClick={() => void copyVisual()}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-md px-4 font-medium transition-colors',
                copied === 'visual'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
              )}
              title={__('Copies the rendered signature so it pastes visually into rich-text composers (Gmail compose, Outlook signature box, Word, etc.). Use this when the signature settings only accept rich text, not HTML source.')}
            >
              {copied === 'visual' ? <Check size={14} /> : <Eye size={14} />}
              {copied === 'visual' ? __('Copied!') : __('Copy visual')}
            </button>

            <button
              type="button"
              onClick={() => void copyHtml()}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-md border px-4 font-medium transition-colors',
                copied === 'html'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-[var(--border-default)] bg-[var(--bg-panel)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
              )}
              title={__('Copies the raw HTML source. Use this when the signature settings expose an HTML / source-code mode (Gmail with Labs HTML, raw .html file editing).')}
            >
              {copied === 'html' ? <Check size={14} /> : <Copy size={14} />}
              {copied === 'html' ? __('Copied!') : __('Copy HTML')}
            </button>

            <button
              type="button"
              onClick={() => void sendToEmail()}
              disabled={sending}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] px-3 font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
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
              <div className="flex flex-wrap items-center gap-2">
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
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-600">
                  {activeClient.recommend === 'visual'
                    ? __('Use “Copy visual”')
                    : __('Use “Download .html”')}
                </span>
              </div>

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
