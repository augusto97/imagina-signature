import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
import {
  IdCard,
  LayoutTemplate,
  Link2,
  Mail,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Users,
} from 'lucide-react';
import { Topbar } from '@admin/components/Topbar';
import { Button } from '@admin/components/Button';
import { EmptyState } from '@admin/components/EmptyState';
import { Modal } from '@admin/components/Modal';
import { Spinner } from '@admin/components/Spinner';
import { ProfileForm } from '@admin/components/ProfileForm';
import { AssignTemplateDialog } from '@admin/components/AssignTemplateDialog';
import { apiCall, apiCallWithHeaders, ApiError, getConfig } from '@admin/api';
import { __ } from '@admin/i18n';
import { cn } from '@admin/utils/cn';
import { Banner, type Flash } from '@admin/pages/settings/_shared';
import type { GroupRow } from '@admin/directoryTypes';
import {
  counters,
  editorUrl,
  gmailPill,
  gmailTargets,
  htmlPill,
  installPill,
  invitationTargets,
  linkLabel,
  outlookPill,
  stateFilters,
  type Tone,
} from './team/model';
import { StatePill } from './team/StatePill';
import { RowMenu, type RowMenuItem } from './team/RowMenu';
import { RecompilePanel } from './team/RecompilePanel';
import { GmailPushDialog, InviteDialog } from './team/DeployDialogs';
import { compileWithContext, loadCompiler } from './team/compileWithContext';
import { runRecompile, type RecompileProgress } from './team/recompile';
import type {
  RenderContext,
  StaleSignature,
  TeamResponse,
  TeamRow,
  TeamStateFilter,
} from './team/types';

const PER_PAGE = 25;
const SEARCH_DEBOUNCE_MS = 300;

const COUNTER_TONES: Record<Tone, string> = {
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  danger: 'text-red-700',
  info: 'text-[var(--text-primary)]',
  muted: 'text-[var(--text-muted)]',
};

function errorText(e: unknown): string {
  return e instanceof ApiError || e instanceof Error ? e.message : String(e);
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the prompt.
  }
  window.prompt(__('Copy the link:'), text);
  return false;
}

/** `?profile=<id>` — the editor's "edit profile" link when editing on someone's behalf. */
function profileFromUrl(): number | null {
  try {
    const id = Number(new URLSearchParams(window.location.search).get('profile'));
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Team console (`imgsig_manage_team`, 1.3.0): everyone who can use
 * signatures with their primary signature, the state of its server-held
 * HTML and where it is deployed (Gmail, Outlook add-in, install link) —
 * one `GET /admin/team` call per page, with counters for the whole
 * scope. Row and bulk actions: assign a template, send install
 * invitations, push to Gmail, copy an install link, edit the profile,
 * and edit the signature on the person's behalf. "Recompile N outdated"
 * rebuilds every outdated signature in this browser with its owner's
 * details ({@link runRecompile}).
 */
export const TeamPage: FC = () => {
  const config = getConfig();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(0);
  const [stateFilter, setStateFilter] = useState<TeamStateFilter>('all');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);

  const [data, setData] = useState<TeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [flash, setFlash] = useState<Flash | null>(null);

  const [assignFor, setAssignFor] = useState<number[] | null>(null);
  const [inviteFor, setInviteFor] = useState<number[] | null>(null);
  const [gmailFor, setGmailFor] = useState<{ ids: number[]; force: boolean } | null>(null);
  const [profileFor, setProfileFor] = useState<{ id: number; name: string } | null>(() => {
    const id = profileFromUrl();
    return id ? { id, name: '' } : null;
  });

  const [recompile, setRecompile] = useState<RecompileProgress | null>(null);
  const abort = useRef<AbortController | null>(null);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    apiCall<GroupRow[]>('/admin/groups')
      .then((rows) => setGroups(Array.isArray(rows) ? rows : []))
      .catch(() => setGroups([]));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(PER_PAGE),
      state: stateFilter,
    });
    if (query) params.set('search', query);
    if (group > 0) params.set('group', String(group));

    apiCall<TeamResponse>(`/admin/team?${params.toString()}`)
      .then((res) => {
        if (!alive) return;
        setData(res);
        setLoadError(null);
        setSelected(new Set());
      })
      .catch((e) => alive && setLoadError(errorText(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [query, group, stateFilter, page, reload]);

  useEffect(() => () => abort.current?.abort(), []);

  const rows = useMemo(() => data?.items ?? [], [data]);
  const channels = data?.channels ?? {
    gmail: { configured: false, auto_push: false },
    outlook: { enabled: false },
  };
  const staleCount = data?.summary.stale_signatures ?? 0;
  const recompiling = recompile?.running === true;

  const applyFilter = (next: TeamStateFilter): void => {
    setStateFilter(next);
    setPage(1);
  };

  const startRecompile = async (): Promise<void> => {
    if (recompiling) return;
    const controller = new AbortController();
    abort.current = controller;
    setFlash(null);
    setRecompile({
      total: staleCount,
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
      running: true,
      cancelled: false,
    });
    try {
      const compiler = await loadCompiler();
      await runRecompile(
        {
          listStale: async (afterId, perPage) => {
            const { data: items, headers } = await apiCallWithHeaders<StaleSignature[]>(
              `/admin/signatures/stale?after_id=${afterId}&per_page=${perPage}`,
            );
            return {
              items: Array.isArray(items) ? items : [],
              total: Number(headers.get('X-WP-Total') ?? 0),
            };
          },
          loadContext: (id) => apiCall<RenderContext>(`/admin/signatures/${id}/render-context`),
          compile: (context) => compileWithContext(compiler, context),
          store: (id, body) => apiCall(`/admin/signatures/${id}/html`, { method: 'POST', body }),
          isConflict: (e) => e instanceof ApiError && e.status === 409,
          describe: errorText,
        },
        { signal: controller.signal, onProgress: setRecompile },
      );
    } catch (e) {
      setFlash({ type: 'error', message: __('The recompile stopped: %s', errorText(e)) });
      setRecompile((prev) => (prev ? { ...prev, running: false } : prev));
    } finally {
      abort.current = null;
      refresh();
    }
  };

  const copyInstallLink = async (row: TeamRow): Promise<void> => {
    try {
      const link = await apiCall<{ url: string }>(`/admin/deploy/install-links/${row.id}`);
      const copied = await copyText(link.url);
      if (copied) {
        setFlash({
          type: 'success',
          message: __('Install link of %s copied to the clipboard.', row.display_name),
        });
      }
    } catch (e) {
      setFlash({ type: 'error', message: errorText(e) });
    }
  };

  const toggle = (id: number): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = (): void => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)));

  const rowItems = (row: TeamRow): RowMenuItem[] => {
    const items: RowMenuItem[] = [];
    const edit = editorUrl(config.urls.editor, row);
    if (edit) {
      items.push({
        key: 'edit',
        label: __('Edit signature on their behalf'),
        icon: <Pencil size={14} aria-hidden />,
        href: edit,
      });
    }
    items.push(
      {
        key: 'profile',
        label: __('Edit profile'),
        icon: <IdCard size={14} aria-hidden />,
        onSelect: () => setProfileFor({ id: row.id, name: row.display_name }),
      },
      {
        key: 'assign',
        label: __('Assign a template'),
        icon: <LayoutTemplate size={14} aria-hidden />,
        onSelect: () => setAssignFor([row.id]),
      },
      {
        key: 'invite',
        label: __('Send install invitation'),
        icon: <Send size={14} aria-hidden />,
        disabled: row.primary === null || row.html.state === 'none',
        onSelect: () => setInviteFor([row.id]),
      },
      {
        key: 'link',
        label: __('Copy install link'),
        icon: <Link2 size={14} aria-hidden />,
        onSelect: () => void copyInstallLink(row),
      },
    );
    if (channels.gmail.configured) {
      items.push({
        key: 'gmail',
        label: __('Push to Gmail'),
        icon: <Mail size={14} aria-hidden />,
        disabled: row.primary === null,
        onSelect: () => setGmailFor({ ids: [row.id], force: true }),
      });
    }
    return items;
  };

  const bulkGmail = gmailTargets(rows, selected);
  const bulkInvite = invitationTargets(rows, selected);

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title={__('Team')}
        description={__(
          'Everyone who can use signatures: their primary signature, whether its HTML is up to date and where it is deployed.',
        )}
        actions={
          <Button
            variant="primary"
            icon={<RefreshCw size={14} className={recompiling ? 'animate-spin' : undefined} />}
            onClick={() => void startRecompile()}
            disabled={recompiling || staleCount === 0}
            title={__(
              'Rebuild every outdated signature in this browser, with each owner’s details.',
            )}
          >
            {staleCount === 1
              ? __('Recompile 1 outdated')
              : __('Recompile %s outdated', String(staleCount))}
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-[90rem] space-y-4">
          {flash && (
            <Banner type={flash.type} message={flash.message} onDismiss={() => setFlash(null)} />
          )}

          {recompile && (
            <RecompilePanel
              progress={recompile}
              onCancel={() => abort.current?.abort()}
              onDismiss={() => setRecompile(null)}
            />
          )}

          {data && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {counters(data.summary, channels).map((c) => {
                const active = c.filter !== null && c.filter === stateFilter && c.filter !== 'all';
                const body = (
                  <>
                    <span className="block text-[11.5px] font-medium text-[var(--text-secondary)]">
                      {c.label}
                    </span>
                    <span
                      className={cn(
                        'mt-1 block text-[18px] font-semibold tabular-nums',
                        COUNTER_TONES[c.tone],
                      )}
                    >
                      {c.value}
                    </span>
                  </>
                );
                const cardClass = cn(
                  'rounded-lg border bg-[var(--bg-panel)] px-4 py-3 text-left shadow-[var(--shadow-xs)]',
                  active
                    ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]'
                    : 'border-[var(--border-default)]',
                );
                return c.filter !== null ? (
                  <button
                    key={c.key}
                    type="button"
                    className={cn(cardClass, 'transition-colors hover:bg-[var(--bg-hover)]')}
                    onClick={() => applyFilter(c.filter ?? 'all')}
                    aria-pressed={active}
                  >
                    {body}
                  </button>
                ) : (
                  <div key={c.key} className={cardClass}>
                    {body}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] p-3">
            <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
              <span className="text-[11.5px] font-medium text-[var(--text-secondary)]">
                {__('Search')}
              </span>
              <span className="relative">
                <Search
                  size={14}
                  aria-hidden
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={__('Name or email')}
                  className="!pl-8"
                />
              </span>
            </label>
            <label className="flex min-w-[12rem] flex-col gap-1">
              <span className="text-[11.5px] font-medium text-[var(--text-secondary)]">
                {__('Group')}
              </span>
              <select
                value={group}
                onChange={(e) => {
                  setGroup(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={0}>{__('All groups')}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[14rem] flex-col gap-1">
              <span className="text-[11.5px] font-medium text-[var(--text-secondary)]">
                {__('State')}
              </span>
              <select
                value={stateFilter}
                onChange={(e) => applyFilter(e.target.value as TeamStateFilter)}
              >
                {stateFilters().map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selected.size > 0 && (
            <div
              role="toolbar"
              aria-label={__('Selected people')}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--accent)] bg-[var(--bg-selected)] px-4 py-2.5"
            >
              <span className="mr-auto text-[13px] font-medium text-[var(--text-primary)]">
                {selected.size === 1 ? __('1 selected') : __('%s selected', String(selected.size))}
              </span>
              <Button
                size="sm"
                icon={<LayoutTemplate size={13} />}
                onClick={() => setAssignFor([...selected])}
              >
                {__('Assign a template')}
              </Button>
              <Button
                size="sm"
                icon={<Send size={13} />}
                onClick={() => setInviteFor(bulkInvite)}
                disabled={bulkInvite.length === 0}
              >
                {__('Send invitations')}
              </Button>
              {channels.gmail.configured && (
                <Button
                  size="sm"
                  icon={<Mail size={13} />}
                  onClick={() => setGmailFor({ ids: bulkGmail, force: false })}
                  disabled={bulkGmail.length === 0}
                >
                  {__('Push to Gmail')}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                {__('Clear selection')}
              </Button>
            </div>
          )}

          {loadError && (
            <Banner type="error" message={loadError} onDismiss={() => setLoadError(null)} />
          )}

          {!data && loading && (
            <div className="flex justify-center p-10">
              <Spinner size={20} />
            </div>
          )}

          {data && rows.length === 0 && (
            <EmptyState
              icon={<Users size={28} />}
              title={
                data.summary.users === 0 && !query && group === 0
                  ? __('Nobody can use signatures yet')
                  : __('Nobody matches')
              }
              description={
                data.summary.users === 0 && !query && group === 0
                  ? __('Give a role the “Use signatures” capability to see people here.')
                  : __('Try another search, group or state.')
              }
            />
          )}

          {data && rows.length > 0 && (
            <div
              className={cn(
                'overflow-x-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-[var(--shadow-xs)]',
                loading && 'opacity-60',
              )}
            >
              <table className="w-full min-w-[64rem] border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-[var(--border-default)] bg-[var(--bg-panel-soft)] text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                    <th scope="col" className="w-10 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={allOnPage}
                        onChange={toggleAll}
                        aria-label={__('Select everyone on this page')}
                        className="!h-4 !w-4 !p-0"
                      />
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">
                      {__('Person')}
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">
                      {__('Primary signature')}
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">
                      {__('HTML')}
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">
                      {__('Gmail')}
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">
                      {__('Outlook add-in')}
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">
                      {__('Install link')}
                    </th>
                    <th scope="col" className="w-12 px-3 py-2.5">
                      <span className="sr-only">{__('Actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(selected.has(row.id) && 'bg-[var(--bg-selected)]')}
                    >
                      <td className="px-3 py-3 align-top">
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={() => toggle(row.id)}
                          aria-label={__('Select %s', row.display_name)}
                          className="!h-4 !w-4 !p-0"
                        />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex min-w-[13rem] items-start gap-2.5">
                          {row.avatar ? (
                            <img
                              src={row.avatar}
                              alt=""
                              width={32}
                              height={32}
                              className="h-8 w-8 shrink-0 rounded-full"
                            />
                          ) : (
                            <span
                              aria-hidden
                              className="h-8 w-8 shrink-0 rounded-full bg-slate-200"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-[var(--text-primary)]">
                              {row.display_name}
                            </p>
                            <p className="truncate text-[11.5px] text-[var(--text-secondary)]">
                              {row.email}
                            </p>
                            {row.groups.length > 0 && (
                              <p className="mt-1 flex flex-wrap gap-1">
                                {row.groups.map((g) => (
                                  <span
                                    key={g.id}
                                    className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-panel-soft)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-default)]"
                                  >
                                    <span
                                      aria-hidden
                                      className="h-2 w-2 rounded-full"
                                      style={{ background: g.color }}
                                    />
                                    {g.name}
                                  </span>
                                ))}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        {row.primary ? (
                          <div className="min-w-[11rem]">
                            <p className="font-medium text-[var(--text-primary)]">
                              {row.primary.name || __('Untitled')}
                            </p>
                            <p className="text-[11.5px] text-[var(--text-secondary)]">
                              {linkLabel(row.primary)}
                            </p>
                            {row.signature_count > 1 && (
                              <p className="text-[10.5px] text-[var(--text-muted)]">
                                {__('%s signatures in total', String(row.signature_count))}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-[12px] text-[var(--text-muted)]">
                            {__('No signature yet')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <StatePill pill={htmlPill(row)} />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <StatePill pill={gmailPill(row)} />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <StatePill pill={outlookPill(row)} />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <StatePill pill={installPill(row)} />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <RowMenu
                          label={__('Actions for %s', row.display_name)}
                          items={rowItems(row)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && data.total_pages > 1 && (
            <nav
              aria-label={__('Pages')}
              className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-[var(--text-secondary)]"
            >
              <span>{__('%s people', String(data.total))}</span>
              <span className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                >
                  {__('Previous')}
                </Button>
                <span>{__('Page %1$s of %2$s', String(data.page), String(data.total_pages))}</span>
                <Button
                  size="sm"
                  onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
                  disabled={page >= data.total_pages || loading}
                >
                  {__('Next')}
                </Button>
              </span>
            </nav>
          )}
        </div>
      </div>

      <AssignTemplateDialog
        open={assignFor !== null}
        template={null}
        userIds={assignFor ?? []}
        onClose={() => setAssignFor(null)}
        onDone={refresh}
      />

      <InviteDialog
        userIds={inviteFor}
        onClose={() => setInviteFor(null)}
        onQueued={(count) => {
          setInviteFor(null);
          setFlash({
            type: 'success',
            message: __(
              '%s invitation(s) queued. They are sent in batches in the background.',
              String(count),
            ),
          });
          refresh();
        }}
      />

      <GmailPushDialog
        userIds={gmailFor?.ids ?? null}
        force={gmailFor?.force ?? false}
        onClose={(pushedAny) => {
          setGmailFor(null);
          if (pushedAny) refresh();
        }}
      />

      <Modal
        open={profileFor !== null}
        title={profileFor?.name ? __('Profile of %s', profileFor.name) : __('Profile')}
        onClose={() => setProfileFor(null)}
        width={680}
      >
        {profileFor && (
          <ProfileForm
            endpoint={`/admin/users/${profileFor.id}/profile`}
            onSaved={(payload) => {
              const changed = (payload.saved?.changed.length ?? 0) > 0;
              setFlash({
                type: 'success',
                message: changed
                  ? __('Profile saved. Their signatures need a recompile to show the new details.')
                  : __('Profile saved.'),
              });
              refresh();
            }}
          />
        )}
      </Modal>
    </div>
  );
};
