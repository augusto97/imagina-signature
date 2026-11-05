import { useEffect, useState, type FC, type ReactNode } from 'react';
import { Button } from '@admin/components/Button';
import { Modal } from '@admin/components/Modal';
import { apiCall, ApiError, getConfig } from '@admin/api';
import { __ } from '@admin/i18n';
import { cn } from '@admin/utils/cn';
import { WP_ROLES } from '@admin/utils/roles';
import type { AssignResult, TemplateRow } from '@admin/types';
import type { GroupRow } from '@admin/directoryTypes';

type Scope =
  | { kind: 'all' }
  | { kind: 'role'; role: string }
  | { kind: 'groups'; ids: number[] }
  | { kind: 'users'; ids: string };

type AssignMode = 'linked' | 'copy';

/** Running totals of an assignment (summed over its chunks). */
export interface AssignTotals {
  total: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

const EMPTY_TOTALS: AssignTotals = {
  total: 0,
  processed: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
};

interface Props {
  open: boolean;
  /**
   * The template to assign (Templates page). Null: the dialog loads the
   * template list and shows a picker (Team page).
   */
  template: TemplateRow | null;
  /**
   * Fixed audience (the Team page selection). When given, the user
   * scope picker is replaced by "N selected users".
   */
  userIds?: number[];
  onClose: () => void;
  /** Called once every chunk was processed. */
  onDone?: (totals: AssignTotals) => void;
}

/** Whether the bootstrap lets this user manage the team (missing on older bootstraps = yes). */
function canManageTeam(): boolean {
  try {
    return getConfig().capabilities.manage_team !== false;
  } catch {
    return false;
  }
}

function isGroupRow(value: unknown): value is GroupRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'number' &&
    typeof (value as { name?: unknown }).name === 'string'
  );
}

/**
 * Assigns a template — linked or as a copy — to every user in scope
 * through `POST /admin/templates/:id/assign` (1.3.0), which processes
 * 50 users per request: the dialog repeats the call with `next_offset`
 * and shows a progress bar.
 *
 * Scope: everyone who can use signatures, one WordPress role, one or
 * more groups (`/admin/groups`), explicit user ids — or the fixed
 * `userIds` the Team page passes.
 *
 *  - Linked: each user's signature follows the template — later edits
 *    of the template reach it; employees keep their details and text.
 *  - Copy: each user gets an independent copy (users who already have
 *    one from this template are skipped).
 */
export const AssignTemplateDialog: FC<Props> = ({ open, template, userIds, onClose, onDone }) => {
  const [scope, setScope] = useState<Scope>({ kind: 'all' });
  const [mode, setMode] = useState<AssignMode>('linked');
  const [makePrimary, setMakePrimary] = useState(true);
  const [running, setRunning] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [totals, setTotals] = useState<AssignTotals | null>(null);
  const [done, setDone] = useState(false);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [templateId, setTemplateId] = useState<number>(0);

  const fixedUsers = userIds !== undefined;

  useEffect(() => {
    if (!open) return;
    setScope({ kind: 'all' });
    setMode('linked');
    setMakePrimary(true);
    setRunning(false);
    setFormError(null);
    setTotals(null);
    setDone(false);
    setTemplateId(template?.id ?? 0);

    let alive = true;
    if (!fixedUsers && canManageTeam()) {
      apiCall<unknown>('/admin/groups')
        .then((rows) => alive && setGroups(Array.isArray(rows) ? rows.filter(isGroupRow) : []))
        .catch(() => alive && setGroups([]));
    }
    if (!template) {
      setTemplates(null);
      apiCall<TemplateRow[]>('/templates?per_page=100')
        .then((rows) => {
          if (!alive) return;
          const list = Array.isArray(rows) ? rows : [];
          setTemplates(list);
          setTemplateId((current) => current || list[0]?.id || 0);
        })
        .catch((e: Error) => {
          if (!alive) return;
          setTemplates([]);
          setFormError(e.message);
        });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id]);

  const selected = template ?? templates?.find((t) => t.id === templateId) ?? null;

  const targets = (): Record<string, unknown> | null => {
    if (fixedUsers) {
      if (userIds.length === 0) {
        setFormError(__('Select at least one user.'));
        return null;
      }
      return { user_ids: userIds };
    }
    if (scope.kind === 'all') return { all: true };
    if (scope.kind === 'role') {
      if (!scope.role) {
        setFormError(__('Pick a role.'));
        return null;
      }
      return { role: scope.role };
    }
    if (scope.kind === 'groups') {
      if (scope.ids.length === 0) {
        setFormError(__('Pick at least one group.'));
        return null;
      }
      return { group_ids: scope.ids };
    }
    const ids = scope.ids
      .split(',')
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) {
      setFormError(__('Provide at least one user ID.'));
      return null;
    }
    return { user_ids: ids };
  };

  const submit = async (): Promise<void> => {
    if (running) return;
    setFormError(null);
    if (!selected) {
      setFormError(__('Pick a template.'));
      return;
    }
    const body = targets();
    if (!body) return;

    setRunning(true);
    setDone(false);
    let sum: AssignTotals = { ...EMPTY_TOTALS };
    setTotals(sum);

    try {
      let offset: number | null = 0;
      while (offset !== null) {
        const chunk: AssignResult = await apiCall<AssignResult>(
          `/admin/templates/${selected.id}/assign`,
          {
            method: 'POST',
            body: { ...body, mode, make_primary: makePrimary, offset },
          },
        );
        sum = {
          total: chunk.total,
          processed: sum.processed + chunk.processed,
          created: sum.created + chunk.created,
          updated: sum.updated + chunk.updated,
          skipped: sum.skipped + chunk.skipped,
          failed: sum.failed + chunk.failed,
        };
        setTotals(sum);
        offset = chunk.next_offset;
      }
      setDone(true);
      onDone?.(sum);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const percent =
    totals && totals.total > 0 ? Math.round((totals.processed / totals.total) * 100) : 0;

  const toggleGroup = (id: number): void => {
    setScope((prev) => {
      const ids = prev.kind === 'groups' ? prev.ids : [];
      return {
        kind: 'groups',
        ids: ids.includes(id) ? ids.filter((g) => g !== id) : [...ids, id],
      };
    });
  };

  return (
    <Modal
      open={open}
      title={template ? __('Apply “%s”', template.name) : __('Assign a template')}
      onClose={running ? () => {} : onClose}
      footer={
        done ? (
          <Button variant="primary" size="sm" onClick={onClose}>
            {__('Done')}
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={onClose} disabled={running}>
              {__('Cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void submit()}
              disabled={running || !selected}
            >
              {running ? __('Applying…') : __('Apply')}
            </Button>
          </>
        )
      }
    >
      <form
        className="flex flex-col gap-3 text-[13px]"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {!template && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[var(--text-primary)]">
              {__('Template')}
            </span>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(Number(e.target.value))}
              disabled={running || done || templates === null || templates.length === 0}
            >
              {templates === null && <option value={0}>{__('Loading…')}</option>}
              {templates?.length === 0 && <option value={0}>{__('No templates yet')}</option>}
              {templates?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <fieldset className="flex flex-col gap-2" disabled={running || done}>
          <span className="text-[12px] font-medium text-[var(--text-primary)]">{__('Users')}</span>
          {fixedUsers ? (
            <p className="rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-3 text-[12.5px] text-[var(--text-secondary)]">
              {userIds.length === 1
                ? __('1 selected user')
                : __('%s selected users', String(userIds.length))}
            </p>
          ) : (
            <>
              <ScopeOption
                label={__('All eligible users')}
                description={__('Everyone with the “Use signatures” capability.')}
                checked={scope.kind === 'all'}
                onSelect={() => setScope({ kind: 'all' })}
              />

              <ScopeOption
                label={__('By role')}
                description={__('Limit to a single WordPress role.')}
                checked={scope.kind === 'role'}
                onSelect={() => setScope({ kind: 'role', role: 'editor' })}
              >
                {scope.kind === 'role' && (
                  <select
                    value={scope.role}
                    onChange={(e) => setScope({ kind: 'role', role: e.target.value })}
                    className="!w-auto"
                  >
                    {WP_ROLES.map(({ slug, label }) => (
                      <option key={slug} value={slug}>
                        {label()}
                      </option>
                    ))}
                  </select>
                )}
              </ScopeOption>

              {groups.length > 0 && (
                <ScopeOption
                  label={__('By group')}
                  description={__('Members of one or more groups.')}
                  checked={scope.kind === 'groups'}
                  onSelect={() => setScope({ kind: 'groups', ids: [] })}
                >
                  {scope.kind === 'groups' && (
                    <div
                      className="flex flex-wrap gap-x-4 gap-y-1.5"
                      role="group"
                      aria-label={__('Groups')}
                    >
                      {groups.map((g) => (
                        <label key={g.id} className="inline-flex items-center gap-1.5 text-[12px]">
                          <input
                            type="checkbox"
                            checked={scope.ids.includes(g.id)}
                            onChange={() => toggleGroup(g.id)}
                            className="!h-4 !w-4 !p-0"
                          />
                          <span
                            aria-hidden
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: g.color }}
                          />
                          {g.name}
                          {typeof g.member_count === 'number' && (
                            <span className="text-[var(--text-muted)]">({g.member_count})</span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </ScopeOption>
              )}

              <ScopeOption
                label={__('Specific user IDs')}
                description={__('Comma-separated WP user IDs. Useful for targeted campaigns.')}
                checked={scope.kind === 'users'}
                onSelect={() => setScope({ kind: 'users', ids: '' })}
              >
                {scope.kind === 'users' && (
                  <input
                    type="text"
                    value={scope.ids}
                    onChange={(e) => setScope({ kind: 'users', ids: e.target.value })}
                    placeholder="1, 2, 3"
                  />
                )}
              </ScopeOption>
            </>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2" disabled={running || done}>
          <span className="text-[12px] font-medium text-[var(--text-primary)]">{__('Mode')}</span>
          <ScopeOption
            label={__('Linked (recommended)')}
            description={__(
              'Signatures follow this template: when you edit it, everyone gets the new design. Employees keep their details and text.',
            )}
            checked={mode === 'linked'}
            onSelect={() => setMode('linked')}
          />
          <ScopeOption
            label={__('Copy')}
            description={__(
              'Each user gets an independent copy. Later template changes don’t reach it; users who already have a copy are skipped.',
            )}
            checked={mode === 'copy'}
            onSelect={() => setMode('copy')}
          />
        </fieldset>

        <label className="flex cursor-pointer items-center gap-2 text-[12px]">
          <input
            type="checkbox"
            checked={makePrimary}
            onChange={(e) => setMakePrimary(e.target.checked)}
            disabled={running || done}
            className="!h-4 !w-4 !p-0"
          />
          <span className="text-[var(--text-secondary)]">
            {__('Make it each user’s primary signature (the one deployed to Gmail and Outlook)')}
          </span>
        </label>

        {totals && (
          <div className="flex flex-col gap-1.5" aria-live="polite">
            <div
              className="h-2 overflow-hidden rounded-full bg-[var(--bg-panel-soft)]"
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
            <p className="text-[12px] text-[var(--text-secondary)]">
              {__('%1$s of %2$s users', String(totals.processed), String(totals.total))} —{' '}
              <strong>{totals.created}</strong> {__('created')}, <strong>{totals.updated}</strong>{' '}
              {__('updated')}, <strong>{totals.skipped}</strong> {__('skipped')}
              {totals.failed > 0 && (
                <>
                  , <strong className="text-[var(--danger)]">{totals.failed}</strong> {__('failed')}
                </>
              )}
              .
            </p>
          </div>
        )}

        {formError && (
          <div className="rounded-md border border-[var(--danger)] bg-red-50 px-3 py-2 text-[12px] text-[var(--danger)]">
            {formError}
          </div>
        )}
      </form>
    </Modal>
  );
};

const ScopeOption: FC<{
  label: string;
  description: string;
  checked: boolean;
  onSelect: () => void;
  children?: ReactNode;
}> = ({ label, description, checked, onSelect, children }) => (
  <div
    className={cn(
      'flex flex-col gap-1.5 rounded-md border p-3 transition-colors',
      checked
        ? 'border-[var(--accent)] bg-[var(--bg-selected)]'
        : 'border-[var(--border-default)] hover:bg-[var(--bg-hover)]',
    )}
  >
    <label className="flex cursor-pointer items-start gap-2">
      <input type="radio" checked={checked} onChange={onSelect} className="mt-0.5 !h-4 !w-4 !p-0" />
      <div className="flex-1">
        <div className="text-[12.5px] font-medium text-[var(--text-primary)]">{label}</div>
        <div className="text-[11px] text-[var(--text-muted)]">{description}</div>
      </div>
    </label>
    {checked && children && <div className="ml-6">{children}</div>}
  </div>
);
