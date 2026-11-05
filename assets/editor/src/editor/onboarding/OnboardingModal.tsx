import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { ArrowLeft, Plus, Sparkles } from 'lucide-react';
import type { SignatureSchema } from '@/core/schema/signature';
import { systemVariables } from '@/core/compiler/variables';
import { useEditorStore } from '@/stores/editorStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useToastStore } from '@/stores/toastStore';
import {
  useTemplateLibraryStore,
  useTemplates,
  type TemplateRow,
} from '@/stores/templateLibraryStore';
import { mergeTemplateIntoSchema } from '@/stores/schemaUtils';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { Modal } from '@/components/shared/Modal';
import { TemplateBrowser } from '@/editor/templates/TemplateGallery';
import { isUsableTemplate } from '@/editor/templates/templateLibrary';
import { detailFields, photoAvatar, variablesFromForm } from '@/editor/templates/templateDetails';
import { DetailsForm, DetailsPreview } from './DetailsForm';

type Step = 'pick' | 'details';

/** Width of the live preview box, in CSS px. */
const PREVIEW_WIDTH = 520;
const PREVIEW_HEIGHT = 360;

/**
 * "Create your signature" — the guided first run, opened when the
 * editor starts a NEW signature on an empty canvas (see
 * {@link OnboardingHost}) or from the empty canvas' "Browse templates".
 *
 *  1. Choose a template (the library's cards, category chips, search)
 *     or start blank.
 *  2. Your details: a form generated from the template's variables —
 *     profile / brand-kit fields read-only, the rest prefilled with the
 *     template's examples — next to a live preview. "Create signature"
 *     applies the template with those values through the same undoable
 *     `replaceSchema` path as the template picker.
 */
export const OnboardingModal: FC = () => {
  const modal = useEditorStore((s) => s.modal);
  const closeModal = useEditorStore((s) => s.closeModal);
  const open = modal === 'onboarding';
  const { templates, error } = useTemplates(open);
  const retry = useTemplateLibraryStore((s) => s.invalidate);

  const [step, setStep] = useState<Step>('pick');
  const [template, setTemplate] = useState<TemplateRow | null>(null);

  useEffect(() => {
    if (!open) {
      setStep('pick');
      setTemplate(null);
    }
  }, [open]);

  const pick = useCallback((row: TemplateRow) => {
    setTemplate(row);
    setStep('details');
  }, []);

  return (
    <Modal
      open={open}
      title={__('Create your signature')}
      onClose={closeModal}
      width={step === 'pick' ? 960 : 1000}
    >
      <Steps step={step} />
      {step === 'pick' && (
        <div className="mt-4">
          <p className="mb-3 text-[12.5px] text-[var(--text-secondary)]">
            {__('Pick a starting point. You can change every block, colour and field later.')}
          </p>
          {error && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
              <span>{__('Failed to load templates: %s', error)}</span>
              <button type="button" className="font-semibold underline" onClick={retry}>
                {__('Retry')}
              </button>
            </div>
          )}
          {!error && templates === null && (
            <p className="text-sm text-[var(--text-muted)]">{__('Loading…')}</p>
          )}
          {(templates !== null || error) && (
            <TemplateBrowser
              templates={templates ?? []}
              onPick={pick}
              columns={3}
              leading={<StartBlankCard onClick={closeModal} />}
            />
          )}
        </div>
      )}
      {step === 'details' && template && isUsableTemplate(template.json_content) && (
        <DetailsStep template={template} onBack={() => setStep('pick')} onDone={closeModal} />
      )}
    </Modal>
  );
};

const Steps: FC<{ step: Step }> = ({ step }) => (
  <ol className="flex items-center gap-2 text-[11.5px]">
    {(
      [
        ['pick', __('Choose a template')],
        ['details', __('Your details')],
      ] as const
    ).map(([key, label], i) => {
      const active = step === key;
      const done = step === 'details' && key === 'pick';
      return (
        <li key={key} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="h-px w-6 bg-[var(--border-strong)]" />}
          <span
            aria-current={active ? 'step' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium',
              active
                ? 'bg-[var(--accent)] text-white'
                : done
                  ? 'bg-[var(--bg-selected)] text-[var(--accent)]'
                  : 'bg-[var(--bg-panel-soft)] text-[var(--text-muted)]',
            )}
          >
            <span className="tabular-nums">{i + 1}</span>
            {label}
          </span>
        </li>
      );
    })}
  </ol>
);

const StartBlankCard: FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-strong)] p-4 text-center transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-hover)]"
  >
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-panel-soft)] text-[var(--text-secondary)]">
      <Plus size={16} />
    </span>
    <span className="text-[13px] font-semibold text-[var(--text-primary)]">
      {__('Start blank')}
    </span>
    <span className="max-w-[200px] text-[11.5px] text-[var(--text-muted)]">
      {__('An empty canvas — add blocks from the left panel.')}
    </span>
  </button>
);

interface DetailsStepProps {
  template: TemplateRow;
  onBack: () => void;
  onDone: () => void;
}

const DetailsStep: FC<DetailsStepProps> = ({ template, onBack, onDone }) => {
  const replaceSchema = useSchemaStore((s) => s.replaceSchema);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const showToast = useToastStore((s) => s.show);

  const schema = template.json_content;
  const examples = useMemo(() => ({ ...(schema.variables ?? {}) }), [schema]);
  const fields = useMemo(() => detailFields(schema, systemVariables()), [schema]);
  const avatar = useMemo(() => photoAvatar(schema.blocks), [schema]);
  // The template's examples, except where the signature already has a
  // value of its own (onboarding reopened on an existing signature).
  const [values, setValues] = useState<Record<string, string>>(() => {
    const own = useSchemaStore.getState().schema.variables ?? {};
    const initial = { ...examples };
    for (const field of fields) {
      if (!field.readOnly && typeof own[field.key] === 'string')
        initial[field.key] = own[field.key]!;
    }
    return initial;
  });

  const onChange = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const variables = useMemo(
    () => variablesFromForm(fields, values, examples),
    [fields, values, examples],
  );

  const create = (): void => {
    const current = useSchemaStore.getState().schema;
    const next = mergeTemplateIntoSchema(current, { ...schema, variables } as SignatureSchema);
    // What the user just confirmed in the form wins over older values.
    next.variables = { ...next.variables, ...variables };
    replaceSchema(next, { undoable: true });
    clearSelection();
    onDone();
    showToast(__('Your signature is ready. Click any block to fine-tune it.'), 'success');
  };

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="max-h-[58vh] overflow-y-auto pr-1">
          <p className="mb-3 text-[12.5px] text-[var(--text-secondary)]">
            {__(
              'Check the details for "%s". Everything can be changed later from the canvas.',
              template.name,
            )}
          </p>
          <DetailsForm
            fields={fields}
            values={values}
            defaults={examples}
            onChange={onChange}
            photoAvatar={avatar}
          />
        </div>
        <div className="md:sticky md:top-0">
          <DetailsPreview
            schema={schema}
            values={variables}
            width={PREVIEW_WIDTH}
            height={PREVIEW_HEIGHT}
          />
        </div>
      </div>
      <footer className="flex items-center justify-between border-t border-[var(--border-default)] pt-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={14} />
          {__('Back to templates')}
        </button>
        <button
          type="button"
          onClick={create}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 text-[13px] font-semibold text-white shadow-[var(--shadow-xs)] hover:bg-[var(--accent-hover)]"
        >
          <Sparkles size={14} />
          {__('Create signature')}
        </button>
      </footer>
    </div>
  );
};
