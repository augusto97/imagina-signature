import { useMemo, type FC } from 'react';
import { ExternalLink, Lock, UserRound } from 'lucide-react';
import { getConfig } from '@/bridge/apiClient';
import { compileSignature } from '@/core/compiler/compile';
import { systemVariables } from '@/core/compiler/variables';
import { detailFields } from '@/core/schema/locks';
import { useSchemaStore } from '@/stores/schemaStore';
import { __ } from '@/i18n/helpers';

/** "job_title" → "Job title". */
function fieldLabel(name: string): string {
  const words = name.replace(/[_.-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name;
}

/**
 * `fields_only` employee mode (1.3.0): instead of the canvas tools the
 * user gets a "Your details" form — the signature's variables, plus the
 * profile values the design uses, read-only — beside a live, read-only
 * preview of the compiled signature.
 */
export const FieldsOnlyView: FC = () => {
  const schema = useSchemaStore((s) => s.schema);
  const setVariable = useSchemaStore((s) => s.setVariable);
  const system = useMemo(() => systemVariables(), []);
  const { editable, profile } = useMemo(() => detailFields(schema, system), [schema, system]);
  const compiled = useMemo(() => {
    try {
      return compileSignature(schema);
    } catch {
      return null;
    }
  }, [schema]);

  let profileUrl = '';
  try {
    profileUrl = getConfig().profileUrl ?? '';
  } catch {
    profileUrl = '';
  }

  return (
    <div className="flex flex-1 overflow-hidden" data-imgsig-fields-only="">
      <aside className="flex w-96 shrink-0 flex-col overflow-y-auto border-r border-[var(--border-default)] bg-[var(--bg-panel)]">
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

          {editable.length === 0 && profile.length === 0 && (
            <p className="rounded-md bg-[var(--bg-panel-soft)] px-3 py-2 text-[11.5px] text-[var(--text-muted)]">
              {__('This design has no fields to fill in.')}
            </p>
          )}

          {editable.length > 0 && (
            <div className="flex flex-col gap-3">
              {editable.map((name) => (
                <label key={name} className="flex flex-col gap-1">
                  <span className="text-[11.5px] font-medium text-[var(--text-secondary)]">
                    {fieldLabel(name)}
                  </span>
                  <input
                    type="text"
                    value={schema.variables?.[name] ?? ''}
                    onChange={(e) => setVariable(name, e.target.value)}
                    data-variable={name}
                  />
                </label>
              ))}
            </div>
          )}

          {profile.length > 0 && (
            <div className="flex flex-col gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-3">
              <span className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <Lock size={10} />
                {__('From your profile')}
              </span>
              <ul className="flex flex-col gap-1.5">
                {profile.map(([name, value]) => (
                  <li key={name} className="flex flex-col">
                    <span className="text-[11px] text-[var(--text-muted)]">{fieldLabel(name)}</span>
                    <span
                      className="truncate text-[12px] text-[var(--text-primary)]"
                      data-profile={name}
                    >
                      {value || __('(empty in profile)')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                {profileUrl ? (
                  <a
                    href={profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline"
                  >
                    {__('Edit profile')}
                    <ExternalLink size={10} />
                  </a>
                ) : (
                  __('Edit profile to change these values.')
                )}
              </p>
            </div>
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
