import { useEffect, useMemo, useState, type FC } from 'react';
import { Search } from 'lucide-react';
import { apiCall } from '@/bridge/apiClient';
import type { SignatureSchema } from '@/core/schema/signature';
import { useSchemaStore } from '@/stores/schemaStore';
import { useEditorStore } from '@/stores/editorStore';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { Modal } from '@/components/shared/Modal';

interface TemplateRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  preview_url: string | null;
  json_content: SignatureSchema;
}

/**
 * Modal listing the seeded templates. Selecting one replaces the
 * current schema (history is cleared) so the user starts fresh.
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
  const setSchema = useSchemaStore((s) => s.setSchema);

  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');

  const open = modal === 'template-picker';

  useEffect(() => {
    if (!open || templates !== null) return;
    apiCall<TemplateRow[]>('/templates?per_page=100')
      .then((data) => setTemplates(data))
      .catch((err: Error) => setError(err.message));
  }, [open, templates]);

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

  return (
    <Modal open={open} title={__('Pick a template')} onClose={closeModal} width={680}>
      {error && (
        <p className="text-sm text-red-600">
          {__('Failed to load templates: %s', error)}
        </p>
      )}
      {!error && templates === null && (
        <p className="text-sm text-[var(--text-muted)]">{__('Loading…')}</p>
      )}
      {templates && templates.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">
          {__('No templates available yet.')}
        </p>
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
              <CategoryChip
                active={category === 'all'}
                onClick={() => setCategory('all')}
              >
                {__('All')}
              </CategoryChip>
              {categories.map((c) => (
                <CategoryChip
                  key={c}
                  active={category === c}
                  onClick={() => setCategory(c)}
                >
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
                  onClick={() => {
                    setSchema(t.json_content);
                    closeModal();
                  }}
                >
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
                    <span className="text-[11.5px] text-[var(--text-muted)]">
                      {t.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

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
