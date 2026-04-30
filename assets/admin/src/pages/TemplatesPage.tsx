import { useEffect, useState, type FC, type FormEvent } from 'react';
import { LayoutTemplate, Plus } from 'lucide-react';
import { Topbar } from '@admin/components/Topbar';
import { Button } from '@admin/components/Button';
import { EmptyState } from '@admin/components/EmptyState';
import { Spinner } from '@admin/components/Spinner';
import { Modal } from '@admin/components/Modal';
import { apiCall, ApiError, getConfig } from '@admin/api';
import { __ } from '@admin/i18n';
import type { TemplateRow } from '@admin/types';

/**
 * Templates listing — read-open to anyone with `imgsig_use_signatures`,
 * write-only for admins (CLAUDE.md §15.2).
 *
 * Admins (`imgsig_manage_templates`) get a "New template" CTA that
 * opens a small modal: name / category / description. The created
 * template is seeded with an empty signature schema and added to the
 * list — admins typically populate it later via the editor's
 * "Save as template" flow (planned).
 */
export const TemplatesPage: FC = () => {
  const config = getConfig();
  const canManage = config.capabilities.manage_templates;

  const [items, setItems] = useState<TemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refetch = () => {
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
            ? __('Global signature templates seeded with the plugin and any you have authored.')
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
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                    {row.name}
                  </h3>
                  {row.is_system && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-slate-200">
                      {__('System')}
                    </span>
                  )}
                </div>
                <p className="mb-3 text-[12px] text-[var(--text-secondary)]">
                  {row.description || __('No description provided.')}
                </p>
                <span className="is-section-label">{row.category}</span>
              </article>
            ))}
          </div>
        )}
      </div>

      {canManage && (
        <NewTemplateModal
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(row) => {
            setCreating(false);
            setItems((prev) => (prev ? [row, ...prev] : [row]));
          }}
        />
      )}
    </div>
  );
};

interface NewTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (row: TemplateRow) => void;
}

/**
 * Minimal "create template" form. Slug is derived from the name on
 * the client (server applies its own `sanitize_title` regardless).
 *
 * The created template starts with an empty signature schema — the
 * admin populates it later. (Future: a "Save as template" command
 * inside the editor will produce richer initial json_content.)
 */
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

  const submit = async (e: FormEvent) => {
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
