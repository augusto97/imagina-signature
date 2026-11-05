import type { FC } from 'react';
import type { Editor } from '@tiptap/react';
import { Braces } from 'lucide-react';
import { getConfig } from '@/bridge/apiClient';
import { useSchemaStore } from '@/stores/schemaStore';
import { isInternalVariable } from '@/core/compiler/variables';
import { __ } from '@/i18n/helpers';
import { ToolbarMenu } from './ToolbarMenu';

interface Props {
  editor: Editor;
}

interface FieldGroup {
  title: string;
  fields: Array<{ key: string; value: string }>;
}

/** Read-only `wp_*` profile variables injected by PHP (empty outside the host). */
function systemVariables(): Record<string, string> {
  try {
    return getConfig().systemVariables ?? {};
  } catch {
    return {};
  }
}

/**
 * "Insert field" menu: lists the system (profile) variables and the
 * signature's own variables and inserts the chosen one as a plain
 * `{{key}}` token at the caret — the compiler substitutes it on export.
 */
export const InsertFieldMenu: FC<Props> = ({ editor }) => {
  const userVariables = useSchemaStore((s) => s.schema.variables) ?? {};
  const system = systemVariables();
  // A signature variable overrides the profile field of the same name
  // at compile time, so show the value that will actually ship.
  const valueOf = (key: string) => userVariables[key] ?? system[key] ?? '';

  const groups: FieldGroup[] = [
    {
      title: __('Profile fields'),
      fields: Object.keys(system)
        .filter((key) => !isInternalVariable(key))
        .sort()
        .map((key) => ({ key, value: valueOf(key) })),
    },
    {
      title: __('Signature variables'),
      fields: Object.keys(userVariables)
        // Listed once, under the profile fields, when names collide.
        .filter((key) => !(key in system))
        .sort()
        .map((key) => ({ key, value: valueOf(key) })),
    },
  ].filter((g) => g.fields.length > 0);

  return (
    <ToolbarMenu label={__('Insert field')} trigger={<Braces size={13} />} width={224} align="end">
      {(close) =>
        groups.length === 0 ? (
          <p className="text-[var(--text-muted)]">
            {__('No fields yet. Add variables in the canvas settings.')}
          </p>
        ) : (
          <div className="max-h-60 space-y-2 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.title}>
                <span className="is-section-label mb-1 block">{group.title}</span>
                <ul className="space-y-0.5">
                  {group.fields.map((field) => (
                    <li key={field.key}>
                      <button
                        type="button"
                        className="flex w-full items-baseline gap-2 rounded px-1.5 py-1 text-left hover:bg-[var(--bg-hover)]"
                        onClick={() => {
                          editor.chain().focus().insertContent(`{{${field.key}}}`).run();
                          close();
                        }}
                      >
                        <code className="shrink-0 font-mono text-[10.5px] text-[var(--accent)]">
                          {`{{${field.key}}}`}
                        </code>
                        <span className="truncate text-[var(--text-muted)]">{field.value}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )
      }
    </ToolbarMenu>
  );
};
