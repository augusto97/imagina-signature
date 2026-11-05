import { useCallback, useMemo, type FC } from 'react';
import { ExternalLink, UserRound } from 'lucide-react';
import { getConfig } from '@/bridge/apiClient';
import { compileSignature } from '@/core/compiler/compile';
import { systemVariables } from '@/core/compiler/variables';
import { useSchemaStore } from '@/stores/schemaStore';
import { __ } from '@/i18n/helpers';
import { detailFields, photoAvatar } from '@/editor/templates/templateDetails';
import { DetailsForm } from '@/editor/onboarding/DetailsForm';

/**
 * `fields_only` employee mode (1.3.0): instead of the canvas tools the
 * user gets the same "Your details" form as the onboarding — friendly
 * labels, photo upload, profile and brand-kit values read-only where
 * they are set — beside a live, read-only preview of the compiled
 * signature. Every edit goes straight to the signature's variables
 * (autosaved like any other edit).
 */
export const FieldsOnlyView: FC = () => {
  const schema = useSchemaStore((s) => s.schema);
  const setVariable = useSchemaStore((s) => s.setVariable);
  const removeVariable = useSchemaStore((s) => s.removeVariable);
  const system = useMemo(() => systemVariables(), []);
  const fields = useMemo(() => detailFields(schema, system), [schema, system]);
  const avatar = useMemo(() => photoAvatar(schema.blocks), [schema.blocks]);
  const compiled = useMemo(() => {
    try {
      return compileSignature(schema);
    } catch {
      return null;
    }
  }, [schema]);

  const onChange = useCallback(
    (key: string, value: string) => {
      const field = fields.find((f) => f.key === key);
      if (!field || field.readOnly) return;
      // A blank profile / brand-kit override is dropped so the system
      // value shows again once it is filled in; the signature's own
      // fields keep whatever was typed (including an empty string).
      if (field.source !== 'signature' && value === '') removeVariable(key);
      else setVariable(key, value);
    },
    [fields, removeVariable, setVariable],
  );

  let profileUrl = '';
  try {
    profileUrl = getConfig().profileUrl ?? '';
  } catch {
    profileUrl = '';
  }
  const hasProfileFields = fields.some((f) => f.source === 'profile');

  return (
    <div className="flex flex-1 overflow-hidden" data-imgsig-fields-only="">
      <aside className="flex w-[420px] shrink-0 flex-col overflow-y-auto border-r border-[var(--border-default)] bg-[var(--bg-panel)]">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border-default)] px-4">
          <UserRound size={14} className="text-[var(--text-muted)]" />
          <span className="is-section-label">{__('Your details')}</span>
        </div>

        <div className="flex flex-col gap-4 px-4 py-4 text-[12px]">
          <p className="text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
            {__(
              'Your company manages the design of this signature. Fill in your details and the preview updates as you type.',
            )}
          </p>

          {fields.length === 0 ? (
            <p className="rounded-md bg-[var(--bg-panel-soft)] px-3 py-2 text-[11.5px] text-[var(--text-muted)]">
              {__('This design has no fields to fill in.')}
            </p>
          ) : (
            <DetailsForm
              fields={fields}
              values={schema.variables ?? {}}
              onChange={onChange}
              photoAvatar={avatar}
              ownHint={__('Used wherever this signature shows them.')}
            />
          )}

          {hasProfileFields && profileUrl && (
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--accent)] hover:underline"
            >
              {__('Edit profile')}
              <ExternalLink size={10} />
            </a>
          )}
        </div>
      </aside>

      <main className="flex flex-1 flex-col items-center overflow-auto bg-[var(--bg-primary)] px-6 py-10">
        <span className="is-section-label mb-3">{__('Preview')}</span>
        {compiled ? (
          <iframe
            title={__('Signature preview')}
            srcDoc={compiled.html}
            sandbox=""
            className="block min-h-[320px] rounded border border-[var(--border-default)] bg-white"
            style={{ width: Math.min(compiled.width + 48, 848), maxWidth: '100%', height: '60vh' }}
          />
        ) : (
          <p className="text-[12px] text-[var(--danger)]">
            {__('The preview could not be generated.')}
          </p>
        )}
      </main>
    </div>
  );
};
