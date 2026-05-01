import { useEffect, useState, type FC, type FormEvent } from 'react';
import { LayoutTemplate, Plus, Pencil, Send } from 'lucide-react';
import { Topbar } from '@admin/components/Topbar';
import { Button } from '@admin/components/Button';
import { EmptyState } from '@admin/components/EmptyState';
import { Spinner } from '@admin/components/Spinner';
import { Modal } from '@admin/components/Modal';
import { apiCall, ApiError, getConfig } from '@admin/api';
import { __ } from '@admin/i18n';
import { cn } from '@admin/utils/cn';
import type { BulkApplyResult, TemplateRow } from '@admin/types';

/**
 * Standard WordPress role slugs surfaced in the role picker. Custom
 * roles aren't enumerated yet (would need a `/admin/roles` endpoint);
 * the server stores whatever slug we POST so a custom role can still
 * be wired manually via the JSON API.
 */
const WP_ROLES: Array<{ slug: string; label: string }> = [
  { slug: 'administrator', label: 'Administrator' },
  { slug: 'editor', label: 'Editor' },
  { slug: 'author', label: 'Author' },
  { slug: 'contributor', label: 'Contributor' },
  { slug: 'subscriber', label: 'Subscriber' },
];

/**
 * Templates listing — read-open to anyone with `imgsig_use_signatures`,
 * write-only for admins (CLAUDE.md §15.2).
 *
 * Admins (`imgsig_manage_templates`) get three actions per template:
 *  - Edit metadata (name / category / description / role visibility)
 *  - Apply in bulk (creates a signature for every user in scope)
 *  - The "New template" CTA in the topbar (creates an empty shell)
 */
export const TemplatesPage: FC = () => {
  const config = getConfig();
  const canManage = config.capabilities.manage_templates;

  const [items, setItems] = useState<TemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [applying, setApplying] = useState<TemplateRow | null>(null);

  const refetch = (): void => {
    apiCall<TemplateRow[]>('/templates?per_page=100')
      .then((data) => setItems(data))
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title={__('Templates')}
        description={
          canManage
            ? __('Global signature templates. Tag with roles to scope visibility, or apply in bulk to seed a signature for every user.')
            : __('Browse the signature templates available on this site.')
        }
        actions={
          canManage ? (
            <Button
              variant="primary"
              icon={<Plus size={14} />}
              onClick={() => setCreating(true)}
            >
              {__('New template')}
            </Button>
          ) : null
        }
      />

      <div className="flex flex-1 flex-col overflow-auto p-6">
        {error && (
          <div className="rounded-lg border border-[var(--danger)] bg-red-50 p-4 text-[13px] text-[var(--danger)]">
            {error}
          </div>
        )}

        {!error && items === null && (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size={20} />
          </div>
        )}

        {!error && items && items.length === 0 && (
          <EmptyState
            icon={<LayoutTemplate size={32} strokeWidth={1.4} />}
            title={__('No templates yet')}
            description={
              canManage
                ? __('Use “New template” to seed one.')
                : __('Templates are typically seeded on plugin activation.')
            }
          />
        )}

        {!error && items && items.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((row) => (
              <article
                key={row.id}
                className="flex flex-col rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] p-4 shadow-[var(--shadow-xs)] transition-shadow hover:shadow-[var(--shadow-sm)]"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="truncate text-[14px] font-semibold text-[var(--text-primary)]">
                    {row.name}
                  </h3>
                  {row.is_system && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-slate-200">
                      {__('System')}
                    </span>
                  )}
                </div>
                <p className="mb-3 text-[12px] text-[var(--text-secondary)]">
                  {row.description || __('No description provided.')}
                </p>
                <div className="mt-auto flex items-center justify-between gap-2">
                  <span className="is-section-label">{row.category}</span>
                  <RoleChips roles={row.visible_to_roles} />
                </div>
                {canManage && (
                  <div className="mt-3 flex items-center gap-2 border-t border-[var(--border-default)] pt-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Pencil size={12} />}
                      onClick={() => setEditing(row)}
                    >
                      {__('Edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Send size={12} />}
                      onClick={() => setApplying(row)}
                    >
                      {__('Apply')}
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {canManage && (
        <>
          <NewTemplateModal
            open={creating}
            onClose={() => setCreating(false)}
            onCreated={(row) => {
              setCreating(false);
              setItems((prev) => (prev ? [row, ...prev] : [row]));
            }}
          />
          <EditTemplateModal
            open={editing !== null}
            template={editing}
            onClose={() => setEditing(null)}
            onSaved={(row) => {
              setEditing(null);
              setItems((prev) =>
                prev ? prev.map((t) => (t.id === row.id ? row : t)) : prev,
              );
            }}
          />
          <ApplyTemplateModal
            open={applying !== null}
            template={applying}
            onClose={() => setApplying(null)}
          />
        </>
      )}
    </div>
  );
};

const RoleChips: FC<{ roles: string[] }> = ({ roles }) => {
  if (!roles || roles.length === 0) {
    return (
      <span
        className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-200"
        title={__('Visible to all users with the imgsig_use_signatures capability.')}
      >
        {__('All roles')}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1">
      {roles.slice(0, 3).map((r) => (
        <span
          key={r}
          className="rounded-full bg-[var(--bg-selected)] px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/20"
        >
          {r}
        </span>
      ))}
      {roles.length > 3 && (
        <span className="text-[10px] text-[var(--text-muted)]">+{roles.length - 3}</span>
      )}
    </span>
  );
};

// ---------------------------------------------------------------------------
// New template
// ---------------------------------------------------------------------------

interface NewTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (row: TemplateRow) => void;
}

const NewTemplateModal: FC<NewTemplateModalProps> = ({ open, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('general');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setCategory('general');
      setDescription('');
      setFormError(null);
      setSubmitting(false);
    }
  }, [open]);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    setFormError(null);

    const now = new Date().toISOString();
    const slug = slugify(name);

    try {
      const created = await apiCall<TemplateRow>('/templates', {
        method: 'POST',
        body: {
          slug,
          name: name.trim(),
          category: category.trim() || 'general',
          description: description.trim(),
          json_content: {
            schema_version: '1.0',
            meta: { created_at: now, updated_at: now, editor_version: '1.0.0' },
            canvas: {
              width: 600,
              background_color: '#ffffff',
              font_family: 'Arial, sans-serif',
              font_size: 14,
              text_color: '#111827',
              link_color: '#1d4ed8',
            },
            blocks: [],
            variables: {},
          },
        },
      });
      onCreated(created);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={__('Create template')}
      onClose={submitting ? () => {} : onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            {__('Cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={!name.trim() || submitting}
          >
            {submitting ? __('Creating…') : __('Create template')}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <Field label={__('Name')} required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={__('Sales Active')}
            disabled={submitting}
            autoFocus
          />
        </Field>
        <Field
          label={__('Category')}
          hint={__('Used to group templates in the picker (e.g. “sales”, “medical”).')}
        >
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={submitting}
          />
        </Field>
        <Field label={__('Description')}>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
          />
        </Field>

        {formError && (
          <div className="rounded-md border border-[var(--danger)] bg-red-50 px-3 py-2 text-[12px] text-[var(--danger)]">
            {formError}
          </div>
        )}
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Edit template — name / category / description / visible_to_roles
// ---------------------------------------------------------------------------

interface EditTemplateModalProps {
  open: boolean;
  template: TemplateRow | null;
  onClose: () => void;
  onSaved: (row: TemplateRow) => void;
}

const EditTemplateModal: FC<EditTemplateModalProps> = ({ open, template, onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open && template) {
      setName(template.name);
      setCategory(template.category);
      setDescription(template.description ?? '');
      setRoles(template.visible_to_roles ?? []);
      setFormError(null);
      setSubmitting(false);
    }
  }, [open, template]);

  const toggleRole = (slug: string): void => {
    setRoles((prev) => (prev.includes(slug) ? prev.filter((r) => r !== slug) : [...prev, slug]));
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!template || !name.trim() || submitting) return;

    setSubmitting(true);
    setFormError(null);

    try {
      const next = await apiCall<TemplateRow>(`/templates/${template.id}`, {
        method: 'PATCH',
        body: {
          name: name.trim(),
          category: category.trim() || 'general',
          description: description.trim(),
          visible_to_roles: roles,
        },
      });
      onSaved(next);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={__('Edit template')}
      onClose={submitting ? () => {} : onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            {__('Cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={!name.trim() || submitting}
          >
            {submitting ? __('Saving…') : __('Save')}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <Field label={__('Name')} required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            autoFocus
          />
        </Field>
        <Field label={__('Category')}>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={submitting}
          />
        </Field>
        <Field label={__('Description')}>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
          />
        </Field>
        <Field
          label={__('Visible to roles')}
          hint={__('Empty = visible to all users with “Use signatures”. Tick to scope.')}
        >
          <div className="flex flex-wrap gap-1.5">
            {WP_ROLES.map(({ slug, label }) => {
              const active = roles.includes(slug);
              return (
                <button
                  type="button"
                  key={slug}
                  onClick={() => toggleRole(slug)}
                  disabled={submitting}
                  className={cn(
                    'h-7 rounded-full border px-3 text-[11.5px] font-medium transition-colors',
                    active
                      ? 'border-transparent bg-[var(--accent)] text-white'
                      : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Field>

        {formError && (
          <div className="rounded-md border border-[var(--danger)] bg-red-50 px-3 py-2 text-[12px] text-[var(--danger)]">
            {formError}
          </div>
        )}
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Apply in bulk — scope picker + result summary
// ---------------------------------------------------------------------------

type Scope =
  | { kind: 'all' }
  | { kind: 'role'; role: string }
  | { kind: 'users'; ids: string };

interface ApplyTemplateModalProps {
  open: boolean;
  template: TemplateRow | null;
  onClose: () => void;
}

const ApplyTemplateModal: FC<ApplyTemplateModalProps> = ({ open, template, onClose }) => {
  const [scope, setScope] = useState<Scope>({ kind: 'all' });
  const [skipExisting, setSkipExisting] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkApplyResult | null>(null);

  useEffect(() => {
    if (open) {
      setScope({ kind: 'all' });
      setSkipExisting(true);
      setSubmitting(false);
      setFormError(null);
      setResult(null);
    }
  }, [open]);

  const submit = async (): Promise<void> => {
    if (!template || submitting) return;

    setSubmitting(true);
    setFormError(null);
    setResult(null);

    let scopeStr = 'all';
    if (scope.kind === 'role') {
      if (!scope.role) {
        setFormError(__('Pick a role.'));
        setSubmitting(false);
        return;
      }
      scopeStr = `role:${scope.role}`;
    } else if (scope.kind === 'users') {
      const ids = scope.ids
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length === 0) {
        setFormError(__('Provide at least one user ID.'));
        setSubmitting(false);
        return;
      }
      scopeStr = `users:${ids.join(',')}`;
    }

    try {
      const next = await apiCall<BulkApplyResult>(
        `/admin/templates/${template.id}/apply`,
        {
          method: 'POST',
          body: { scope: scopeStr, skip_existing: skipExisting },
        },
      );
      setResult(next);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={template ? __('Apply “%s” in bulk', template.name) : __('Apply template')}
      onClose={submitting ? () => {} : onClose}
      footer={
        result ? (
          <Button variant="primary" size="sm" onClick={onClose}>
            {__('Done')}
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
              {__('Cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? __('Applying…') : __('Apply')}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-3 text-[13px]">
          <p>
            {__('Applied to %s users', String(result.targeted))} —{' '}
            <strong>{result.created}</strong> {__('created')},{' '}
            <strong>{result.skipped}</strong> {__('skipped')}
            {result.failed > 0 && (
              <>
                , <strong className="text-[var(--danger)]">{result.failed}</strong>{' '}
                {__('failed')}
              </>
            )}
            .
          </p>
          {result.skipped > 0 && (
            <p className="text-[11.5px] text-[var(--text-muted)]">
              {__('Skipped users already had a signature seeded from this template.')}
            </p>
          )}
        </div>
      ) : (
        <form
          className="flex flex-col gap-3 text-[13px]"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p className="rounded-md bg-[var(--bg-panel-soft)] px-3 py-2 text-[11.5px] text-[var(--text-secondary)]">
            {__(
              'Creates a new signature for every user in scope, seeded from this template. Existing signatures are NOT modified.',
            )}
          </p>

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
                    {label}
                  </option>
                ))}
              </select>
            )}
          </ScopeOption>

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

          <label className="mt-1 flex cursor-pointer items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={skipExisting}
              onChange={(e) => setSkipExisting(e.target.checked)}
              className="!h-4 !w-4 !p-0"
            />
            <span className="text-[var(--text-secondary)]">
              {__('Skip users who already have a signature from this template')}
            </span>
          </label>

          {formError && (
            <div className="rounded-md border border-[var(--danger)] bg-red-50 px-3 py-2 text-[12px] text-[var(--danger)]">
              {formError}
            </div>
          )}
        </form>
      )}
    </Modal>
  );
};

const ScopeOption: FC<{
  label: string;
  description: string;
  checked: boolean;
  onSelect: () => void;
  children?: React.ReactNode;
}> = ({ label, description, checked, onSelect, children }) => (
  <label
    className={cn(
      'flex cursor-pointer flex-col gap-1.5 rounded-md border p-3 transition-colors',
      checked
        ? 'border-[var(--accent)] bg-[var(--bg-selected)]'
        : 'border-[var(--border-default)] hover:bg-[var(--bg-hover)]',
    )}
  >
    <div className="flex items-start gap-2">
      <input
        type="radio"
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 !h-4 !w-4 !p-0"
      />
      <div className="flex-1">
        <div className="text-[12.5px] font-medium text-[var(--text-primary)]">{label}</div>
        <div className="text-[11px] text-[var(--text-muted)]">{description}</div>
      </div>
    </div>
    {checked && children && <div className="ml-6">{children}</div>}
  </label>
);

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

const Field: FC<FieldProps> = ({ label, hint, required, children }) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-[12px] font-medium text-[var(--text-primary)]">
      {label}
      {required && <span className="ml-0.5 text-[var(--danger)]">*</span>}
    </span>
    {children}
    {hint && <span className="text-[11px] text-[var(--text-muted)]">{hint}</span>}
  </label>
);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    // U+0300..U+036F = combining diacriticals — strip so "Médico" -> "medico".
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
