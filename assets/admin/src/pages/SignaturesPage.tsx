import { useEffect, useMemo, useState, type FC } from 'react';
import { Plus, Search, FileSignature, Pencil, Copy, Trash2, MoreHorizontal } from 'lucide-react';
import { Topbar } from '@admin/components/Topbar';
import { Button } from '@admin/components/Button';
import { StatusPill } from '@admin/components/StatusPill';
import { EmptyState } from '@admin/components/EmptyState';
import { Spinner } from '@admin/components/Spinner';
import { apiCall, ApiError, getConfig } from '@admin/api';
import { __ } from '@admin/i18n';
import type { SignatureRow } from '@admin/types';

type StatusFilter = 'all' | SignatureRow['status'];

/**
 * Signatures listing — fetches `/signatures`, renders the table,
 * supports a status filter and a name search, plus per-row
 * Edit / Duplicate / Delete actions.
 */
export const SignaturesPage: FC = () => {
  const config = getConfig();

  const [items, setItems] = useState<SignatureRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = (): Promise<void> => {
    return apiCall<SignatureRow[]>('/signatures?per_page=100')
      .then((data) => setItems(data))
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (!items) return [];
    return items.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (search.trim() && !row.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [items, statusFilter, search]);

  const editorUrl = (id: number): string => config.urls.editor.replace('{id}', String(id));
  const newSignatureUrl = config.urls.editor.replace('{id}', '0');

  const onDuplicate = async (row: SignatureRow): Promise<void> => {
    setBusyId(row.id);
    try {
      await apiCall(`/signatures/${row.id}/duplicate`, { method: 'POST' });
      await load();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : (e as Error).message;
      window.alert(__('Could not duplicate: %s', message));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (row: SignatureRow): Promise<void> => {
    if (!window.confirm(__('Delete "%s"? This cannot be undone.', row.name))) {
      return;
    }
    setBusyId(row.id);
    try {
      await apiCall(`/signatures/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : (e as Error).message;
      window.alert(__('Could not delete: %s', message));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title={__('My Signatures')}
        description={__('Visual editor for HTML email signatures. Each user sees only their own.')}
        actions={
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => { window.location.href = newSignatureUrl; }}>
            {__('New signature')}
          </Button>
        }
      />

      <div className="flex flex-1 flex-col overflow-hidden p-6">
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="search"
              placeholder={__('Search by name…')}
              className="!pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="!w-auto"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">{__('All statuses')}</option>
            <option value="draft">{__('Drafts')}</option>
            <option value="ready">{__('Ready')}</option>
            <option value="archived">{__('Archived')}</option>
          </select>
          <span className="ml-auto text-[12px] text-[var(--text-muted)]">
            {items === null
              ? ''
              : __('%s signature(s)', String(filtered.length))}
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-[var(--shadow-xs)]">
          {error && (
            <div className="p-6 text-center text-[13px] text-[var(--danger)]">{error}</div>
          )}

          {!error && items === null && (
            <div className="flex h-full items-center justify-center p-10">
              <Spinner size={20} />
            </div>
          )}

          {!error && items !== null && filtered.length === 0 && (
            <div className="p-6">
              <EmptyState
                icon={<FileSignature size={32} strokeWidth={1.4} />}
                title={
                  items.length === 0
                    ? __('No signatures yet')
                    : __('No signatures match your filters')
                }
                description={
                  items.length === 0
                    ? __('Create your first signature to get started.')
                    : __('Try clearing the search or status filter.')
                }
                action={
                  items.length === 0 ? (
                    <Button
                      variant="primary"
                      icon={<Plus size={14} />}
                      onClick={() => { window.location.href = newSignatureUrl; }}
                    >
                      {__('New signature')}
                    </Button>
                  ) : null
                }
              />
            </div>
          )}

          {!error && filtered.length > 0 && (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-[var(--border-default)] bg-[var(--bg-panel-soft)]">
                <tr>
                  <Th>{__('Name')}</Th>
                  <Th>{__('Status')}</Th>
                  <Th>{__('Last edited')}</Th>
                  <Th align="right">{__('Actions')}</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const busy = busyId === row.id;
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-panel-soft)]"
                    >
                      <td className="px-4 py-3">
                        <a
                          href={editorUrl(row.id)}
                          className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)]"
                        >
                          {row.name || __('Untitled')}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[var(--text-secondary)]">
                        {formatDate(row.updated_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<Pencil size={12} />}
                            onClick={() => { window.location.href = editorUrl(row.id); }}
                          >
                            {__('Edit')}
                          </Button>
                          <RowMenu
                            disabled={busy}
                            onDuplicate={() => void onDuplicate(row)}
                            onDelete={() => void onDelete(row)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

const Th: FC<{ children: React.ReactNode; align?: 'left' | 'right' }> = ({
  children,
  align = 'left',
}) => (
  <th
    className="is-section-label px-4 py-2.5 font-semibold"
    style={{ textAlign: align }}
  >
    {children}
  </th>
);

const RowMenu: FC<{
  disabled: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
}> = ({ disabled, onDuplicate, onDelete }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled}
        icon={<MoreHorizontal size={14} />}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sr-only">{__('More')}</span>
      </Button>
      {open && (
        <div
          className="absolute right-0 top-full z-10 mt-1 w-40 overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-[var(--shadow-md)]"
          onMouseLeave={() => setOpen(false)}
        >
          <MenuItem
            icon={<Copy size={12} />}
            onClick={() => {
              setOpen(false);
              onDuplicate();
            }}
          >
            {__('Duplicate')}
          </MenuItem>
          <MenuItem
            icon={<Trash2 size={12} />}
            destructive
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            {__('Delete')}
          </MenuItem>
        </div>
      )}
    </div>
  );
};

const MenuItem: FC<{
  icon?: React.ReactNode;
  destructive?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ icon, destructive, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors hover:bg-[var(--bg-hover)] ${
      destructive ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'
    }`}
  >
    {icon}
    {children}
  </button>
);

function formatDate(value: string): string {
  if (!value) return '—';
  // DB timestamp is "Y-m-d H:i:s" UTC. Convert to local-locale string.
  const iso = value.replace(' ', 'T') + 'Z';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
