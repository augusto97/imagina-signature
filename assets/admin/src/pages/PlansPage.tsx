import { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Button } from '../../../editor/src/components/ui/Button';
import { Input } from '../../../editor/src/components/ui/Input';
import { Modal } from '../../../editor/src/components/ui/Modal';
import { __ } from '../../../editor/src/i18n/helpers';
import { pushToast } from '../../../editor/src/components/ui/Toaster';
import { plansApi, type PlanInput } from '../api';
import type { PlanRecord } from '@shared/types';

const blankLimits: PlanRecord['limits'] = {
  max_signatures: 10,
  max_storage_bytes: 100 * 1024 * 1024,
  max_image_size_bytes: 2 * 1024 * 1024,
  allow_premium_templates: false,
  allow_animations: false,
  allow_html_export: true,
  allow_custom_branding: false,
  allow_oauth_install: false,
  custom_limits: {},
};

export function PlansPage(): JSX.Element {
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PlanRecord | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await plansApi.list(true);
      setPlans(res.items);
    } catch {
      pushToast(__('Could not load plans.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const onDelete = async (plan: PlanRecord): Promise<void> => {
    if (!window.confirm(__('Delete plan ') + plan.name + '?')) return;
    try {
      await plansApi.delete(plan.id);
      pushToast(__('Plan deleted.'), 'success');
      reload();
    } catch {
      pushToast(__('Could not delete plan.'), 'error');
    }
  };

  return (
    <div className="is-max-w-5xl is-mx-auto is-px-4 is-py-6">
      <header className="is-flex is-items-start is-justify-between is-mb-6">
        <div>
          <h1 className="is-text-2xl is-font-bold">{__('Plans')}</h1>
          <p className="is-mt-1 is-text-slate-600">
            {__('Define quotas and feature flags for the user plans.')}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>{__('New plan')}</Button>
      </header>

      <div className="is-bg-white is-rounded is-shadow-sm is-border is-border-slate-200 is-overflow-hidden">
        {loading ? (
          <div className="is-py-12 is-text-center is-text-slate-500">{__('Loading…')}</div>
        ) : plans.length === 0 ? (
          <div className="is-py-12 is-text-center is-text-slate-500">{__('No plans defined.')}</div>
        ) : (
          <table className="is-w-full">
            <thead className="is-bg-slate-50 is-text-xs is-uppercase is-tracking-wider is-text-slate-500">
              <tr>
                <th className="is-text-left is-px-4 is-py-2">{__('Name')}</th>
                <th className="is-text-left is-px-4 is-py-2">{__('Slug')}</th>
                <th className="is-text-left is-px-4 is-py-2">{__('Signatures')}</th>
                <th className="is-text-left is-px-4 is-py-2">{__('Storage')}</th>
                <th className="is-text-left is-px-4 is-py-2">{__('Default')}</th>
                <th className="is-text-right is-px-4 is-py-2">{__('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id} className="is-border-t is-border-slate-200">
                  <td className="is-px-4 is-py-3 is-font-medium">{plan.name}</td>
                  <td className="is-px-4 is-py-3 is-text-slate-500">{plan.slug}</td>
                  <td className="is-px-4 is-py-3">{plan.limits.max_signatures}</td>
                  <td className="is-px-4 is-py-3">
                    {(plan.limits.max_storage_bytes / (1024 * 1024)).toFixed(0)} MB
                  </td>
                  <td className="is-px-4 is-py-3">{plan.is_default ? '✓' : '—'}</td>
                  <td className="is-px-4 is-py-3 is-text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(plan)}>
                      {__('Edit')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDelete(plan)}>
                      {__('Delete')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(editing || creating) && (
        <PlanModal
          initial={editing ?? undefined}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

interface PlanModalProps {
  initial?: PlanRecord;
  onClose: () => void;
  onSaved: () => void;
}

function PlanModal({ initial, onClose, onSaved }: PlanModalProps): JSX.Element {
  const [draft, setDraft] = useState<PlanInput>({
    slug: initial?.slug ?? '',
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    is_default: initial?.is_default ?? false,
    is_active: initial?.is_active ?? true,
    sort_order: initial?.sort_order ?? 0,
    limits: initial?.limits ?? blankLimits,
  });
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      if (initial) {
        await plansApi.update(initial.id, draft);
      } else {
        await plansApi.create(draft);
      }
      pushToast(__('Plan saved.'), 'success');
      onSaved();
    } catch {
      pushToast(__('Could not save plan.'), 'error');
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? __('Edit plan') : __('New plan')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__('Cancel')}
          </Button>
          <Button onClick={save} loading={saving}>
            {__('Save')}
          </Button>
        </>
      }
    >
      <div className="is-flex is-flex-col is-gap-3">
        <Input
          label={__('Name')}
          value={draft.name}
          onInput={(event) => setDraft({ ...draft, name: (event.target as HTMLInputElement).value })}
        />
        <Input
          label={__('Slug')}
          value={draft.slug}
          onInput={(event) => setDraft({ ...draft, slug: (event.target as HTMLInputElement).value })}
        />
        <Input
          label={__('Description')}
          value={draft.description ?? ''}
          onInput={(event) =>
            setDraft({ ...draft, description: (event.target as HTMLInputElement).value })
          }
        />
        <div className="is-grid is-grid-cols-2 is-gap-3">
          <Input
            type="number"
            label={__('Max signatures')}
            value={draft.limits.max_signatures}
            onInput={(event) =>
              setDraft({
                ...draft,
                limits: {
                  ...draft.limits,
                  max_signatures: Number((event.target as HTMLInputElement).value),
                },
              })
            }
          />
          <Input
            type="number"
            label={__('Max storage (MB)')}
            value={Math.round(draft.limits.max_storage_bytes / (1024 * 1024))}
            onInput={(event) =>
              setDraft({
                ...draft,
                limits: {
                  ...draft.limits,
                  max_storage_bytes: Number((event.target as HTMLInputElement).value) * 1024 * 1024,
                },
              })
            }
          />
          <Input
            type="number"
            label={__('Max image size (MB)')}
            value={Math.round(draft.limits.max_image_size_bytes / (1024 * 1024))}
            onInput={(event) =>
              setDraft({
                ...draft,
                limits: {
                  ...draft.limits,
                  max_image_size_bytes:
                    Number((event.target as HTMLInputElement).value) * 1024 * 1024,
                },
              })
            }
          />
          <Input
            type="number"
            label={__('Sort order')}
            value={draft.sort_order ?? 0}
            onInput={(event) =>
              setDraft({ ...draft, sort_order: Number((event.target as HTMLInputElement).value) })
            }
          />
        </div>
        <div className="is-flex is-gap-4 is-text-sm">
          <label>
            <input
              type="checkbox"
              checked={draft.limits.allow_premium_templates}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  limits: {
                    ...draft.limits,
                    allow_premium_templates: (event.target as HTMLInputElement).checked,
                  },
                })
              }
            />{' '}
            {__('Premium templates')}
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.limits.allow_animations}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  limits: {
                    ...draft.limits,
                    allow_animations: (event.target as HTMLInputElement).checked,
                  },
                })
              }
            />{' '}
            {__('Animations')}
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.limits.allow_custom_branding}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  limits: {
                    ...draft.limits,
                    allow_custom_branding: (event.target as HTMLInputElement).checked,
                  },
                })
              }
            />{' '}
            {__('Custom branding')}
          </label>
        </div>
        <div className="is-flex is-gap-4 is-text-sm">
          <label>
            <input
              type="checkbox"
              checked={!!draft.is_default}
              onChange={(event) =>
                setDraft({ ...draft, is_default: (event.target as HTMLInputElement).checked })
              }
            />{' '}
            {__('Set as default')}
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!draft.is_active}
              onChange={(event) =>
                setDraft({ ...draft, is_active: (event.target as HTMLInputElement).checked })
              }
            />{' '}
            {__('Active')}
          </label>
        </div>
      </div>
    </Modal>
  );
}
