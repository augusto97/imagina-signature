import { useEffect, useState, type FC } from 'react';
import { apiCall } from '@/bridge/apiClient';
import type { SignatureSchema } from '@/core/schema/signature';
import { useSchemaStore } from '@/stores/schemaStore';
import { useEditorStore } from '@/stores/editorStore';
import { __ } from '@/i18n/helpers';
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
 * Loads templates lazily on first open via GET /templates.
 */
export const TemplatePicker: FC = () => {
  const modal = useEditorStore((s) => s.modal);
  const closeModal = useEditorStore((s) => s.closeModal);
  const setSchema = useSchemaStore((s) => s.setSchema);

  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = modal === 'template-picker';

  useEffect(() => {
    if (!open || templates !== null) return;
    apiCall<TemplateRow[]>('/templates?per_page=50')
      .then((data) => setTemplates(data))
      .catch((err: Error) => setError(err.message));
  }, [open, templates]);

  return (
    <Modal open={open} title={__('Pick a template')} onClose={closeModal}>
      {error && (
        <p className="text-sm text-red-600">
          {__('Failed to load templates: %s', error)}
        </p>
      )}
      {!error && templates === null && (
        <p className="text-sm text-[var(--text-muted)]">{__('Loading…')}</p>
      )}
      {templates && templates.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">{__('No templates available yet.')}</p>
      )}
      {templates && templates.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              className="flex flex-col items-start gap-1 rounded border border-[var(--border-default)] p-3 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
              onClick={() => {
                setSchema(t.json_content);
                closeModal();
              }}
            >
              <span className="text-sm font-semibold">{t.name}</span>
              {t.description && (
                <span className="text-xs text-[var(--text-muted)]">{t.description}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
};
