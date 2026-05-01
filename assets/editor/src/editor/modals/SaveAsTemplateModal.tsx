import { useState, type FC, type FormEvent } from 'react';
import { Modal } from '@/components/shared/Modal';
import { useSchemaStore } from '@/stores/schemaStore';
import { useToastStore } from '@/stores/toastStore';
import { apiCall, ApiError } from '@/bridge/apiClient';
import { __ } from '@/i18n/helpers';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * "Save as template" — admins only (gated by manage_templates).
 *
 * POSTs the current `schema` to `/templates` with the user-supplied
 * name / category / description. Slug is derived client-side; the
 * server's `sanitize_title` runs it again so it always lands valid.
 */
export const SaveAsTemplateModal: FC<Props> = ({ open, onClose }) => {
  const schema = useSchemaStore((s) => s.schema);
  const showToast = useToastStore((s) => s.show);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('general');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      await apiCall('/templates', {
        method: 'POST',
        body: {
          name: name.trim(),
          slug: slugify(name),
          category: category.trim() || 'general',
          description: description.trim(),
          json_content: schema,
        },
      });
      showToast(__('Template saved.'), 'success');
      onClose();
      setName('');
      setCategory('general');
      setDescription('');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : (err as Error).message;
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} title={__('Save signature as template')} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3 text-[12px]">
        <p className="rounded-md bg-[var(--bg-panel-soft)] px-3 py-2 text-[11.5px] text-[var(--text-secondary)]">
          {__(
            'Saves the current canvas as a global template available to every user with “Use signatures”. Admins can edit it later.',
          )}
        </p>

        <Field label={__('Name')} required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={__('Sales — active')}
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

        {error && (
          <div className="rounded-md border border-[var(--danger)] bg-red-50 px-3 py-2 text-[var(--danger)]">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-8 items-center rounded-md border border-[var(--border-default)] px-3 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
          >
            {__('Cancel')}
          </button>
          <button
            type="submit"
            disabled={!name.trim() || submitting}
            className="inline-flex h-8 items-center rounded-md bg-[var(--accent)] px-3 font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {submitting ? __('Saving…') : __('Save as template')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const Field: FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({
  label,
  required,
  children,
}) => (
  <label className="flex flex-col gap-1.5">
    <span className="font-medium text-[var(--text-secondary)]">
      {label}
      {required && <span className="ml-0.5 text-[var(--danger)]">*</span>}
    </span>
    {children}
  </label>
);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
