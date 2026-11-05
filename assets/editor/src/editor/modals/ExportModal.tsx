import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react';
import {
  Check,
  Copy,
  Download,
  Mail,
  ExternalLink,
  AlertTriangle,
  AlertOctagon,
  ChevronRight,
  Eye,
  CheckCircle2,
  XCircle,
  FolderOpen,
  AppWindow,
} from 'lucide-react';
import { compileSignature, type CompileIssue, type CompileResult } from '@/core/compiler/compile';
import { gmailPreflight, type PreflightStatus } from '@/core/compiler/preflight';
import {
  UTF8_BOM,
  buildOutlookSignatureDocument,
  buildPlainTextSignature,
  buildStandaloneSignaturePage,
  signatureFileBaseName,
} from '@/core/compiler/export-documents';
import type { Block, QrCodeBlock, VCardBlock } from '@/core/schema/blocks';
import { childLists } from '@/core/schema/tree';
import { findBlockByIdDeep, useSchemaStore } from '@/stores/schemaStore';
import { useEditorStore } from '@/stores/editorStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { apiCall, ApiError, isUploadEnabled } from '@/bridge/apiClient';
import { qrContentHash, uploadQrImage } from '@/core/blocks/qr-code/definition';
import { uploadVCardFile, vcardContentHash, vcardHasDetails } from '@/core/blocks/vcard/definition';
import {
  dataUrlToBlob,
  extensionFor,
  isUploadsDisabledError,
  loadImage,
  renderImage,
  targetPixelWidth,
  uploadBlob,
  uploadErrorMessage,
} from '@/services/uploads';
import { useToastStore } from '@/stores/toastStore';
import { copyText, copyRichHtml } from '@/utils/clipboard';
import { __, _n } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { Modal } from '@/components/shared/Modal';
import { DarkModeImageWarnings } from './preview/DarkModeImageWarnings';

/**
 * Export modal:
 *
 *  1. Compile the signature and surface size, errors / warnings and
 *     dark-mode risks (each issue links to its block).
 *  2. Generic actions: "Copy visual", "Copy HTML", "Send to my email",
 *     "Download .html".
 *  3. Per-client install tabs, each with the export that client really
 *     needs and accurate steps:
 *     - Gmail / Google Workspace — pre-flight checklist (10,000-char
 *       limit, data: URIs, https, public hosts) gating the copy;
 *     - Outlook for Windows (classic) — .htm + .txt signature files for
 *       %APPDATA%\Microsoft\Signatures;
 *     - New Outlook / Outlook on the web — copy visual;
 *     - Apple Mail — signature-only page in a new tab to select and copy;
 *     - Mobile — "Send to my email", then copy on the phone;
 *     - Thunderbird — .html file.
 */
type Client = 'gmail' | 'outlook-desktop' | 'outlook-web' | 'apple-mail' | 'mobile' | 'thunderbird';

/** Labels are lazy so they translate at render time. */
const CLIENTS: Array<{ id: Client; label: () => string }> = [
  { id: 'gmail', label: () => __('Gmail / Google Workspace') },
  { id: 'outlook-desktop', label: () => __('Outlook for Windows (classic)') },
  { id: 'outlook-web', label: () => __('New Outlook / Outlook on the web') },
  { id: 'apple-mail', label: () => __('Apple Mail') },
  { id: 'mobile', label: () => __('Mobile') },
  { id: 'thunderbird', label: () => __('Thunderbird') },
];

const GMAIL_SETTINGS_URL = 'https://mail.google.com/mail/u/0/#settings/general';
const OUTLOOK_WEB_SETTINGS_URL = 'https://outlook.live.com/mail/0/options/mail/messageContent';
/** Where classic Outlook for Windows reads signature files from. */
/**
 * Outlook's signatures folder. Its last segment is localised by Outlook
 * itself ("Firmas" in Spanish, "Signaturen" in German…), so it follows
 * the UI language — translators: use the folder name of Outlook in your
 * language.
 */
const outlookSignaturesFolderName = (): string => __('Signatures');
const outlookSignaturesFolder = (): string =>
  `%APPDATA%\\Microsoft\\${outlookSignaturesFolderName()}`;

export const ExportModal: FC = () => {
  const modal = useEditorStore((s) => s.modal);
  const closeModal = useEditorStore((s) => s.closeModal);
  const schema = useSchemaStore((s) => s.schema);
  const signatureName = usePersistenceStore((s) => s.signatureName);
  const showToast = useToastStore((s) => s.show);

  const [copied, setCopied] = useState<'html' | 'visual' | 'gmail' | 'folder' | null>(null);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [client, setClient] = useState<Client>('gmail');

  const result = useMemo(
    () => (modal === 'export' ? compileSignature(schema) : null),
    [modal, schema],
  );
  const embedded = useMemo(
    () => (modal === 'export' ? findEmbeddedAssets(schema.blocks) : []),
    [modal, schema],
  );
  const [fixing, setFixing] = useState<{ done: number; total: number } | null>(null);

  const open = modal === 'export';

  useEffect(() => {
    if (open) {
      setCopied(null);
      setSending(false);
      setSentTo(null);
      setClient('gmail');
    }
  }, [open]);

  const flashCopied = (what: 'html' | 'visual' | 'gmail' | 'folder'): void => {
    setCopied(what);
    window.setTimeout(() => setCopied(null), 2000);
  };

  const copyHtml = async (): Promise<void> => {
    if (!result) return;
    const ok = await copyText(result.html);
    if (ok) {
      flashCopied('html');
    } else {
      showToast(__('Could not copy — try selecting the HTML below manually.'), 'error');
    }
  };

  const copyVisual = async (source: 'visual' | 'gmail' = 'visual'): Promise<void> => {
    if (!result) return;
    // Paste-into-composer path: only the signature fragment (the shell
    // table — no doctype / <head> / <title> / mso settings) plus the
    // schema-generated plain text, so a plain-text paste reads cleanly.
    const ok = await copyRichHtml(result.fragment, result.text);
    if (ok) {
      flashCopied(source);
    } else {
      showToast(
        __(
          'Could not copy — your browser blocked rich-clipboard access. Try the "Copy HTML" button instead.',
        ),
        'error',
      );
    }
  };

  const copyFolderPath = async (): Promise<void> => {
    if (await copyText(outlookSignaturesFolder())) flashCopied('folder');
  };

  const download = (): void => {
    if (!result) return;
    downloadFile(result.html, 'signature.html', 'text/html;charset=utf-8');
  };

  const fileBase = signatureFileBaseName(signatureName, __('Signature'));

  const downloadOutlookHtm = (): void => {
    if (!result) return;
    const doc = buildOutlookSignatureDocument(result.fragment, {
      lang: result.lang,
      dir: result.dir,
      title: fileBase,
    });
    downloadFile(UTF8_BOM + doc, `${fileBase}.htm`, 'text/html;charset=utf-8');
  };

  const downloadOutlookTxt = (): void => {
    if (!result) return;
    downloadFile(
      UTF8_BOM + buildPlainTextSignature(result.text),
      `${fileBase}.txt`,
      'text/plain;charset=utf-8',
    );
  };

  const openInNewTab = (): void => {
    if (!result) return;
    const page = buildStandaloneSignaturePage(result.fragment, {
      lang: result.lang,
      dir: result.dir,
      title: __('Signature — press Cmd + A, then Cmd + C'),
    });
    const url = URL.createObjectURL(new Blob([page], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();
    // The new tab needs the URL while it loads; free it a minute later.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const sendToEmail = async (): Promise<void> => {
    if (!result || sending) return;
    setSending(true);
    try {
      const resp = await apiCall<{ sent: boolean; recipient: string }>('/signatures/test-send', {
        method: 'POST',
        body: { html: result.html },
      });
      setSentTo(resp.recipient);
      showToast(__('Sent to %s', resp.recipient), 'success');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      showToast(__('Could not send: %s', msg), 'error');
    } finally {
      setSending(false);
    }
  };

  const fixEmbedded = async (): Promise<void> => {
    if (fixing || embedded.length === 0) return;
    setFixing({ done: 0, total: embedded.length });
    const failures: string[] = [];
    for (let i = 0; i < embedded.length; i++) {
      try {
        await hostEmbeddedAsset(embedded[i]!);
      } catch (e) {
        failures.push(uploadErrorMessage(e));
        if (isUploadsDisabledError(e)) break;
      }
      setFixing({ done: i + 1, total: embedded.length });
    }
    setFixing(null);
    if (failures.length === 0) {
      showToast(__('All embedded images are now hosted.'), 'success');
    } else {
      showToast(
        _n(
          '%1$s item could not be uploaded: %2$s',
          '%1$s items could not be uploaded: %2$s',
          failures.length,
          String(failures.length),
          failures[0] ?? '',
        ),
        'error',
        8000,
      );
    }
  };

  const selectIssueBlock = (blockId: string): void => {
    useSelectionStore.getState().select(blockId);
    closeModal();
  };

  const sizeKb = result ? (result.size / 1024).toFixed(1) : '0';
  const oversize = result ? result.size > 102 * 1024 : false;

  const sendButton = (
    <button
      type="button"
      onClick={() => void sendToEmail()}
      disabled={sending}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] px-3 font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
      title={__(
        'Sends the compiled HTML to your WP account email so you can copy it from your real client.',
      )}
    >
      <Mail size={14} />
      {sending ? __('Sending…') : sentTo ? __('Sent!') : __('Send to my email')}
    </button>
  );

  return (
    <Modal open={open} title={__('Export & install')} onClose={closeModal} width={780}>
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
              title={__(
                'Copies the rendered signature so it pastes visually into rich-text composers (Gmail compose, Outlook signature box, Word, etc.). Use this when the signature settings only accept rich text, not HTML source.',
              )}
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
              title={__(
                'Copies the raw HTML source. Use this when the signature settings expose an HTML / source-code mode (Gmail with Labs HTML, raw .html file editing).',
              )}
            >
              {copied === 'html' ? <Check size={14} /> : <Copy size={14} />}
              {copied === 'html' ? __('Copied!') : __('Copy HTML')}
            </button>

            {sendButton}

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
                {__('%s KB', sizeKb)}
              </span>
            </span>
          </div>

          {embedded.length > 0 && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2.5 text-[12px] text-red-900"
            >
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertOctagon size={14} />
                {_n(
                  '%s embedded image or file will not show in Gmail or Outlook.com',
                  '%s embedded images or files will not show in Gmail or Outlook.com',
                  embedded.length,
                  String(embedded.length),
                )}
              </div>
              <p className="text-[11.5px] leading-relaxed text-red-800">
                {__(
                  'This signature embeds images or files directly (data: URIs). Most webmail clients refuse to display them, and a single embedded photo can push the signature past Gmail’s 10,000-character limit. Upload them to your site so the signature links to hosted copies instead.',
                )}
              </p>
              {isUploadEnabled() ? (
                <button
                  type="button"
                  onClick={() => void fixEmbedded()}
                  disabled={fixing !== null}
                  className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md bg-red-600 px-3 font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                >
                  {fixing
                    ? __('Uploading %s of %s…', String(fixing.done + 1), String(fixing.total))
                    : __('Fix embedded images')}
                </button>
              ) : (
                <p className="text-[11.5px] font-medium">
                  {__(
                    'Uploads are disabled on this site — replace these images with links to hosted images (https://…).',
                  )}
                </p>
              )}
            </div>
          )}

          <CompileIssues issues={result.issues} onSelect={selectIssueBlock} />
          <DarkModeImageWarnings images={result.images} enabled={open} />

          {/* Install guides */}
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)]">
            <header className="border-b border-[var(--border-default)] px-4 py-2.5">
              <div className="text-[12.5px] font-semibold text-[var(--text-primary)]">
                {__('Install in your email client')}
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                {__(
                  'Pick your email client: each tab has the export it needs and the exact steps.',
                )}
              </p>
            </header>

            <div
              role="tablist"
              className="flex flex-wrap gap-1 border-b border-[var(--border-default)] bg-[var(--bg-panel-soft)] px-3 py-2"
            >
              {CLIENTS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={client === c.id}
                  onClick={() => setClient(c.id)}
                  className={cn(
                    'h-7 rounded-md px-2.5 text-[11.5px] font-medium transition-colors',
                    client === c.id
                      ? 'bg-[var(--bg-selected)] text-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                  )}
                >
                  {c.label()}
                </button>
              ))}
            </div>

            <div role="tabpanel" className="space-y-3 px-4 py-3">
              {client === 'gmail' && (
                <GmailPanel
                  result={result}
                  copied={copied === 'gmail'}
                  onCopy={() => void copyVisual('gmail')}
                />
              )}

              {client === 'outlook-desktop' && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <PrimaryButton onClick={downloadOutlookHtm} icon={<Download size={13} />}>
                      {__('Download for Outlook (.htm)')}
                    </PrimaryButton>
                    <SecondaryButton onClick={downloadOutlookTxt} icon={<Download size={13} />}>
                      {__('Download plain text (.txt)')}
                    </SecondaryButton>
                    <SecondaryButton
                      onClick={() => void copyFolderPath()}
                      icon={copied === 'folder' ? <Check size={13} /> : <FolderOpen size={13} />}
                    >
                      {copied === 'folder' ? __('Copied!') : __('Copy folder path')}
                    </SecondaryButton>
                  </div>
                  <p className="text-[11.5px] text-[var(--text-muted)]">
                    {__('Files: %s', `${fileBase}.htm · ${fileBase}.txt`)}
                  </p>
                  <Steps
                    steps={[
                      __(
                        'Download both files above. Keep their names identical — only the extension differs; the name is what Outlook lists.',
                      ),
                      __('Close Outlook completely.'),
                      __(
                        'Press Windows + R, paste %1$s and press Enter. Create the "%2$s" folder if it does not exist.',
                        outlookSignaturesFolder(),
                        outlookSignaturesFolderName(),
                      ),
                      __('Move the two downloaded files into that folder.'),
                      __(
                        'Open Outlook → File → Options → Mail → Signatures…, choose the new signature for "New messages" and "Replies/forwards", then click "OK".',
                      ),
                    ]}
                  />
                  <Note>
                    {__(
                      'If your organisation syncs Microsoft 365 cloud signatures, Outlook may replace files in that folder. Then press "Copy visual" and paste into File → Options → Mail → Signatures… → New instead.',
                    )}
                  </Note>
                </>
              )}

              {client === 'outlook-web' && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <PrimaryButton
                      onClick={() => void copyVisual()}
                      icon={copied === 'visual' ? <Check size={13} /> : <Eye size={13} />}
                    >
                      {copied === 'visual' ? __('Copied!') : __('Copy visual')}
                    </PrimaryButton>
                    <SettingsLink
                      href={OUTLOOK_WEB_SETTINGS_URL}
                      label={__('Outlook on the web')}
                    />
                  </div>
                  <Steps
                    steps={[
                      __('Press "Copy visual" so the rendered signature is in your clipboard.'),
                      __(
                        'Outlook on the web: Settings (gear) → Account → Signatures. New Outlook for Windows: Settings → Accounts → Signatures.',
                      ),
                      __(
                        'Click "+ New signature", give it a name, click into the editor and paste (Cmd/Ctrl + V).',
                      ),
                      __(
                        'Pick it under "Select default signatures" for new messages and for replies/forwards, then click "Save".',
                      ),
                    ]}
                  />
                </>
              )}

              {client === 'apple-mail' && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <PrimaryButton onClick={openInNewTab} icon={<AppWindow size={13} />}>
                      {__('Open signature in a new tab')}
                    </PrimaryButton>
                  </div>
                  <Steps
                    steps={[
                      __(
                        'Press "Open signature in a new tab" (Safari works best). The tab shows only the signature.',
                      ),
                      __('In that tab press Cmd + A, then Cmd + C.'),
                      __(
                        'Open Mail → Settings… → Signatures, pick the account on the left and click "+" to add a signature.',
                      ),
                      __(
                        'Untick "Always match my default message font" — otherwise Mail replaces the signature’s fonts with your default font.',
                      ),
                      __(
                        'Click into the signature area on the right, delete the placeholder text and paste (Cmd + V). Close the window; Mail saves automatically.',
                      ),
                    ]}
                  />
                  <Note>{__('Send yourself a test message to check the result.')}</Note>
                </>
              )}

              {client === 'mobile' && (
                <>
                  <p className="text-[12px] text-[var(--text-secondary)]">
                    {__(
                      'Phones cannot paste from this editor directly: send the signature to yourself, then copy it from the received email on the phone.',
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">{sendButton}</div>
                  <SubSection title={__('iPhone / iPad (Mail)')}>
                    <Steps
                      steps={[
                        __(
                          'Open the test email in the Mail app, touch and hold the signature and drag the selection handles over all of it, then tap "Copy".',
                        ),
                        __(
                          'Open Settings → Apps → Mail → Signature (older iOS: Settings → Mail → Signature), choose "All Accounts" or "Per Account", clear the field and paste.',
                        ),
                        __(
                          'iOS removes the formatting right after pasting: immediately shake the iPhone and tap "Undo" to bring the formatting back.',
                        ),
                        __('Go back to save.'),
                      ]}
                    />
                  </SubSection>
                  <SubSection title={__('Gmail app (Android / iPhone)')}>
                    <Steps
                      steps={[
                        __(
                          'The Gmail app’s own "Mobile signature" is plain text only — images, colours and links are not kept. For the full visual signature, install it in Gmail on a computer (Gmail tab).',
                        ),
                        __(
                          'To set the text version: in the app open Settings → your account → Mobile signature and paste the text copied from the received email.',
                        ),
                      ]}
                    />
                  </SubSection>
                  <SubSection title={__('Outlook app (Android / iPhone)')}>
                    <Steps
                      steps={[
                        __(
                          'Copy the signature from the received email (touch and hold, select all of it, Copy).',
                        ),
                        __(
                          'Open the Outlook app → Settings → Signature (per account when offered) and paste.',
                        ),
                        __(
                          'How much formatting survives depends on the app version: send yourself a message to check, and keep the mobile signature simple if images are dropped.',
                        ),
                      ]}
                    />
                  </SubSection>
                </>
              )}

              {client === 'thunderbird' && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <PrimaryButton onClick={download} icon={<Download size={13} />}>
                      {__('Download .html')}
                    </PrimaryButton>
                  </div>
                  <Steps
                    steps={[
                      __('Press "Download .html" above to save the signature to disk.'),
                      __('Open Thunderbird → Account Settings → pick your account on the left.'),
                      __('Tick "Use HTML (e.g. <b>bold</b>)" under the Signature text area.'),
                      __(
                        'Tick "Attach the signature from a file instead" and choose the .html you just saved.',
                      ),
                      __(
                        'Click "OK". Thunderbird re-reads the file each send so editing the file updates every future email.',
                      ),
                    ]}
                  />
                </>
              )}
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

/**
 * Gmail / Google Workspace tab: pre-flight checklist, then a copy
 * button that is held back while something would break the signature
 * in Gmail ("Copy anyway" stays available).
 */
const GmailPanel: FC<{ result: CompileResult; copied: boolean; onCopy: () => void }> = ({
  result,
  copied,
  onCopy,
}) => {
  const preflight = useMemo(() => gmailPreflight(result), [result]);
  return (
    <>
      <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] px-3 py-2">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {__('Before you copy')}
        </div>
        <ul className="flex flex-col gap-1">
          {preflight.checks.map((check) => (
            <li key={check.id} className="flex items-start gap-2 text-[12px]">
              <StatusIcon status={check.status} />
              <span className="flex-1">
                <span className="text-[var(--text-primary)]">{check.label}</span>
                {check.detail && (
                  <span className="block text-[11px] text-[var(--text-muted)]">{check.detail}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {preflight.blocked && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-800"
        >
          <div className="font-semibold">
            {__('Copying is on hold: Gmail would save a broken signature.')}
          </div>
          <p className="mt-0.5">
            {__(
              'Fix the items marked in red (and the problems listed above), then copy. You can still copy anyway.',
            )}
          </p>
          {preflight.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {preflight.errors.map((issue, i) => (
                <li key={`${issue.blockId ?? 'doc'}-${i}`}>{issue.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {preflight.blocked ? (
          <SecondaryButton
            onClick={onCopy}
            icon={copied ? <Check size={13} /> : <Copy size={13} />}
          >
            {copied ? __('Copied!') : __('Copy anyway')}
          </SecondaryButton>
        ) : (
          <PrimaryButton onClick={onCopy} icon={copied ? <Check size={13} /> : <Eye size={13} />}>
            {copied ? __('Copied!') : __('Copy for Gmail')}
          </PrimaryButton>
        )}
        <SettingsLink href={GMAIL_SETTINGS_URL} label={__('Gmail')} />
      </div>

      <Steps
        steps={[
          __('Check the list above, then press "Copy for Gmail".'),
          __(
            'Open Gmail settings (link above) — or the gear icon → "See all settings" → "General" tab.',
          ),
          __('Scroll to "Signature", click "Create new" and give it a name.'),
          __(
            'Click into the signature box and paste (Cmd/Ctrl + V). Avoid editing it there afterwards — Gmail may drop formatting.',
          ),
          __(
            'Under "Signature defaults" pick it for new emails and for replies/forwards, then click "Save changes" at the bottom of the page.',
          ),
        ]}
      />
      <Note>
        {__(
          'Google Workspace: if the signature box is missing or locked, your administrator manages signatures centrally.',
        )}
      </Note>
    </>
  );
};

const StatusIcon: FC<{ status: PreflightStatus }> = ({ status }) => {
  if (status === 'ok') {
    return (
      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" aria-label={__('OK')} />
    );
  }
  if (status === 'warn') {
    return (
      <AlertTriangle
        size={14}
        className="mt-0.5 shrink-0 text-amber-600"
        aria-label={__('Warning')}
      />
    );
  }
  return <XCircle size={14} className="mt-0.5 shrink-0 text-red-600" aria-label={__('Problem')} />;
};

const PrimaryButton: FC<{ onClick: () => void; icon: ReactNode; children: ReactNode }> = ({
  onClick,
  icon,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
  >
    {icon}
    {children}
  </button>
);

const SecondaryButton: FC<{ onClick: () => void; icon: ReactNode; children: ReactNode }> = ({
  onClick,
  icon,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] px-3 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
  >
    {icon}
    {children}
  </button>
);

const SettingsLink: FC<{ href: string; label: string }> = ({ href, label }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--accent)]/30 bg-[var(--bg-selected)] px-3 text-[12px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/15"
  >
    {__('Open %s settings', label)}
    <ExternalLink size={12} />
  </a>
);

const Steps: FC<{ steps: string[] }> = ({ steps }) => (
  <ol className="flex flex-col gap-1.5 text-[12.5px] text-[var(--text-secondary)]">
    {steps.map((step, i) => (
      <Step key={i} number={i + 1}>
        {step}
      </Step>
    ))}
  </ol>
);

const SubSection: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <section className="space-y-1.5">
    <h4 className="text-[12px] font-semibold text-[var(--text-primary)]">{title}</h4>
    {children}
  </section>
);

const Note: FC<{ children: ReactNode }> = ({ children }) => (
  <p className="rounded-md bg-[var(--bg-panel-soft)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--text-muted)]">
    {children}
  </p>
);

/** Saves `content` as a file through a temporary object URL. */
function downloadFile(content: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type EmbeddedAsset =
  | { kind: 'image'; blockId: string; field: 'src' | 'static_fallback_url' }
  | { kind: 'qr'; blockId: string }
  | { kind: 'vcard'; blockId: string };

/**
 * Walks every block — including every container column — and
 * lists what still has to be hosted: data: images (src and the Outlook
 * static fallback of Image / Avatar / Banner), QR codes without an
 * up-to-date uploaded PNG and vCards without an up-to-date .vcf file.
 */
function findEmbeddedAssets(blocks: Block[]): EmbeddedAsset[] {
  const out: EmbeddedAsset[] = [];
  const isData = (v: unknown): boolean => typeof v === 'string' && /^\s*data:/i.test(v);
  const walk = (list: Block[] | undefined): void => {
    for (const block of list ?? []) {
      switch (block.type) {
        case 'image':
        case 'banner':
          if (isData(block.src)) out.push({ kind: 'image', blockId: block.id, field: 'src' });
          if (isData(block.static_fallback_url)) {
            out.push({ kind: 'image', blockId: block.id, field: 'static_fallback_url' });
          }
          break;
        case 'avatar':
          if (isData(block.src)) out.push({ kind: 'image', blockId: block.id, field: 'src' });
          break;
        case 'qr_code':
          if (block.data && (!block.image_url || block.image_hash !== qrContentHash(block))) {
            out.push({ kind: 'qr', blockId: block.id });
          }
          break;
        case 'vcard':
          if (
            vcardHasDetails(block) &&
            (!block.vcf_url || block.vcf_hash !== vcardContentHash(block))
          ) {
            out.push({ kind: 'vcard', blockId: block.id });
          }
          break;
        case 'container':
          for (const children of childLists(block)) walk(children);
          break;
        default:
          break;
      }
    }
  };
  walk(blocks);
  return out;
}

/**
 * Uploads one embedded asset and patches its block through the store's
 * existing `updateBlock` action (the store itself is untouched). Always
 * re-reads the block from the store so a previous fix in the same run
 * is not overwritten.
 */
async function hostEmbeddedAsset(asset: EmbeddedAsset): Promise<void> {
  const store = useSchemaStore.getState();
  const block = findBlockByIdDeep(store.schema.blocks, asset.blockId);
  if (!block) return;

  if (asset.kind === 'qr') {
    if (block.type !== 'qr_code') return;
    store.updateBlock(block.id, await uploadQrImage(block as QrCodeBlock));
    return;
  }
  if (asset.kind === 'vcard') {
    if (block.type !== 'vcard') return;
    store.updateBlock(block.id, await uploadVCardFile(block as VCardBlock));
    return;
  }

  if (block.type !== 'image' && block.type !== 'banner' && block.type !== 'avatar') return;
  const record = block as unknown as Record<string, unknown>;
  const dataUrl = record[asset.field];
  if (typeof dataUrl !== 'string' || !/^\s*data:/i.test(dataUrl)) return;

  const isAvatar = block.type === 'avatar';
  const displayWidth =
    block.type === 'avatar'
      ? block.size
      : block.type === 'banner'
        ? block.width
        : (block.width ?? 600);
  const original = dataUrlToBlob(dataUrl);
  let upload: Blob = original;
  let mime = original.type;
  // Re-encode at 2x display width (cap 1200px; avatars get a true
  // circular mask). Animated GIFs and browsers without a 2D canvas
  // upload the original bytes.
  if (original.type !== 'image/gif' && canvasAvailable()) {
    try {
      const rendered = await renderImage(await loadImage(dataUrl), {
        maxWidth: targetPixelWidth(displayWidth),
        square: isAvatar,
        circular: isAvatar,
      });
      upload = rendered.blob;
      mime = rendered.mime;
    } catch {
      // Fall back to the original bytes.
    }
  }
  const hosted = await uploadBlob(upload, `${block.type}.${extensionFor(mime)}`);
  useSchemaStore.getState().updateBlock(block.id, { [asset.field]: hosted.url } as Partial<Block>);
}

function canvasAvailable(): boolean {
  try {
    return document.createElement('canvas').getContext('2d') !== null;
  } catch {
    return false;
  }
}

/**
 * Leveled compile diagnostics: errors (the export is broken for
 * recipients) are always expanded in red; warnings sit in an amber list
 * (collapsed unless `expanded`). Shared with the Preview modal.
 *
 * With `onSelect`, every issue that belongs to a block becomes a button
 * that selects that block in the editor.
 */
export const CompileIssues: FC<{
  issues: CompileIssue[];
  onSelect?: (blockId: string) => void;
  expanded?: boolean;
}> = ({ issues, onSelect, expanded = false }) => {
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  if (errors.length === 0 && warnings.length === 0) return null;

  const item = (issue: CompileIssue, i: number): ReactNode => (
    <li key={`${issue.blockId ?? 'doc'}-${i}`}>
      {onSelect && issue.blockId ? (
        <button
          type="button"
          onClick={() => onSelect(issue.blockId!)}
          className="text-left underline decoration-dotted underline-offset-2 hover:decoration-solid"
          title={__('Select this block in the editor')}
        >
          {issue.message}
        </button>
      ) : (
        issue.message
      )}
    </li>
  );

  return (
    <div className="flex flex-col gap-2">
      {errors.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-800"
        >
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertOctagon size={13} />
            {errors.length === 1
              ? __('1 problem will break this signature for recipients')
              : __('%s problems will break this signature for recipients', String(errors.length))}
          </div>
          <ul className="mt-1.5 list-disc pl-4">{errors.map(item)}</ul>
        </div>
      )}
      {warnings.length > 0 && (
        <details
          open={expanded || undefined}
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800"
        >
          <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
            <AlertTriangle size={12} />
            {_n(
              '%s compile warning',
              '%s compile warnings',
              warnings.length,
              String(warnings.length),
            )}
          </summary>
          <ul className="mt-2 list-disc pl-4">{warnings.map(item)}</ul>
        </details>
      )}
    </div>
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
