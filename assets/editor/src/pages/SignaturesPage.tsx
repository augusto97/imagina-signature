import { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { signaturesApi } from '../api/signatures';
import type { SignatureRecord } from '@shared/types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { __ } from '../i18n/helpers';
import { navigate } from '../router';
import { pushToast } from '../components/ui/Toaster';
import { useUserStore } from '../stores/userStore';

type StatusFilter = '' | 'draft' | 'ready' | 'archived';

export function SignaturesPage(): JSX.Element {
  const [items, setItems] = useState<SignatureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [confirmDelete, setConfirmDelete] = useState<SignatureRecord | null>(null);
  const me = useUserStore((state) => state.me);

  const reload = async (): Promise<void> => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { per_page: 50 };
      if (search) params.search = search;
      if (status) params.status = status;
      const data = await signaturesApi.list(params);
      setItems(data.items);
    } catch (error) {
      pushToast(__('Could not load signatures.'), 'error');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Debounce search.
  useEffect(() => {
    const t = window.setTimeout(reload, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const onDuplicate = async (id: number): Promise<void> => {
    try {
      const created = await signaturesApi.duplicate(id);
      pushToast(__('Signature duplicated.'), 'success');
      setItems((prev) => [created, ...prev]);
    } catch {
      pushToast(__('Could not duplicate signature.'), 'error');
    }
  };

  const onArchive = async (signature: SignatureRecord): Promise<void> => {
    try {
      const next = signature.status === 'archived' ? 'draft' : 'archived';
      await signaturesApi.update(signature.id, { status: next });
      pushToast(next === 'archived' ? __('Archived.') : __('Restored.'), 'success');
      reload();
    } catch {
      pushToast(__('Could not update signature.'), 'error');
    }
  };

  const onDelete = async (): Promise<void> => {
    if (!confirmDelete) return;
    try {
      await signaturesApi.delete(confirmDelete.id);
      setItems((prev) => prev.filter((s) => s.id !== confirmDelete.id));
      pushToast(__('Signature deleted.'), 'success');
    } catch {
      pushToast(__('Could not delete signature.'), 'error');
    } finally {
      setConfirmDelete(null);
    }
  };

  const usage = me?.usage;
  const max = me?.plan.limits.max_signatures ?? 0;

  const showQuota = useMemo(() => {
    if (!me) return false;
    return me.mode === 'multi' && max > 0 && max < Number.MAX_SAFE_INTEGER;
  }, [me, max]);

  return (
    <div className="is-max-w-6xl is-mx-auto is-px-4 is-py-6">
      <header className="is-flex is-items-start is-justify-between is-gap-4 is-flex-wrap is-mb-6">
        <div>
          <h1 className="is-text-2xl is-font-bold is-text-slate-900">{__('My Signatures')}</h1>
          <p className="is-mt-1 is-text-slate-600">
            {__('Create, duplicate, archive, and manage your signatures.')}
          </p>
          {showQuota && usage && (
            <p className="is-mt-2 is-text-xs is-text-slate-500">
              {usage.signatures_count}
              {' / '}
              {max} {__('signatures used')}
            </p>
          )}
        </div>
        <div className="is-flex is-gap-2">
          <Button variant="secondary" onClick={() => navigate('/templates')}>
            {__('Browse templates')}
          </Button>
          <Button onClick={() => navigate('/editor', { id: 0 })}>{__('New signature')}</Button>
        </div>
      </header>

      <div className="is-grid is-grid-cols-1 md:is-grid-cols-3 is-gap-3 is-mb-4">
        <Input
          label={__('Search')}
          placeholder={__('Search by name…')}
          value={search}
          onInput={(event) => setSearch((event.target as HTMLInputElement).value)}
        />
        <Select
          label={__('Status')}
          value={status}
          onValueChange={(v) => setStatus(v as StatusFilter)}
          options={[
            { value: '', label: __('All') },
            { value: 'draft', label: __('Draft') },
            { value: 'ready', label: __('Ready') },
            { value: 'archived', label: __('Archived') },
          ]}
        />
      </div>

      <div className="is-bg-white is-rounded is-shadow-sm is-border is-border-slate-200 is-overflow-hidden">
        {loading ? (
          <div className="is-py-12 is-text-center is-text-slate-500">{__('Loading…')}</div>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <table className="is-w-full">
            <thead className="is-bg-slate-50 is-text-xs is-uppercase is-tracking-wider is-text-slate-500">
              <tr>
                <th className="is-text-left is-px-4 is-py-2">{__('Name')}</th>
                <th className="is-text-left is-px-4 is-py-2">{__('Status')}</th>
                <th className="is-text-left is-px-4 is-py-2">{__('Updated')}</th>
                <th className="is-text-right is-px-4 is-py-2">{__('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((signature) => (
                <Row
                  key={signature.id}
                  signature={signature}
                  onDuplicate={() => onDuplicate(signature.id)}
                  onArchive={() => onArchive(signature)}
                  onDelete={() => setConfirmDelete(signature)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={__('Delete signature?')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              {__('Cancel')}
            </Button>
            <Button variant="danger" onClick={onDelete}>
              {__('Delete')}
            </Button>
          </>
        }
      >
        <p>
          {__('This action cannot be undone. The signature ')}
          <strong>{confirmDelete?.name}</strong>
          {__(' will be permanently removed.')}
        </p>
      </Modal>
    </div>
  );
}

interface RowProps {
  signature: SignatureRecord;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function Row({ signature, onDuplicate, onArchive, onDelete }: RowProps): JSX.Element {
  return (
    <tr className="is-border-t is-border-slate-200 hover:is-bg-slate-50">
      <td className="is-px-4 is-py-3">
        <a
          href={`#/editor?id=${signature.id}`}
          className="is-font-medium is-text-brand-700 hover:is-underline"
        >
          {signature.name}
        </a>
      </td>
      <td className="is-px-4 is-py-3">
        <StatusBadge status={signature.status} />
      </td>
      <td className="is-px-4 is-py-3 is-text-sm is-text-slate-500">
        {new Date(signature.updated_at + 'Z').toLocaleString()}
      </td>
      <td className="is-px-4 is-py-3 is-text-right">
        <div className="is-inline-flex is-gap-1">
          <Button size="sm" variant="ghost" onClick={onDuplicate}>
            {__('Duplicate')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onArchive}>
            {signature.status === 'archived' ? __('Restore') : __('Archive')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            {__('Delete')}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: SignatureRecord['status'] }): JSX.Element {
  const colors: Record<SignatureRecord['status'], string> = {
    draft: 'is-bg-slate-100 is-text-slate-700',
    ready: 'is-bg-green-100 is-text-green-800',
    archived: 'is-bg-amber-100 is-text-amber-800',
  };
  return (
    <span className={`is-inline-block is-px-2 is-py-0.5 is-rounded is-text-xs ${colors[status]}`}>
      {status}
    </span>
  );
}

function EmptyState(): JSX.Element {
  return (
    <div className="is-py-12 is-text-center">
      <h2 className="is-text-lg is-font-semibold is-text-slate-700">
        {__('You don\'t have any signatures yet')}
      </h2>
      <p className="is-mt-2 is-text-slate-500">
        {__('Pick a template to get started or create one from scratch.')}
      </p>
      <div className="is-mt-4 is-flex is-justify-center is-gap-2">
        <Button variant="secondary" onClick={() => navigate('/templates')}>
          {__('Browse templates')}
        </Button>
        <Button onClick={() => navigate('/editor', { id: 0 })}>{__('Start from scratch')}</Button>
      </div>
    </div>
  );
}
