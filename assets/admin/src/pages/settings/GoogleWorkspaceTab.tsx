import { useEffect, useRef, useState, type FC } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  FlaskConical,
  KeyRound,
  Play,
  Save,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@admin/components/Button';
import { Spinner } from '@admin/components/Spinner';
import { apiCall, ApiError } from '@admin/api';
import { __, sprintf } from '@admin/i18n';
import { cn } from '@admin/utils/cn';
import { Banner, Field, Section, type Flash } from './_shared';

/** `GET /admin/deploy/gmail/settings` — never carries the private key. */
export interface GmailSettingsView {
  configured: boolean;
  ready: boolean;
  client_email: string;
  client_id: string;
  project_id: string;
  private_key_id: string;
  key_fingerprint: string;
  domains: string[];
  auto_push: boolean;
  daily_sync: boolean;
  push_aliases: boolean;
  scope: string;
  updated_at: string;
  next_daily_sync: string | null;
  domain_hint: string;
  sync: {
    running: boolean;
    started_at: string;
    finished_at: string;
    scanned: number;
    pushed: number;
    failed: number;
  };
}

/** `POST /admin/deploy/gmail/test`. */
export interface GmailTestResult {
  success: boolean;
  code: string;
  email: string;
  message: string;
  google?: string;
  help_url?: string;
  send_as?: Array<{
    email: string;
    display_name: string;
    is_primary: boolean;
    is_default: boolean;
    verification_status: string;
  }>;
  warnings?: string[];
}

/** One row of `POST /admin/deploy/gmail/push` → `results`. */
export interface GmailPushRow {
  user_id: number;
  status: string;
  email: string;
  name: string;
  message: string;
  error?: string;
  error_code?: string;
  google?: string;
  help_url?: string;
  send_as?: string[];
}

interface GmailPushResponse {
  results: GmailPushRow[];
  next_offset: number | null;
  total: number;
  processed: number;
}

const SCOPE_FALLBACK = 'https://www.googleapis.com/auth/gmail.settings.basic';
const MAX_KEY_FILE_BYTES = 16384;
const ENDPOINT = '/admin/deploy/gmail';

/** Labels are lazy so they translate at render time. */
const STATUS: Record<string, { label: () => string; tone: 'ok' | 'muted' | 'warn' | 'bad' }> = {
  pushed: { label: () => __('Pushed'), tone: 'ok' },
  up_to_date: { label: () => __('Up to date'), tone: 'muted' },
  no_signature: { label: () => __('No signature'), tone: 'muted' },
  needs_recompile: { label: () => __('Needs recompile'), tone: 'warn' },
  domain_not_allowed: { label: () => __('Other domain'), tone: 'warn' },
  no_email: { label: () => __('No email'), tone: 'warn' },
  user_not_found: { label: () => __('Unknown user'), tone: 'muted' },
  not_configured: { label: () => __('Not connected'), tone: 'bad' },
  retry: { label: () => __('Will retry'), tone: 'warn' },
  error: { label: () => __('Error'), tone: 'bad' },
};

const TONE: Record<'ok' | 'muted' | 'warn' | 'bad', string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  muted: 'bg-slate-100 text-slate-600 ring-slate-200',
  warn: 'bg-amber-50 text-amber-700 ring-amber-200',
  bad: 'bg-red-50 text-red-700 ring-red-200',
};

function errorMessage(e: unknown): string {
  return e instanceof ApiError || e instanceof Error ? e.message : String(e);
}

/** Field-level errors of a 400 from the settings endpoint, joined. */
function validationDetail(e: unknown): string {
  if (!(e instanceof ApiError) || !e.data || typeof e.data !== 'object') return errorMessage(e);
  const errors = (e.data as { errors?: Array<{ message?: string }> }).errors;
  const details = Array.isArray(errors)
    ? errors.map((err) => err.message).filter((m): m is string => typeof m === 'string')
    : [];
  return details.length > 0 ? `${e.message} ${details.join(' ')}` : e.message;
}

/** File contents as text (FileReader: wider support than Blob.text()). */
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error(__('The file could not be read.')));
    reader.readAsText(file);
  });
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const StatusPill: FC<{ status: string }> = ({ status }) => {
  const meta = STATUS[status] ?? { label: () => status, tone: 'muted' as const };
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        TONE[meta.tone],
      )}
    >
      {meta.label()}
    </span>
  );
};

/** A value the admin pastes elsewhere (Google Admin console), with a copy button. */
const CopyValue: FC<{ label: string; value: string; placeholder?: string }> = ({
  label,
  value,
  placeholder,
}) => {
  const [copied, setCopied] = useState(false);
  const empty = value === '';
  return (
    <div className="flex items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] px-3 py-2">
      <span className="w-20 shrink-0 text-[11.5px] font-medium text-[var(--text-secondary)]">
        {label}
      </span>
      <code
        className={cn(
          'min-w-0 flex-1 break-all font-mono text-[12px]',
          empty ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]',
        )}
      >
        {empty ? placeholder : value}
      </code>
      <Button
        size="sm"
        variant="ghost"
        disabled={empty}
        aria-label={sprintf(__('Copy %s'), label)}
        icon={copied ? <Check size={13} /> : <Copy size={13} />}
        onClick={() =>
          void copyText(value).then((ok) => {
            if (!ok) return;
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? __('Copied') : __('Copy')}
      </Button>
    </div>
  );
};

const ExternalStep: FC<{ href: string; children: string }> = ({ href, children }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
  >
    {children} <ExternalLink size={11} />
  </a>
);

const Toggle: FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}> = ({ checked, onChange, title, description }) => (
  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-3">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-0.5"
    />
    <div className="flex-1">
      <div className="text-[13px] font-medium text-[var(--text-primary)]">{title}</div>
      <div className="mt-0.5 text-[12px] text-[var(--text-secondary)]">{description}</div>
    </div>
  </label>
);

interface PushState {
  running: boolean;
  processed: number;
  total: number;
  rows: GmailPushRow[];
  error: string | null;
  stopped: boolean;
}

const IDLE_PUSH: PushState = {
  running: false,
  processed: 0,
  total: 0,
  rows: [],
  error: null,
  stopped: false,
};

/**
 * Google Workspace tab — deploys every employee's signature to Gmail
 * through a service account with domain-wide delegation (no per-user
 * OAuth): setup guide, key upload, allowed domains, automation toggles,
 * a connection test and "Push to everyone now" looping the bulk
 * endpoint (≤ 20 users per request) with a progress bar.
 */
export const GoogleWorkspaceTab: FC = () => {
  const [state, setState] = useState<GmailSettingsView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [busy, setBusy] = useState<'idle' | 'saving' | 'removing' | 'testing'>('idle');

  const [keyText, setKeyText] = useState('');
  const [replacingKey, setReplacingKey] = useState(false);
  const [domainsDraft, setDomainsDraft] = useState('');
  const [toggles, setToggles] = useState({
    auto_push: false,
    daily_sync: false,
    push_aliases: false,
  });

  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState<GmailTestResult | null>(null);

  const [force, setForce] = useState(false);
  const [push, setPush] = useState<PushState>(IDLE_PUSH);
  const stopRef = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const adopt = (view: GmailSettingsView): void => {
    setState(view);
    setDomainsDraft(view.domains.join(', '));
    setToggles({
      auto_push: view.auto_push,
      daily_sync: view.daily_sync,
      push_aliases: view.push_aliases,
    });
  };

  useEffect(() => {
    void apiCall<GmailSettingsView>(`${ENDPOINT}/settings`)
      .then(adopt)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 403) {
          setForbidden(true);
          return;
        }
        setLoadError(errorMessage(e));
      });
    return () => {
      stopRef.current = true;
    };
  }, []);

  if (forbidden) {
    return (
      <Banner
        type="error"
        message={__(
          'Deploying to Google Workspace requires the "Manage team" permission (imgsig_manage_team), which administrators have by default.',
        )}
        onDismiss={() => setForbidden(false)}
      />
    );
  }

  if (state === null) {
    return loadError ? (
      <Banner type="error" message={loadError} onDismiss={() => setLoadError(null)} />
    ) : (
      <div className="flex justify-center p-10">
        <Spinner size={20} />
      </div>
    );
  }

  const scope = state.scope || SCOPE_FALLBACK;
  const showKeyInput = !state.configured || replacingKey;

  const onPickFile = async (file: File | undefined): Promise<void> => {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    if (file.size > MAX_KEY_FILE_BYTES) {
      setFlash({
        type: 'error',
        message: __('That file is too large to be a service-account key (JSON).'),
      });
      return;
    }
    try {
      setKeyText(await readText(file));
    } catch (e) {
      setFlash({ type: 'error', message: errorMessage(e) });
    }
  };

  const onSave = async (): Promise<void> => {
    setBusy('saving');
    setFlash(null);
    const body: Record<string, unknown> = { domains: domainsDraft, ...toggles };
    if (keyText.trim() !== '') body.service_account = keyText.trim();
    try {
      const next = await apiCall<GmailSettingsView>(`${ENDPOINT}/settings`, {
        method: 'PATCH',
        body,
      });
      adopt(next);
      setKeyText('');
      setReplacingKey(false);
      setFlash({ type: 'success', message: __('Google Workspace settings saved.') });
    } catch (e) {
      setFlash({ type: 'error', message: validationDetail(e) });
    } finally {
      setBusy('idle');
    }
  };

  const onRemove = async (): Promise<void> => {
    if (
      !window.confirm(
        __(
          'Remove the service-account key? Gmail pushes stop until a new key is uploaded. Signatures already in Gmail are not changed.',
        ),
      )
    ) {
      return;
    }
    setBusy('removing');
    setFlash(null);
    try {
      adopt(await apiCall<GmailSettingsView>(`${ENDPOINT}/settings`, { method: 'DELETE' }));
      setTestResult(null);
      setFlash({ type: 'success', message: __('Service-account key removed.') });
    } catch (e) {
      setFlash({ type: 'error', message: errorMessage(e) });
    } finally {
      setBusy('idle');
    }
  };

  const onTest = async (): Promise<void> => {
    setBusy('testing');
    setTestResult(null);
    try {
      setTestResult(
        await apiCall<GmailTestResult>(`${ENDPOINT}/test`, {
          method: 'POST',
          body: { email: testEmail.trim() },
        }),
      );
    } catch (e) {
      setTestResult({
        success: false,
        code: e instanceof ApiError ? e.code : 'unknown',
        email: testEmail.trim(),
        message: errorMessage(e),
      });
    } finally {
      setBusy('idle');
    }
  };

  const onPushAll = async (): Promise<void> => {
    stopRef.current = false;
    let rows: GmailPushRow[] = [];
    let offset: number | null = 0;
    setPush({ ...IDLE_PUSH, running: true });
    try {
      while (offset !== null && !stopRef.current) {
        const page: GmailPushResponse = await apiCall<GmailPushResponse>(`${ENDPOINT}/push`, {
          method: 'POST',
          body: { all: true, force, offset },
        });
        rows = [...rows, ...page.results];
        offset = page.next_offset;
        const processed = page.processed;
        const total = page.total;
        setPush((prev) => ({ ...prev, rows, processed, total }));
      }
      setPush((prev) => ({ ...prev, running: false, stopped: stopRef.current && offset !== null }));
    } catch (e) {
      setPush((prev) => ({ ...prev, running: false, error: errorMessage(e) }));
    }
  };

  const percent =
    push.total > 0 ? Math.min(100, Math.round((push.processed / push.total) * 100)) : 0;
  const counts = push.rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  const lastSync = state.sync.finished_at || state.sync.started_at;

  return (
    <div className="space-y-4">
      {flash && (
        <Banner type={flash.type} message={flash.message} onDismiss={() => setFlash(null)} />
      )}

      <div className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-[var(--shadow-xs)]">
        <Section
          title={__('Set up Google Workspace (once)')}
          description={__(
            'A Google Workspace administrator authorises a service account once; the plugin then writes every employee’s Gmail signature itself. Nobody has to sign in with Google.',
          )}
        >
          <ol className="list-decimal space-y-3 pl-5 text-[12.5px] text-[var(--text-secondary)]">
            <li>
              <span className="font-medium text-[var(--text-primary)]">
                {__('Create a Google Cloud project')}
              </span>{' '}
              {__('(or pick an existing one).')}{' '}
              <ExternalStep href="https://console.cloud.google.com/projectcreate">
                {__('Open Google Cloud')}
              </ExternalStep>
            </li>
            <li>
              <span className="font-medium text-[var(--text-primary)]">
                {__('Enable the Gmail API')}
              </span>{' '}
              {__('in APIs & Services → Library.')}{' '}
              <ExternalStep href="https://console.cloud.google.com/apis/library/gmail.googleapis.com">
                {__('Gmail API')}
              </ExternalStep>
            </li>
            <li>
              <span className="font-medium text-[var(--text-primary)]">
                {__('Create a service account and a JSON key')}
              </span>{' '}
              {__(
                'in IAM & Admin → Service accounts → Create, then Keys → Add key → JSON. Keep the downloaded file safe: it is a password.',
              )}{' '}
              <ExternalStep href="https://console.cloud.google.com/iam-admin/serviceaccounts">
                {__('Service accounts')}
              </ExternalStep>
            </li>
            <li>
              <span className="font-medium text-[var(--text-primary)]">
                {__('Upload the JSON key below')}
              </span>{' '}
              {__('and save. The private key is stored encrypted and is never shown again.')}
            </li>
            <li>
              <span className="font-medium text-[var(--text-primary)]">
                {__('Grant domain-wide delegation')}
              </span>{' '}
              {__(
                'in the Google Admin console → Security → API controls → Domain-wide delegation → Add new, with this client ID and exactly this scope:',
              )}{' '}
              <ExternalStep href="https://admin.google.com/ac/owl/domainwidedelegation">
                {__('Google Admin console')}
              </ExternalStep>
              <div className="mt-2 space-y-1.5">
                <CopyValue
                  label={__('Client ID')}
                  value={state.client_id}
                  placeholder={__('Shown after you upload the key')}
                />
                <CopyValue label={__('Scope')} value={scope} />
              </div>
            </li>
            <li>
              <span className="font-medium text-[var(--text-primary)]">
                {__('Add your Workspace domains, then test with an email.')}
              </span>{' '}
              {__('Delegation can take a few minutes to start working.')}
            </li>
          </ol>
        </Section>

        <Section
          title={__('Service account')}
          description={
            state.configured
              ? __(
                  'Connected. Upload a new key to replace this one (for example after rotating it).',
                )
              : __('Paste the contents of the JSON key file, or upload the file.')
          }
        >
          {state.configured && (
            <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-[12px]">
              <dt className="text-[var(--text-secondary)]">{__('Service account')}</dt>
              <dd className="break-all font-mono text-[var(--text-primary)]">
                {state.client_email}
              </dd>
              <dt className="text-[var(--text-secondary)]">{__('Project')}</dt>
              <dd className="font-mono text-[var(--text-primary)]">{state.project_id || '—'}</dd>
              <dt className="text-[var(--text-secondary)]">{__('Key ID')}</dt>
              <dd className="break-all font-mono text-[var(--text-primary)]">
                {state.private_key_id || '—'}
              </dd>
              <dt className="text-[var(--text-secondary)]">{__('Fingerprint')}</dt>
              <dd className="font-mono text-[var(--text-primary)]" title={state.key_fingerprint}>
                {/* i18n-ignore — technical identifier */}
                {state.key_fingerprint ? `SHA256 ${state.key_fingerprint.slice(0, 16)}…` : '—'}
              </dd>
            </dl>
          )}

          {showKeyInput && (
            <>
              <Field
                label={__('Service-account key (JSON)')}
                hint={__('Starts with {"type": "service_account", … }.')}
              >
                <textarea
                  rows={6}
                  value={keyText}
                  onChange={(e) => setKeyText(e.target.value)}
                  className="font-mono text-[11.5px]"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={__('Paste the JSON key here…')}
                />
              </Field>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                data-testid="gmail-key-file"
                onChange={(e) => void onPickFile(e.target.files?.[0])}
              />
            </>
          )}

          <div className="flex flex-wrap gap-2">
            {showKeyInput ? (
              <Button
                size="sm"
                icon={<Upload size={13} />}
                onClick={() => fileInput.current?.click()}
              >
                {__('Upload JSON file')}
              </Button>
            ) : (
              <Button size="sm" icon={<KeyRound size={13} />} onClick={() => setReplacingKey(true)}>
                {__('Replace key')}
              </Button>
            )}
            {state.configured && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== 'idle'}
                icon={busy === 'removing' ? <Spinner size={12} /> : <Trash2 size={13} />}
                onClick={() => void onRemove()}
              >
                {__('Remove key')}
              </Button>
            )}
          </div>
        </Section>

        <Section
          title={__('Domains and automation')}
          description={__(
            'Only users whose email address is in one of these domains are pushed. Add every domain of your Google Workspace (secondary domains too).',
          )}
        >
          <Field
            label={__('Allowed domains')}
            hint={__('Comma-separated, e.g. acme.com, acme.co.uk')}
          >
            <input
              type="text"
              value={domainsDraft}
              onChange={(e) => setDomainsDraft(e.target.value)}
              placeholder={state.domain_hint || 'example.com'}
              className="font-mono"
            />
          </Field>
          <Toggle
            checked={toggles.auto_push}
            onChange={(v) => setToggles((t) => ({ ...t, auto_push: v }))}
            title={__('Push automatically when a signature changes')}
            description={__(
              'About a minute after someone saves their primary signature, it is written to their Gmail.',
            )}
          />
          <Toggle
            checked={toggles.daily_sync}
            onChange={(v) => setToggles((t) => ({ ...t, daily_sync: v }))}
            title={__('Daily sync')}
            description={__(
              'Once a day, re-push everyone whose Gmail signature is out of date (in batches, in the background).',
            )}
          />
          <Toggle
            checked={toggles.push_aliases}
            onChange={(v) => setToggles((t) => ({ ...t, push_aliases: v }))}
            title={__('Also update send-as aliases')}
            description={__(
              'Write the same signature on every verified alias of the user that is in an allowed domain, not only on their main address.',
            )}
          />
          {state.daily_sync && lastSync && (
            <p className="text-[11.5px] text-[var(--text-muted)]">
              {state.sync.running
                ? sprintf(
                    __('Daily sync in progress: %d users checked so far.'),
                    state.sync.scanned,
                  )
                : sprintf(
                    __('Last daily sync (UTC %1$s): %2$d pushed, %3$d failed.'),
                    lastSync,
                    state.sync.pushed,
                    state.sync.failed,
                  )}
            </p>
          )}
        </Section>

        <div className="flex justify-end gap-2 border-t border-[var(--border-default)] bg-[var(--bg-panel-soft)] px-5 py-4">
          <Button
            variant="primary"
            onClick={() => void onSave()}
            disabled={busy !== 'idle'}
            icon={busy === 'saving' ? <Spinner size={12} /> : <Save size={14} />}
          >
            {__('Save')}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-[var(--shadow-xs)]">
        <Section
          title={__('Test with an email')}
          description={__(
            'Acts as this user and lists their Gmail send-as addresses. Nothing is changed in their mailbox.',
          )}
        >
          <div className="flex gap-2">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              // i18n-ignore — sample address
              placeholder={state.domain_hint ? `name@${state.domain_hint}` : 'name@example.com'}
              aria-label={__('Email to test')}
            />
            <Button
              disabled={!state.configured || testEmail.trim() === '' || busy !== 'idle'}
              icon={busy === 'testing' ? <Spinner size={12} /> : <FlaskConical size={14} />}
              onClick={() => void onTest()}
            >
              {__('Test')}
            </Button>
          </div>

          {testResult && (
            <div
              role="status"
              className={cn(
                'space-y-1.5 rounded-md border px-3 py-2.5 text-[12.5px]',
                testResult.success
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-red-200 bg-red-50 text-red-900',
              )}
            >
              <p className="font-medium">{testResult.message}</p>
              {testResult.send_as && testResult.send_as.length > 0 && (
                <ul className="list-disc pl-5 font-mono text-[11.5px]">
                  {testResult.send_as.map((a) => (
                    <li key={a.email}>
                      {a.email}
                      {a.is_primary ? ` — ${__('primary')}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {testResult.warnings?.map((w) => (
                <p key={w} className="text-amber-800">
                  {w}
                </p>
              ))}
              {testResult.google && (
                <p className="text-[11.5px] opacity-80">
                  {sprintf(__('Google said: %s'), testResult.google)}
                </p>
              )}
              {testResult.help_url && (
                <ExternalStep href={testResult.help_url}>
                  {__('Open the page to fix it')}
                </ExternalStep>
              )}
            </div>
          )}
        </Section>

        <Section
          title={__('Push to everyone now')}
          description={__(
            'Writes every user’s primary signature to Gmail now. Users whose Gmail already has the current version are skipped unless you force it.',
          )}
        >
          <label className="flex items-center gap-2 text-[12.5px] text-[var(--text-secondary)]">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            {__('Re-push even when Gmail is already up to date')}
          </label>

          <div className="flex gap-2">
            {push.running ? (
              <Button
                icon={<Square size={13} />}
                onClick={() => {
                  stopRef.current = true;
                }}
              >
                {__('Stop')}
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={!state.configured}
                icon={<Play size={13} />}
                onClick={() => void onPushAll()}
              >
                {__('Push to everyone now')}
              </Button>
            )}
          </div>

          {(push.running || push.rows.length > 0 || push.error) && (
            <div className="space-y-2">
              <div
                className="h-2 overflow-hidden rounded-full bg-[var(--bg-hover)]"
                role="progressbar"
                aria-label={__('Push progress')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-[width]"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-[12px] text-[var(--text-secondary)]">
                {push.running
                  ? sprintf(__('Pushing… %1$d of %2$d users'), push.processed, push.total)
                  : push.stopped
                    ? sprintf(__('Stopped after %1$d of %2$d users.'), push.processed, push.total)
                    : sprintf(__('Done: %d users processed.'), push.processed)}
              </p>
              {Object.keys(counts).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(counts).map(([status, n]) => (
                    <span key={status} className="inline-flex items-center gap-1 text-[11.5px]">
                      <StatusPill status={status} />
                      <span className="text-[var(--text-secondary)]">{n}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {push.error && (
            <Banner
              type="error"
              message={push.error}
              onDismiss={() => setPush((p) => ({ ...p, error: null }))}
            />
          )}

          {push.rows.length > 0 && (
            <div className="max-h-96 overflow-auto rounded-md border border-[var(--border-default)]">
              <table className="w-full text-left text-[12px]">
                <thead className="sticky top-0 bg-[var(--bg-panel-soft)] text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2 font-semibold">{__('User')}</th>
                    <th className="px-3 py-2 font-semibold">{__('Status')}</th>
                    <th className="px-3 py-2 font-semibold">{__('Details')}</th>
                  </tr>
                </thead>
                <tbody>
                  {push.rows.map((row) => (
                    <tr
                      key={row.user_id}
                      className="border-t border-[var(--border-subtle)] align-top"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-[var(--text-primary)]">
                          {row.name || `#${row.user_id}`}
                        </div>
                        <div className="font-mono text-[11px] text-[var(--text-muted)]">
                          {row.email}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill status={row.status} />
                      </td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">
                        {row.error ?? row.message}
                        {row.google && (
                          <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                            {sprintf(__('Google said: %s'), row.google)}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
};
