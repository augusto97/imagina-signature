import { useCallback, useMemo, useState, type FC } from 'react';
import { systemVariables } from '@/core/compiler/variables';
import type { SignatureSchema } from '@/core/schema/signature';
import { useEditorStore } from '@/stores/editorStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { useToastStore } from '@/stores/toastStore';
import { __ } from '@/i18n/helpers';
import { Modal } from '@/components/shared/Modal';
import { detailFields, photoAvatar, variablesFromForm } from '@/editor/templates/templateDetails';
import { DetailsForm, DetailsPreview } from './DetailsForm';

/**
 * Topbar "Your details": the onboarding's second step for the signature
 * being edited — every variable its blocks use, profile / brand-kit
 * values read-only, the rest editable, with a live preview. Saving
 * writes the variables in ONE undoable step.
 */
export const YourDetailsModal: FC = () => {
  const open = useEditorStore((s) => s.modal === 'your-details');
  const closeModal = useEditorStore((s) => s.closeModal);
  return (
    <Modal open={open} title={__('Your details')} onClose={closeModal} width={1000}>
      {open && <YourDetailsBody onClose={closeModal} />}
    </Modal>
  );
};

const YourDetailsBody: FC<{ onClose: () => void }> = ({ onClose }) => {
  // A snapshot: the form edits a copy and saves on demand.
  const [schema] = useState<SignatureSchema>(() => useSchemaStore.getState().schema);
  const replaceSchema = useSchemaStore((s) => s.replaceSchema);
  const showToast = useToastStore((s) => s.show);

  const base = useMemo(() => ({ ...(schema.variables ?? {}) }), [schema]);
  const fields = useMemo(() => detailFields(schema, systemVariables()), [schema]);
  const avatar = useMemo(() => photoAvatar(schema.blocks), [schema]);
  const [values, setValues] = useState<Record<string, string>>(base);

  const onChange = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const variables = useMemo(() => variablesFromForm(fields, values, base), [fields, values, base]);

  const save = (): void => {
    if (JSON.stringify(variables) !== JSON.stringify(base)) {
      const latest = useSchemaStore.getState().schema;
      replaceSchema({ ...latest, variables }, { undoable: true });
      showToast(__('Details updated. Press Ctrl+Z to undo.'), 'success');
    }
    onClose();
  };

  if (fields.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[12.5px] text-[var(--text-secondary)]">
          {__(
            'This signature has no fields yet. Pick a template, or insert fields such as {{job_title}} into a text block.',
          )}
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center rounded-md border border-[var(--border-default)] px-3 text-[12.5px] font-medium hover:bg-[var(--bg-hover)]"
          >
            {__('Close')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="max-h-[62vh] overflow-y-auto pr-1">
          <DetailsForm
            fields={fields}
            values={values}
            defaults={base}
            onChange={onChange}
            photoAvatar={avatar}
            ownHint={__('Used wherever this signature shows them.')}
          />
        </div>
        <div className="md:sticky md:top-0">
          <DetailsPreview schema={schema} values={variables} width={520} height={360} />
        </div>
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-[var(--border-default)] pt-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 items-center rounded-md border border-[var(--border-default)] px-3 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
        >
          {__('Cancel')}
        </button>
        <button
          type="button"
          onClick={save}
          className="inline-flex h-8 items-center rounded-md bg-[var(--accent)] px-4 text-[12.5px] font-semibold text-white hover:bg-[var(--accent-hover)]"
        >
          {__('Save details')}
        </button>
      </footer>
    </div>
  );
};
