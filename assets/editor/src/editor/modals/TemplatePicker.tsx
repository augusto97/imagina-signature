import { memo, useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { Search } from 'lucide-react';
import { apiCall } from '@/bridge/apiClient';
import type { SignatureSchema } from '@/core/schema/signature';
import { compileSignature } from '@/core/compiler/compile';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useEditorStore } from '@/stores/editorStore';
import { useToastStore } from '@/stores/toastStore';
import { mergeTemplateIntoSchema } from '@/stores/schemaUtils';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { Modal } from '@/components/shared/Modal';
import { ConfirmDialog } from './ConfirmDialog';

interface TemplateRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  preview_url: string | null;
  json_content: SignatureSchema;
}

/** Rendered width of a thumbnail, in CSS px. */
const THUMB_WIDTH = 288;
/** Rendered height of a thumbnail, in CSS px. */
const THUMB_HEIGHT = 140;

function isUsableTemplate(schema: unknown): schema is SignatureSchema {
  return (
    schema !== null &&
    typeof schema === 'object' &&
    !Array.isArray(schema) &&
    Array.isArray((schema as { blocks?: unknown }).blocks)
  );
}

/**
 * Modal listing the seeded templates.
 *
 * Applying a template is a user edit, not a load:
 *   - When the canvas already has blocks the user is asked to confirm
 *     first (in-app {@link ConfirmDialog}, not `window.confirm`).
 *   - The new schema goes through `replaceSchema(…, { undoable: true })`
 *     which pushes the current schema to history — a single Ctrl+Z
 *     restores the previous design.
 *   - Variables are merged via {@link mergeTemplateIntoSchema}: the
 *     user's existing values win for keys the template also uses, and
 *     the user's other variables are kept.
 *
 * Each card shows a live thumbnail: the template is compiled with the
 * regular export pipeline (read-only use of `compileSignature`) using
 * the merged variables, so the preview shows the user's own data, and
 * rendered in a scaled, fully sandboxed `<iframe srcdoc>`.
 *
 * Filtering: a search field matches against name + description, and
 * a horizontal chip strip switches between categories. The
 * "All" chip is always first; subsequent chips are derived from the
 * loaded templates so admin-added categories surface automatically.
 *
 * Loads templates lazily on first open via GET /templates.
 */
export const TemplatePicker: FC = () => {
  const modal = useEditorStore((s) => s.modal);
  const closeModal = useEditorStore((s) => s.closeModal);
  const replaceSchema = useSchemaStore((s) => s.replaceSchema);
  const hasBlocks = useSchemaStore((s) => s.schema.blocks.length > 0);
  const variables = useSchemaStore((s) => s.schema.variables);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const showToast = useToastStore((s) => s.show);

  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [pending, setPending] = useState<TemplateRow | null>(null);

  const open = modal === 'template-picker';

  useEffect(() => {
    if (!open || templates !== null) return;
    apiCall<TemplateRow[]>('/templates?per_page=100')
      .then((data) => setTemplates(data))
      .catch((err: Error) => setError(err.message));
  }, [open, templates]);

  useEffect(() => {
    if (!open) setPending(null);
  }, [open]);

  const categories = useMemo(() => {
    if (!templates) return [];
    const set = new Set<string>();
    for (const t of templates) {
      if (t.category) set.add(t.category);
    }
    return Array.from(set).sort();
  }, [templates]);

  const filtered = useMemo(() => {
    if (!templates) return [];
    const needle = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (category !== 'all' && t.category !== category) return false;
      if (!needle) return true;
      return (
        t.name.toLowerCase().includes(needle) ||
        (t.description ?? '').toLowerCase().includes(needle)
      );
    });
  }, [templates, search, category]);

  const apply = useCallback(
    (template: TemplateRow): void => {
      if (!isUsableTemplate(template.json_content)) {
        showToast(__('This template has no readable content.'), 'error');
        return;
      }
      const current = useSchemaStore.getState().schema;
      replaceSchema(mergeTemplateIntoSchema(current, template.json_content), { undoable: true });
      clearSelection();
      setPending(null);
      closeModal();
      if (current.blocks.length > 0) {
        showToast(__('Template applied. Press Ctrl+Z to undo.'), 'success');
      }
    },
    [replaceSchema, clearSelection, closeModal, showToast],
  );

  const onPick = (template: TemplateRow): void => {
    if (hasBlocks) {
      setPending(template);
      return;
    }
    apply(template);
  };

  const cancelPending = useCallback(() => setPending(null), []);

  return (
    <>
      <Modal open={open} title={__('Pick a template')} onClose={closeModal} width={680}>
        {error && (
          <p className="text-sm text-red-600">{__('Failed to load templates: %s', error)}</p>
        )}
        {!error && templates === null && (
          <p className="text-sm text-[var(--text-muted)]">{__('Loading…')}</p>
        )}
        {templates && templates.length === 0 && (
          <p className="text-sm text-[var(--text-muted)]">{__('No templates available yet.')}</p>
        )}
        {templates && templates.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative max-w-xs flex-1">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                />
                <input
                  type="search"
                  placeholder={__('Search by name…')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="!pl-9"
                />
              </div>
            </div>

            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <CategoryChip active={category === 'all'} onClick={() => setCategory('all')}>
                  {__('All')}
                </CategoryChip>
                {categories.map((c) => (
                  <CategoryChip key={c} active={category === c} onClick={() => setCategory(c)}>
                    {c}
                  </CategoryChip>
                ))}
              </div>
            )}

            {filtered.length === 0 ? (
              <p className="rounded-md bg-[var(--bg-panel-soft)] p-4 text-center text-[12px] text-[var(--text-muted)]">
                {__('No templates match your filters.')}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {filtered.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="flex flex-col items-start gap-1.5 rounded-md border border-[var(--border-default)] p-3 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
                    onClick={() => onPick(t)}
                  >
                    <TemplateThumbnail template={t.json_content} variables={variables} name={t.name} />
                    <div className="flex w-full items-start justify-between gap-2">
                      <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                        {t.name}
                      </span>
                      {t.category && (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-slate-600">
                          {t.category}
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <span className="text-[11.5px] text-[var(--text-muted)]">{t.description}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={open && pending !== null}
        title={__('Replace your current signature?')}
        confirmLabel={__('Apply template')}
        tone="danger"
        onCancel={cancelPending}
        onConfirm={() => {
          if (pending) apply(pending);
        }}
      >
        <p>
          {__(
            'Applying "%s" replaces the blocks and canvas settings on the canvas. Your variable values are kept, and you can undo this with Ctrl+Z.',
            pending?.name ?? '',
          )}
        </p>
      </ConfirmDialog>
    </>
  );
};

interface TemplateThumbnailProps {
  template: SignatureSchema;
  variables: Record<string, string>;
  name: string;
}

/**
 * Scaled live preview of a template. Compiles once per template /
 * variables pair; renders nothing when the template can't compile so
 * a broken row never breaks the picker.
 */
const TemplateThumbnail: FC<TemplateThumbnailProps> = memo(({ template, variables, name }) => {
  const preview = useMemo(() => {
    if (!isUsableTemplate(template)) return null;
    try {
      // Same variable precedence as apply(): the user's values win.
      const schema: SignatureSchema = {
        ...template,
        variables: { ...(template.variables ?? {}), ...variables },
      };
      const width = schema.canvas?.width || 600;
      return { html: compileSignature(schema).html, width };
    } catch {
      return null;
    }
  }, [template, variables]);

  if (!preview) {
    return <div aria-hidden className="w-full rounded bg-[var(--bg-panel-soft)]" style={{ height: THUMB_HEIGHT }} />;
  }

  const scale = Math.min(1, THUMB_WIDTH / preview.width);

  return (
    <div
      aria-hidden
      className="pointer-events-none relative w-full overflow-hidden rounded border border-[var(--border-default)] bg-white"
      style={{ height: THUMB_HEIGHT }}
    >
      <iframe
        title={__('Preview of %s', name)}
        srcDoc={preview.html}
        sandbox=""
        tabIndex={-1}
        loading="lazy"
        className="absolute left-0 top-0 border-0"
        style={{
          width: preview.width,
          height: THUMB_HEIGHT / scale,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      />
    </div>
  );
});
TemplateThumbnail.displayName = 'TemplateThumbnail';

const CategoryChip: FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'h-7 rounded-full border px-3 text-[11.5px] font-medium transition-colors',
      active
        ? 'border-transparent bg-[var(--accent)] text-white'
        : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
    )}
  >
    {children}
  </button>
);
