import { useCallback, useEffect, useState, type FC } from 'react';
import { FileSpreadsheet, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { Topbar } from '@admin/components/Topbar';
import { Button } from '@admin/components/Button';
import { EmptyState } from '@admin/components/EmptyState';
import { Modal } from '@admin/components/Modal';
import { Spinner } from '@admin/components/Spinner';
import { apiCall, ApiError } from '@admin/api';
import { __ } from '@admin/i18n';
import { cn } from '@admin/utils/cn';
import { Banner, type Flash } from '@admin/pages/settings/_shared';
import type { GroupRow } from '@admin/directoryTypes';
import { GroupDialog } from './groups/GroupDialog';
import { ImportTab } from './groups/ImportTab';

type Tab = 'groups' | 'import';

/**
 * Groups / departments (`imgsig_manage_team`): list with member counts,
 * create / edit dialog with member picker, and the CSV profile import.
 */
export const GroupsPage: FC = () => {
  const [tab, setTab] = useState<Tab>('groups');
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [editing, setEditing] = useState<GroupRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<GroupRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);

  const load = useCallback((): void => {
    apiCall<GroupRow[]>('/admin/groups')
      .then(setGroups)
      .catch((e: Error) => {
        setGroups([]);
        setFlash({ type: 'error', message: e.message });
      });
  }, []);

  useEffect(load, [load]);

  const onDelete = async (): Promise<void> => {
    if (!deleting) return;
    setBusy(true);
    try {
      await apiCall(`/admin/groups/${deleting.id}`, { method: 'DELETE' });
      setFlash({ type: 'success', message: __('Group “%s” deleted.', deleting.name) });
      setDeleting(null);
      load();
    } catch (e) {
      setFlash({
        type: 'error',
        message: e instanceof ApiError ? e.message : (e as Error).message,
      });
    } finally {
      setBusy(false);
    }
  };

  const TABS: Array<{ id: Tab; label: string; icon: typeof Users }> = [
    { id: 'groups', label: __('Groups'), icon: Users },
    { id: 'import', label: __('Import profiles (CSV)'), icon: FileSpreadsheet },
  ];

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title={__('Groups')}
        description={__(
          'Organise people into departments or offices. A group can carry its own compliance footer, target banner campaigns and have a template assigned.',
        )}
        actions={
          tab === 'groups' ? (
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>
              {__('New group')}
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="flex gap-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] p-1 text-[12.5px]">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors',
                  id === tab
                    ? 'bg-[var(--bg-selected)] text-[var(--accent)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                )}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {flash && (
            <Banner type={flash.type} message={flash.message} onDismiss={() => setFlash(null)} />
          )}

          {tab === 'import' && <ImportTab />}

          {tab === 'groups' && groups === null && (
            <div className="flex justify-center p-10">
              <Spinner size={20} />
            </div>
          )}

          {tab === 'groups' && groups !== null && groups.length === 0 && (
            <EmptyState
              icon={<Users size={28} />}
              title={__('No groups yet')}
              description={__(
                'Create groups such as Sales or Madrid office, then add people by hand or with a CSV import.',
              )}
              action={
                <Button
                  variant="primary"
                  icon={<Plus size={14} />}
                  onClick={() => setEditing('new')}
                >
                  {__('Create the first group')}
                </Button>
              }
            />
          )}

          {tab === 'groups' && groups !== null && groups.length > 0 && (
            <ul className="divide-y divide-[var(--border-default)] overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-[var(--shadow-xs)]">
              {groups.map((g) => (
                <li key={g.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: g.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-[var(--text-primary)]">
                      {g.name}
                    </p>
                    {g.description && (
                      <p className="truncate text-[12px] text-[var(--text-secondary)]">
                        {g.description}
                      </p>
                    )}
                  </div>
                  {g.compliance_footer_override.enabled && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-selected)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--accent)]"
                      title={__('Members get this group’s compliance footer.')}
                    >
                      <ShieldCheck size={11} />
                      {__('Own footer')}
                    </span>
                  )}
                  <span className="w-24 shrink-0 text-right text-[12px] tabular-nums text-[var(--text-secondary)]">
                    {g.member_count === 1
                      ? __('1 member')
                      : __('%s members', String(g.member_count))}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditing(g)}
                    title={__('Edit group')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(g)}
                    title={__('Delete group')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-red-50 hover:text-[var(--danger)]"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editing !== null && (
        <GroupDialog
          group={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setFlash({ type: 'success', message: __('Group saved.') });
            setEditing(null);
            load();
          }}
        />
      )}

      <Modal
        open={deleting !== null}
        title={__('Delete group')}
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={busy}>
              {__('Cancel')}
            </Button>
            <Button variant="danger" onClick={() => void onDelete()} disabled={busy}>
              {__('Delete')}
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-[var(--text-secondary)]">
          {deleting &&
            __(
              'Delete “%s”? Its members keep their profiles and signatures; only the group, its footer and its campaign targeting go away.',
              deleting.name,
            )}
        </p>
      </Modal>
    </div>
  );
};
