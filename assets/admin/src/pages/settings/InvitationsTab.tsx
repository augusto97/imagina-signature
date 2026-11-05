import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { BellRing, Save, Send, Users, X } from 'lucide-react';
import { Button } from '@admin/components/Button';
import { Spinner } from '@admin/components/Spinner';
import { apiCall, ApiError, getConfig } from '@admin/api';
import { __ } from '@admin/i18n';
import { cn } from '@admin/utils/cn';
import { Banner, Field, Section, type Flash } from './_shared';

/** REST: GET/PATCH /admin/deploy/invitations/settings. */
export interface ReminderSettings {
  enabled: boolean;
  after_days: number;
  max: number;
}

/** REST: GET /admin/deploy/invitations/progress (and POST / DELETE responses). */
export interface InvitationProgress {
  id: string | null;
  kind: 'invite' | 'reminder' | null;
  status: 'idle' | 'running' | 'done' | 'cancelled';
  running: boolean;
  total: number;
  processed: number;
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
  percent: number;
  finished_at: string | null;
  report: Array<{
    user_id: number;
    name: string;
    email: string;
    status: 'skipped' | 'failed';
    reason: string;
  }>;
  warnings?: string[];
}

export interface UserOption {
  id: number;
  name: string;
  email: string;
}

const POLL_MS = 3000;
const MESSAGE_MAX = 2000;

/** Why a user was not emailed — labels are lazy so they translate at render time. */
const REASONS: Record<string, () => string> = {
  no_user: () => __('User no longer exists'),
  no_access: () => __('No access to signatures'),
  no_email: () => __('No valid email address'),
  no_signature: () => __('No signature yet'),
  not_ready: () => __('Signature not ready — open it in the editor and save it'),
  already_installed: () => __('Already installed'),
  mail_failed: () => __('The email could not be sent'),
};

/** Accepts a plain array or `{ items | users: [...] }` with WP or plugin field names. */
function normalizeUsers(data: unknown): UserOption[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? ((data as { items?: unknown; users?: unknown }).items ??
        (data as { users?: unknown }).users)
      : null;
  if (!Array.isArray(list)) return [];
  const out: UserOption[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const u = raw as Record<string, unknown>;
    const id = Number(u.id ?? u.ID ?? u.user_id);
    if (!Number.isInteger(id) || id <= 0) continue;
    out.push({
      id,
      name: String(u.display_name ?? u.name ?? u.login ?? u.user_login ?? `#${id}`),
      email: String(u.email ?? u.user_email ?? ''),
    });
  }
  return out;
}

/**
 * User search: the plugin's `GET /admin/users` when the server has it,
 * else WordPress core's `GET /wp/v2/users?search=`.
 */
async function searchUsers(term: string): Promise<UserOption[]> {
  const q = encodeURIComponent(term);
  try {
    return normalizeUsers(await apiCall<unknown>(`/admin/users?search=${q}&per_page=20`));
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) throw e;
  }

  const config = getConfig();
  const root = config.apiBase.replace(/imagina-signatures\/v1\/?$/, '');
  const url = `${root}wp/v2/users${root.includes('?') ? '&' : '?'}search=${q}&per_page=20&context=edit&_fields=id,name,email`;
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'X-WP-Nonce': config.restNonce, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new ApiError(
      'user_search_failed',
      __('Request failed (%s)', response.status),
      response.status,
    );
  }
  return normalizeUsers(await response.json());
}

/**
 * Settings → Invitations: email everyone (or chosen people) their
 * personal install link, follow the sending progress, and configure
 * the automatic reminders.
 */
export const InvitationsTab: FC = () => {
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [progress, setProgress] = useState<InvitationProgress | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  const [audience, setAudience] = useState<'all' | 'pick'>('all');
  const [picked, setPicked] = useState<UserOption[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const fail = useCallback((e: unknown): void => {
    if (e instanceof ApiError && e.status === 403) {
      setForbidden(true);
      return;
    }
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  const loadProgress = useCallback((): Promise<void> => {
    return apiCall<InvitationProgress>('/admin/deploy/invitations/progress')
      .then(setProgress)
      .catch(fail);
  }, [fail]);

  useEffect(() => {
    void apiCall<ReminderSettings>('/admin/deploy/invitations/settings')
      .then(setSettings)
      .catch(fail);
    void loadProgress();
  }, [fail, loadProgress]);

  // Poll while a run is in progress.
  const running = progress?.running === true;
  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => void loadProgress(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [running, loadProgress]);

  if (forbidden) {
    return (
      <Banner
        type="error"
        message={__(
          'Sending invitations requires the "Manage team" permission (imgsig_manage_team).',
        )}
        onDismiss={() => setForbidden(false)}
      />
    );
  }

  if (settings === null && !error) {
    return (
      <div className="flex justify-center p-10">
        <Spinner size={20} />
      </div>
    );
  }

  const canSend = !sending && !running && (audience === 'all' || picked.length > 0);

  const send = async (): Promise<void> => {
    if (!canSend) return;
    const count =
      audience === 'all'
        ? __('everyone with access to signatures')
        : __('%s people', String(picked.length));
    if (!window.confirm(__('Email the install link to %s?', count))) return;

    setSending(true);
    setFlash(null);
    try {
      const body: Record<string, unknown> = { message: message.trim() };
      if (audience === 'all') body.all = true;
      else body.user_ids = picked.map((u) => u.id);
      const next = await apiCall<InvitationProgress>('/admin/deploy/invitations', {
        method: 'POST',
        body,
      });
      setProgress(next);
      setFlash({
        type: 'success',
        message: __(
          '%s invitation(s) queued. They are sent in batches in the background.',
          String(next.total),
        ),
      });
    } catch (e) {
      setFlash({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  };

  const cancel = async (): Promise<void> => {
    try {
      setProgress(
        await apiCall<InvitationProgress>('/admin/deploy/invitations', { method: 'DELETE' }),
      );
    } catch (e) {
      setFlash({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const saveSettings = async (): Promise<void> => {
    if (settings === null) return;
    setSavingSettings(true);
    setFlash(null);
    try {
      const next = await apiCall<ReminderSettings>('/admin/deploy/invitations/settings', {
        method: 'PATCH',
        body: settings,
      });
      setSettings(next);
      setFlash({ type: 'success', message: __('Reminder settings saved.') });
    } catch (e) {
      setFlash({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-4">
      {flash && (
        <Banner type={flash.type} message={flash.message} onDismiss={() => setFlash(null)} />
      )}
      {error && <Banner type="error" message={error} onDismiss={() => setError(null)} />}

      <div className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-[var(--shadow-xs)]">
        <Section
          title={__('Send invitations')}
          description={__(
            'Emails each person a personal link where they install their signature in about a minute. Only people whose signature is ready receive it; everyone else is listed in the report below.',
          )}
        >
          <div className="space-y-1.5" role="radiogroup" aria-label={__('Recipients')}>
            <label className="flex cursor-pointer items-center gap-2 text-[13px]">
              <input
                type="radio"
                name="imgsig-audience"
                checked={audience === 'all'}
                onChange={() => setAudience('all')}
              />
              {__('Everyone with access to signatures')}
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[13px]">
              <input
                type="radio"
                name="imgsig-audience"
                checked={audience === 'pick'}
                onChange={() => setAudience('pick')}
              />
              {__('Choose people')}
            </label>
          </div>

          {audience === 'pick' && <UserPicker picked={picked} onChange={setPicked} />}

          <Field
            label={__('Message (optional)')}
            hint={__('Shown in the email above the install button. Plain text.')}
          >
            <textarea
              rows={3}
              maxLength={MESSAGE_MAX}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={__('Hi team, here is our new email signature…')}
            />
          </Field>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              icon={sending ? <Spinner size={14} /> : <Send size={14} />}
              disabled={!canSend}
              onClick={() => void send()}
            >
              {__('Send invitations')}
            </Button>
            {running && (
              <span className="text-[12px] text-[var(--text-muted)]">
                {__('Wait until the current run finishes.')}
              </span>
            )}
          </div>
        </Section>

        {progress && progress.status !== 'idle' && (
          <Section title={progress.kind === 'reminder' ? __('Reminders') : __('Progress')}>
            <ProgressView progress={progress} onCancel={() => void cancel()} />
          </Section>
        )}
      </div>

      {settings && (
        <div className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-[var(--shadow-xs)]">
          <Section
            title={__('Reminders')}
            description={__(
              'Once a day, people who were invited but have not pressed "I\'ve installed it" get a reminder.',
            )}
          >
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
              />
              <BellRing size={14} className="text-[var(--text-muted)]" />
              {__('Send reminders automatically')}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={__('Days between reminders')}
                hint={__('Counted from the invitation, then from the last reminder.')}
              >
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={settings.after_days}
                  disabled={!settings.enabled}
                  onChange={(e) => setSettings({ ...settings, after_days: Number(e.target.value) })}
                />
              </Field>
              <Field label={__('Maximum reminders')} hint={__('Per invitation.')}>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={settings.max}
                  disabled={!settings.enabled}
                  onChange={(e) => setSettings({ ...settings, max: Number(e.target.value) })}
                />
              </Field>
            </div>
            <div>
              <Button
                variant="secondary"
                icon={savingSettings ? <Spinner size={14} /> : <Save size={14} />}
                disabled={savingSettings}
                onClick={() => void saveSettings()}
              >
                {__('Save reminder settings')}
              </Button>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
};

const ProgressView: FC<{ progress: InvitationProgress; onCancel: () => void }> = ({
  progress,
  onCancel,
}) => {
  const label =
    progress.status === 'running'
      ? __('Sending… %s of %s', String(progress.processed), String(progress.total))
      : progress.status === 'cancelled'
        ? __('Cancelled after %s of %s', String(progress.processed), String(progress.total))
        : __('Finished: %s of %s processed', String(progress.processed), String(progress.total));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[12.5px] text-[var(--text-secondary)]">
        <span>{label}</span>
        {progress.running && (
          <Button size="sm" variant="ghost" icon={<X size={12} />} onClick={onCancel}>
            {__('Cancel')}
          </Button>
        )}
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-[var(--bg-hover)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-label={__('Invitations sent')}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all',
            progress.running ? 'bg-[var(--accent)]' : 'bg-emerald-500',
          )}
          style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-3 text-[12px]">
        <span className="text-emerald-700">{__('Sent: %s', String(progress.sent))}</span>
        <span className="text-amber-700">{__('Skipped: %s', String(progress.skipped))}</span>
        <span className="text-red-700">{__('Failed: %s', String(progress.failed))}</span>
      </div>
      {progress.warnings?.includes('groups_unavailable') && (
        <p className="text-[12px] text-amber-700">
          {__('Groups are not available on this site; only people were invited.')}
        </p>
      )}
      {progress.report.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[12px] text-[var(--text-secondary)]">
            {__('%s person(s) not emailed', String(progress.report.length))}
          </summary>
          <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-[12px]">
            {progress.report.map((row) => (
              <li key={`${row.user_id}-${row.reason}`} className="flex flex-wrap gap-x-2">
                <span className="font-medium text-[var(--text-primary)]">
                  {row.name || `#${row.user_id}`}
                </span>
                {row.email && <span className="text-[var(--text-muted)]">{row.email}</span>}
                <span className={row.status === 'failed' ? 'text-red-700' : 'text-amber-700'}>
                  {(REASONS[row.reason] ?? (() => row.reason))()}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};

const UserPicker: FC<{ picked: UserOption[]; onChange: (next: UserOption[]) => void }> = ({
  picked,
  onChange,
}) => {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<UserOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setResults([]);
      return undefined;
    }
    const id = ++seq.current;
    const timer = window.setTimeout(() => {
      setBusy(true);
      setError(null);
      searchUsers(q)
        .then((found) => {
          if (id === seq.current) setResults(found);
        })
        .catch((e: Error) => {
          if (id === seq.current) setError(e.message);
        })
        .finally(() => {
          if (id === seq.current) setBusy(false);
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [term]);

  const add = (user: UserOption): void => {
    if (!picked.some((u) => u.id === user.id)) onChange([...picked, user]);
  };
  const remove = (id: number): void => onChange(picked.filter((u) => u.id !== id));

  return (
    <div className="space-y-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-3">
      <div className="relative">
        <Users
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          type="search"
          className="!pl-9"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={__('Search people by name or email…')}
          aria-label={__('Search people')}
        />
      </div>
      {busy && <Spinner size={14} />}
      {error && <p className="text-[12px] text-[var(--danger)]">{error}</p>}
      {results.length > 0 && (
        <ul className="max-h-48 overflow-auto rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)]">
          {results.map((user) => {
            const chosen = picked.some((u) => u.id === user.id);
            return (
              <li key={user.id}>
                <button
                  type="button"
                  disabled={chosen}
                  onClick={() => add(user)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-[var(--bg-hover)] disabled:opacity-50"
                >
                  <span className="font-medium text-[var(--text-primary)]">{user.name}</span>
                  <span className="text-[var(--text-muted)]">{user.email}</span>
                  <span className="ml-auto text-[11px] text-[var(--accent)]">
                    {chosen ? __('Added') : __('Add')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((user) => (
            <span
              key={user.id}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-selected)] px-2 py-0.5 text-[12px] text-[var(--text-primary)]"
            >
              {user.name}
              <button
                type="button"
                onClick={() => remove(user.id)}
                aria-label={__('Remove %s', user.name)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
