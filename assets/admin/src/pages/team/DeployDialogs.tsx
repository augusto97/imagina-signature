import { useEffect, useState, type FC } from 'react';
import { Button } from '@admin/components/Button';
import { Modal } from '@admin/components/Modal';
import { apiCall, ApiError } from '@admin/api';
import { __, _n } from '@admin/i18n';
import type { InvitationProgress } from '@admin/pages/settings/InvitationsTab';
import type { GmailPushRow } from '@admin/pages/settings/GoogleWorkspaceTab';

const MESSAGE_MAX = 2000;

function errorText(e: unknown): string {
  return e instanceof ApiError || e instanceof Error ? e.message : String(e);
}

interface InviteProps {
  /** Users to invite; null = closed. */
  userIds: number[] | null;
  onClose: () => void;
  /** Called with how many invitations were queued. */
  onQueued: (count: number) => void;
}

/**
 * Emails the chosen people their personal install link through the
 * invitations queue (`POST /admin/deploy/invitations`, sent in the
 * background in batches; progress in Settings → Invitations).
 */
export const InviteDialog: FC<InviteProps> = ({ userIds, onClose, onQueued }) => {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = userIds !== null;

  useEffect(() => {
    if (open) {
      setMessage('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const send = async (): Promise<void> => {
    if (!userIds || userIds.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const progress = await apiCall<InvitationProgress>('/admin/deploy/invitations', {
        method: 'POST',
        body: { user_ids: userIds, message: message.trim() },
      });
      onQueued(progress.total);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const count = userIds?.length ?? 0;

  return (
    <Modal
      open={open}
      title={__('Send install invitations')}
      onClose={busy ? () => {} : onClose}
      width={520}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {__('Cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void send()}
            disabled={busy || count === 0}
          >
            {busy ? __('Sending…') : __('Send')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[13px]">
        <p className="text-[var(--text-secondary)]">
          {_n(
            'Email %s person a personal link to install their signature in their email client.',
            'Email %s people a personal link to install their signature in their email client.',
            count,
            String(count),
          )}
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[var(--text-primary)]">
            {__('Personal message (optional)')}
          </span>
          <textarea
            rows={4}
            maxLength={MESSAGE_MAX}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={busy}
          />
        </label>
        <p className="text-[11.5px] text-[var(--text-muted)]">
          {__(
            'People without a compiled signature are skipped and listed in Settings → Invitations, where you can also follow the sending.',
          )}
        </p>
        {error && (
          <div className="rounded-md border border-[var(--danger)] bg-red-50 px-3 py-2 text-[12px] text-[var(--danger)]">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
};

interface GmailPushResponse {
  results: GmailPushRow[];
  next_offset: number | null;
  total: number;
  processed: number;
}

interface GmailProps {
  /** Users to push; null = closed. */
  userIds: number[] | null;
  /** Push even when the same HTML was already pushed (single-person action). */
  force?: boolean;
  onClose: (pushedAny: boolean) => void;
}

/** Status labels of `POST /admin/deploy/gmail/push` results, translated at render time. */
const PUSH_STATUS: Record<string, () => string> = {
  pushed: () => __('Pushed'),
  up_to_date: () => __('Already up to date'),
  no_signature: () => __('No signature'),
  needs_recompile: () => __('Needs recompile'),
  domain_not_allowed: () => __('Other domain'),
  no_email: () => __('No email'),
  user_not_found: () => __('Unknown user'),
  not_configured: () => __('Not connected'),
  retry: () => __('Will retry'),
  error: () => __('Error'),
};

/**
 * Pushes the chosen people's primary signatures to Gmail
 * (`POST /admin/deploy/gmail/push`, 20 per request, repeated with
 * `next_offset`) and lists every outcome. Starts as soon as it opens.
 */
export const GmailPushDialog: FC<GmailProps> = ({ userIds, force = false, onClose }) => {
  const [results, setResults] = useState<GmailPushRow[]>([]);
  const [total, setTotal] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = userIds !== null;

  useEffect(() => {
    if (!userIds) return;
    let alive = true;
    setResults([]);
    setError(null);
    setTotal(userIds.length);
    setRunning(true);

    void (async () => {
      try {
        let offset: number | null = 0;
        while (offset !== null && alive) {
          const page: GmailPushResponse = await apiCall<GmailPushResponse>(
            '/admin/deploy/gmail/push',
            {
              method: 'POST',
              body: { user_ids: userIds, force, offset },
            },
          );
          if (!alive) return;
          setResults((prev) => [...prev, ...page.results]);
          setTotal(page.total);
          offset = page.next_offset;
        }
      } catch (e) {
        if (alive) setError(errorText(e));
      } finally {
        if (alive) setRunning(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [userIds, force]);

  const pushed = results.filter((r) => r.status === 'pushed').length;
  const percent = total > 0 ? Math.round((results.length / total) * 100) : 0;

  return (
    <Modal
      open={open}
      title={__('Push to Gmail')}
      onClose={running ? () => {} : () => onClose(pushed > 0)}
      width={560}
      footer={
        <Button variant="primary" size="sm" onClick={() => onClose(pushed > 0)} disabled={running}>
          {running ? __('Pushing…') : __('Done')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3 text-[13px]">
        <div
          className="h-2 overflow-hidden rounded-full bg-[var(--bg-panel-soft)] ring-1 ring-inset ring-[var(--border-default)]"
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
        <p className="text-[12px] text-[var(--text-secondary)]" aria-live="polite">
          {__('%1$s of %2$s people', String(results.length), String(total))} —{' '}
          {__('%s pushed', String(pushed))}
        </p>
        {results.length > 0 && (
          <ul className="max-h-64 divide-y divide-[var(--border-default)] overflow-auto rounded-md border border-[var(--border-default)]">
            {results.map((r) => (
              <li
                key={r.user_id}
                className="flex flex-wrap items-baseline gap-x-2 px-3 py-2 text-[12px]"
              >
                <span className="font-medium text-[var(--text-primary)]">{r.name || r.email}</span>
                <span className="text-[var(--text-secondary)]">
                  {(PUSH_STATUS[r.status] ?? (() => r.status))()}
                </span>
                {(r.error || r.message) && (
                  <span className="basis-full text-[11.5px] text-[var(--text-muted)]">
                    {r.error || r.message}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <div className="rounded-md border border-[var(--danger)] bg-red-50 px-3 py-2 text-[12px] text-[var(--danger)]">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
};
