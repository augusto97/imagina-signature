import { useEffect, useState, type FC } from 'react';
import { LayoutTemplate, Plus } from 'lucide-react';
import { Topbar } from '@admin/components/Topbar';
import { Button } from '@admin/components/Button';
import { EmptyState } from '@admin/components/EmptyState';
import { Spinner } from '@admin/components/Spinner';
import { apiCall, getConfig } from '@admin/api';
import { __ } from '@admin/i18n';
import type { TemplateRow } from '@admin/types';

/**
 * Templates listing — read-open to anyone with `imgsig_use_signatures`,
 * write-only for admins (CLAUDE.md §15.2).
 *
 * The "Edit" / "Delete" affordances only render when the user has
 * `imgsig_manage_templates`.
 */
export const TemplatesPage: FC = () => {
  const config = getConfig();
  const canManage = config.capabilities.manage_templates;

  const [items, setItems] = useState<TemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiCall<TemplateRow[]>('/templates?per_page=100')
      .then((data) => setItems(data))
      .catch((e: Error) => setError(e.message));
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
            <Button variant="primary" icon={<Plus size={14} />}>
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
            description={__('Templates are typically seeded on plugin activation.')}
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
    </div>
  );
};
