import { useCallback, useEffect, useState, type FC } from 'react';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useEditorStore } from '@/stores/editorStore';
import { useToastStore } from '@/stores/toastStore';
import {
  useTemplateLibraryStore,
  useTemplates,
  type TemplateRow,
} from '@/stores/templateLibraryStore';
import { mergeTemplateIntoSchema } from '@/stores/schemaUtils';
import { __ } from '@/i18n/helpers';
import { Modal } from '@/components/shared/Modal';
import { TemplateBrowser } from '@/editor/templates/TemplateGallery';
import { isUsableTemplate } from '@/editor/templates/templateLibrary';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Modal listing the template library.
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
 * Each card shows a live thumbnail compiled with the regular export
 * pipeline from the user's own variable values (blank brand-kit fields
 * get neutral samples — see `editor/templates/templatePreview.ts`).
 *
 * Filtering ({@link TemplateBrowser}): search across name, description
 * and category, translated category chips, and a result count.
 */
export const TemplatePicker: FC = () => {
  const modal = useEditorStore((s) => s.modal);
  const closeModal = useEditorStore((s) => s.closeModal);
  const replaceSchema = useSchemaStore((s) => s.replaceSchema);
  const hasBlocks = useSchemaStore((s) => s.schema.blocks.length > 0);
  const variables = useSchemaStore((s) => s.schema.variables);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const showToast = useToastStore((s) => s.show);
  const retry = useTemplateLibraryStore((s) => s.invalidate);

  const open = modal === 'template-picker';
  const { templates, error } = useTemplates(open);
  const [pending, setPending] = useState<TemplateRow | null>(null);

  useEffect(() => {
    if (!open) setPending(null);
  }, [open]);

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

  const onPick = useCallback(
    (template: TemplateRow): void => {
      if (useSchemaStore.getState().schema.blocks.length > 0) {
        setPending(template);
        return;
      }
      apply(template);
    },
    [apply],
  );

  const cancelPending = useCallback(() => setPending(null), []);

  return (
    <>
      <Modal open={open} title={__('Pick a template')} onClose={closeModal} width={680}>
        {error && (
          <div className="flex items-center justify-between gap-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
            <span>{__('Failed to load templates: %s', error)}</span>
            <button type="button" className="font-semibold underline" onClick={retry}>
              {__('Retry')}
            </button>
          </div>
        )}
        {!error && templates === null && (
          <p className="text-sm text-[var(--text-muted)]">{__('Loading…')}</p>
        )}
        {templates && templates.length === 0 && (
          <p className="text-sm text-[var(--text-muted)]">{__('No templates available yet.')}</p>
        )}
        {templates && templates.length > 0 && (
          <TemplateBrowser templates={templates} values={variables} onPick={onPick} />
        )}
      </Modal>

      <ConfirmDialog
        open={open && pending !== null && hasBlocks}
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
