import { useEffect, useMemo, useState, type FC, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { useSchemaStore } from '@/stores/schemaStore';
import { useLinkStore } from '@/stores/linkStore';
import { useToastStore } from '@/stores/toastStore';
import { useTemplateLibraryStore } from '@/stores/templateLibraryStore';
import { apiCall, ApiError } from '@/bridge/apiClient';
import { walkBlocks } from '@/core/schema/tree';
import { templateJsonFor } from '@/core/schema/locks';
import type { EmployeeMode } from '@/core/schema/signature';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface TemplateOption {
  id: number;
  name: string;
}

interface Propagation {
  status: 'queued' | 'running' | 'done';
  total: number;
  updated: number;
}

interface TemplateResponse {
  id: number;
  propagation?: Propagation;
}

/** Labels / hints are functions so they translate at render time. */
const EMPLOYEE_MODES: Array<{ value: EmployeeMode; label: () => string; hint: () => string }> = [
  {
    value: 'free',
    label: () => __('Free'),
    hint: () => __('Employees can change everything except locked blocks.'),
  },
  {
    value: 'locked_design',
    label: () => __('Locked design'),
    hint: () =>
      __(
        'Employees can only change the text of unlocked text blocks. Layout and styles are fixed.',
      ),
  },
  {
    value: 'fields_only',
    label: () => __('Fields only'),
    hint: () =>
      __('Employees only fill in their details (variables and profile). No canvas editing.'),
  },
];

/**
 * "Save as template" — admins only (gated by manage_templates).
 *
 * Creates a new global template from the current canvas (POST
 * `/templates`) or replaces the design of an existing one (PATCH
 * `/templates/:id`), which the server propagates to every signature
 * linked to it (1.3.0). Either way the admin picks the template's
 * employee mode; block locks come from the canvas (block toolbar /
 * Layers panel). Slug is derived client-side; the server's
 * `sanitize_title` runs it again so it always lands valid.
 */
export const SaveAsTemplateModal: FC<Props> = ({ open, onClose }) => {
  const schema = useSchemaStore((s) => s.schema);
  const linkMode = useLinkStore((s) => s.mode);
  const linkedTemplateId = useLinkStore((s) => s.templateId);
  const linkedEmployeeMode = useLinkStore((s) => s.employeeMode);
  const showToast = useToastStore((s) => s.show);

  const [target, setTarget] = useState<'new' | 'update'>('new');
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('general');
  const [description, setDescription] = useState('');
  const [employeeMode, setEmployeeMode] = useState<EmployeeMode>('free');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lockedCount = useMemo(() => {
    let n = 0;
    walkBlocks(schema.blocks, (block) => {
      if (block.locked === true) n++;
    });
    return n;
  }, [schema.blocks]);

  // Fresh defaults each time the modal opens: a linked signature
  // defaults to updating its own template.
  useEffect(() => {
    if (!open) return;
    const linked = linkMode === 'linked' && linkedTemplateId !== null;
    setTarget(linked ? 'update' : 'new');
    setTemplateId(linked ? linkedTemplateId : null);
    setEmployeeMode(schema.settings?.employee_mode ?? (linked ? linkedEmployeeMode : 'free'));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || target !== 'update' || templates !== null) return;
    let cancelled = false;
    apiCall<Array<{ id: number; name: string }>>('/templates?per_page=100')
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows.map((r) => ({ id: r.id, name: r.name })) : [];
        setTemplates(list);
        setTemplateId((current) => current ?? list[0]?.id ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : (err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, target, templates]);

  const canSubmit = !submitting && (target === 'new' ? name.trim() !== '' : templateId !== null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    const json = templateJsonFor(schema, employeeMode);

    try {
      if (target === 'update' && templateId !== null) {
        const row = await apiCall<TemplateResponse>(`/templates/${templateId}`, {
          method: 'PATCH',
          body: { json_content: json },
        });
        showToast(propagationMessage(row.propagation), 'success');
      } else {
        await apiCall('/templates', {
          method: 'POST',
          body: {
            name: name.trim(),
            slug: slugify(name),
            category: category.trim() || 'general',
            description: description.trim(),
            json_content: json,
          },
        });
        showToast(__('Template saved.'), 'success');
        setName('');
        setCategory('general');
        setDescription('');
        setTemplates(null);
      }
      // The picker / onboarding reload the library next time they open.
      useTemplateLibraryStore.getState().invalidate();
      onClose();
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
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={__('Save as')}>
          <TargetOption
            checked={target === 'new'}
            label={__('New template')}
            onSelect={() => setTarget('new')}
          />
          <TargetOption
            checked={target === 'update'}
            label={__('Update a template')}
            onSelect={() => setTarget('update')}
          />
        </div>

        {target === 'new' ? (
          <>
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
          </>
        ) : (
          <>
            <p className="rounded-md bg-[var(--bg-panel-soft)] px-3 py-2 text-[11.5px] text-[var(--text-secondary)]">
              {__(
                'Replaces the design of the template with the current canvas. Every signature linked to it is updated; employees keep their details and text.',
              )}
            </p>
            <Field label={__('Template')} required>
              <select
                value={templateId ?? ''}
                onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : null)}
                disabled={submitting || templates === null}
              >
                {templates === null && <option value="">{__('Loading…')}</option>}
                {templates?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        <Field label={__('Employee mode')}>
          <select
            value={employeeMode}
            onChange={(e) => setEmployeeMode(e.target.value as EmployeeMode)}
            disabled={submitting}
            data-employee-mode=""
          >
            {EMPLOYEE_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label()}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-[var(--text-muted)]">
            {EMPLOYEE_MODES.find((m) => m.value === employeeMode)?.hint()}
          </span>
        </Field>

        <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          <Lock size={11} className="shrink-0" />
          {lockedCount === 1
            ? __('1 block is locked.')
            : __('%s blocks are locked.', String(lockedCount))}{' '}
          {__('Lock blocks from the block toolbar or the Layers panel.')}
        </p>

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
            disabled={!canSubmit}
            className="inline-flex h-8 items-center rounded-md bg-[var(--accent)] px-3 font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {submitting
              ? __('Saving…')
              : target === 'update'
                ? __('Update template')
                : __('Save as template')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

function propagationMessage(propagation: Propagation | undefined): string {
  if (!propagation || propagation.total === 0) return __('Template updated.');
  if (propagation.status === 'done') {
    return __(
      'Template updated. %s linked signatures were refreshed.',
      String(propagation.updated),
    );
  }
  return __(
    'Template updated. %s linked signatures are being refreshed in the background.',
    String(propagation.total),
  );
}

const TargetOption: FC<{ checked: boolean; label: string; onSelect: () => void }> = ({
  checked,
  label,
  onSelect,
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={checked}
    onClick={onSelect}
    className={cn(
      'h-8 rounded-md border text-[12px] font-medium transition-colors',
      checked
        ? 'border-[var(--accent)] bg-[var(--bg-selected)] text-[var(--accent)]'
        : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
    )}
  >
    {label}
  </button>
);

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
