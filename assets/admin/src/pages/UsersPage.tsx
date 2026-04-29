import { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Button } from '../../../editor/src/components/ui/Button';
import { Input } from '../../../editor/src/components/ui/Input';
import { Select } from '../../../editor/src/components/ui/Select';
import { Modal } from '../../../editor/src/components/ui/Modal';
import { __ } from '../../../editor/src/i18n/helpers';
import { pushToast } from '../../../editor/src/components/ui/Toaster';
import { plansApi, usersApi, type AdminUserItem } from '../api';
import type { PlanRecord } from '@shared/types';

export function UsersPage(): JSX.Element {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const reload = async (): Promise<void> => {
    setLoading(true);
    try {
      const [usersRes, plansRes] = await Promise.all([usersApi.list({ search }), plansApi.list()]);
      setUsers(usersRes.items);
      setPlans(plansRes.items);
    } catch {
      pushToast(__('Could not load users.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(reload, 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const onPlanChange = async (user: AdminUserItem, planId: number): Promise<void> => {
    try {
      await usersApi.changePlan(user.id, planId);
      pushToast(__('Plan updated.'), 'success');
      reload();
    } catch {
      pushToast(__('Could not change plan.'), 'error');
    }
  };

  const onRemove = async (user: AdminUserItem): Promise<void> => {
    if (!window.confirm(__('Remove ') + user.email + __(' from Imagina Signatures users?'))) return;
    try {
      await usersApi.delete(user.id);
      pushToast(__('User removed.'), 'success');
      reload();
    } catch {
      pushToast(__('Could not remove user.'), 'error');
    }
  };

  return (
    <div className="is-max-w-5xl is-mx-auto is-px-4 is-py-6">
      <header className="is-flex is-items-start is-justify-between is-mb-6 is-gap-4">
        <div>
          <h1 className="is-text-2xl is-font-bold">{__('Users')}</h1>
          <p className="is-mt-1 is-text-slate-600">
            {__('Manage Imagina Signatures users and their plan assignments.')}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>{__('New user')}</Button>
      </header>

      <div className="is-mb-3 is-max-w-sm">
        <Input
          label={__('Search')}
          placeholder={__('Search by name or email…')}
          value={search}
          onInput={(event) => setSearch((event.target as HTMLInputElement).value)}
        />
      </div>

      <div className="is-bg-white is-rounded is-shadow-sm is-border is-border-slate-200 is-overflow-hidden">
        {loading ? (
          <div className="is-py-12 is-text-center is-text-slate-500">{__('Loading…')}</div>
        ) : users.length === 0 ? (
          <div className="is-py-12 is-text-center is-text-slate-500">{__('No users yet.')}</div>
        ) : (
          <table className="is-w-full">
            <thead className="is-bg-slate-50 is-text-xs is-uppercase is-tracking-wider is-text-slate-500">
              <tr>
                <th className="is-text-left is-px-4 is-py-2">{__('Name')}</th>
                <th className="is-text-left is-px-4 is-py-2">{__('Email')}</th>
                <th className="is-text-left is-px-4 is-py-2">{__('Plan')}</th>
                <th className="is-text-left is-px-4 is-py-2">{__('Signatures')}</th>
                <th className="is-text-right is-px-4 is-py-2">{__('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="is-border-t is-border-slate-200">
                  <td className="is-px-4 is-py-3 is-font-medium">{user.display_name}</td>
                  <td className="is-px-4 is-py-3 is-text-slate-500">{user.email}</td>
                  <td className="is-px-4 is-py-3">
                    <select
                      value={String(user.plan?.id ?? 0)}
                      onChange={(event) =>
                        onPlanChange(user, Number((event.target as HTMLSelectElement).value))
                      }
                      className="is-px-2 is-py-1 is-border is-rounded is-bg-white is-text-sm"
                    >
                      <option value="0">{__('— No plan —')}</option>
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="is-px-4 is-py-3 is-text-sm">
                    {user.usage.signatures_count}
                  </td>
                  <td className="is-px-4 is-py-3 is-text-right">
                    <Button size="sm" variant="ghost" onClick={() => onRemove(user)}>
                      {__('Remove')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <CreateUserModal
          plans={plans}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

interface CreateUserModalProps {
  plans: PlanRecord[];
  onClose: () => void;
  onCreated: () => void;
}

function CreateUserModal({ plans, onClose, onCreated }: CreateUserModalProps): JSX.Element {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [planId, setPlanId] = useState<string>(String(plans[0]?.id ?? 0));
  const [sendEmail, setSendEmail] = useState(true);
  const [saving, setSaving] = useState(false);

  const submit = async (): Promise<void> => {
    setSaving(true);
    try {
      await usersApi.create({ email, name, plan_id: Number(planId), send_email: sendEmail });
      pushToast(__('User created.'), 'success');
      onCreated();
    } catch {
      pushToast(__('Could not create user.'), 'error');
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={__('Create user')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__('Cancel')}
          </Button>
          <Button onClick={submit} loading={saving}>
            {__('Create')}
          </Button>
        </>
      }
    >
      <div className="is-flex is-flex-col is-gap-3">
        <Input
          type="email"
          label={__('Email')}
          value={email}
          onInput={(event) => setEmail((event.target as HTMLInputElement).value)}
          required
        />
        <Input
          label={__('Display name')}
          value={name}
          onInput={(event) => setName((event.target as HTMLInputElement).value)}
        />
        <Select
          label={__('Plan')}
          value={planId}
          onValueChange={setPlanId}
          options={[
            { value: '0', label: __('— No plan —') },
            ...plans.map((plan) => ({ value: String(plan.id), label: plan.name })),
          ]}
        />
        <label className="is-text-sm is-flex is-items-center is-gap-2">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(event) => setSendEmail((event.target as HTMLInputElement).checked)}
          />
          {__('Send welcome email with login info')}
        </label>
      </div>
    </Modal>
  );
}
