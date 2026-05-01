import { useState, type FC } from 'react';
import { Plus, Trash2, Lock } from 'lucide-react';
import { useSchemaStore } from '@/stores/schemaStore';
import { useToastStore } from '@/stores/toastStore';
import { getConfig } from '@/bridge/apiClient';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';

/**
 * Variables editor — manages `schema.variables`, the key/value bag
 * the compiler swaps in for any `{{varname}}` token found in
 * compiled HTML.
 *
 * Variable names are validated to a safe character set (letters,
 * digits, dashes, underscores, dots). Renaming is in-place: the row
 * shows the current name as an editable input; on blur, the rename
 * action runs and any in-flight schema references continue to work
 * as-typed (the compiler treats unknown names as literal text).
 *
 * "Copy" copies the `{{name}}` token to the clipboard so the user
 * can paste it into any text / heading / button field.
 */
export const VariablesEditor: FC = () => {
  const variables = useSchemaStore((s) => s.schema.variables);
  const setVariable = useSchemaStore((s) => s.setVariable);
  const removeVariable = useSchemaStore((s) => s.removeVariable);
  const renameVariable = useSchemaStore((s) => s.renameVariable);
  const showToast = useToastStore((s) => s.show);

  const [draftKey, setDraftKey] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const entries = Object.entries(variables);
  const systemEntries = Object.entries(getConfig().systemVariables ?? {});

  const addVariable = (): void => {
    const key = draftKey.trim();
    if (!key) return;
    if (!isValidVariableName(key)) {
      setError(__('Use letters, digits, dashes, underscores, or dots.'));
      return;
    }
    if (Object.prototype.hasOwnProperty.call(variables, key)) {
      setError(__('A variable named "%s" already exists.', key));
      return;
    }
    setVariable(key, draftValue);
    setDraftKey('');
    setDraftValue('');
    setError(null);
  };

  const copyToken = async (key: string): Promise<void> => {
    const token = `{{${key}}}`;
    try {
      await navigator.clipboard.writeText(token);
      showToast(__('Copied %s', token), 'success');
    } catch {
      showToast(__('Could not copy to clipboard'), 'error');
    }
  };

  return (
    <div className="flex flex-col gap-3 px-4 py-3 text-[12px]">
      <div className="flex items-center justify-between">
        <span className="is-section-label">{__('Variables')}</span>
        <span className="text-[10.5px] text-[var(--text-muted)]">
          {entries.length === 0
            ? __('None yet')
            : __('%s defined', String(entries.length))}
        </span>
      </div>

      <p className="rounded-md bg-[var(--bg-panel-soft)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
        {__(
          'Type {{name}} anywhere in a text or button — the compiler swaps it for the value below at export time.',
        )}
      </p>

      {systemEntries.length > 0 && (
        <ul className="flex flex-col gap-1">
          {systemEntries.map(([key, value]) => (
            <SystemVariableRow
              key={key}
              name={key}
              value={value}
              onCopy={() => void copyToken(key)}
            />
          ))}
        </ul>
      )}

      {entries.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {entries.map(([key, value]) => (
            <VariableRow
              key={key}
              name={key}
              value={value}
              onRename={(next) => renameVariable(key, next)}
              onChangeValue={(next) => setVariable(key, next)}
              onRemove={() => removeVariable(key)}
              onCopy={() => void copyToken(key)}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-2.5">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1.5">
          <input
            type="text"
            placeholder={__('name')}
            value={draftKey}
            onChange={(e) => {
              setDraftKey(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addVariable();
              }
            }}
          />
          <input
            type="text"
            placeholder={__('value')}
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addVariable();
              }
            }}
          />
        </div>
        <button
          type="button"
          onClick={addVariable}
          disabled={!draftKey.trim()}
          className="inline-flex h-7 items-center justify-center gap-1 rounded-md bg-[var(--accent)] text-[11px] font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-40"
        >
          <Plus size={12} />
          {__('Add variable')}
        </button>
        {error && (
          <span className="text-[10.5px] text-[var(--danger)]">{error}</span>
        )}
      </div>
    </div>
  );
};

interface RowProps {
  name: string;
  value: string;
  onRename: (next: string) => void;
  onChangeValue: (next: string) => void;
  onRemove: () => void;
  onCopy: () => void;
}

const VariableRow: FC<RowProps> = ({ name, value, onRename, onChangeValue, onRemove, onCopy }) => {
  const [draftName, setDraftName] = useState(name);
  const [renameError, setRenameError] = useState<string | null>(null);

  const commitRename = (): void => {
    const next = draftName.trim();
    if (!next || next === name) {
      setDraftName(name);
      setRenameError(null);
      return;
    }
    if (!isValidVariableName(next)) {
      setRenameError('Invalid name.');
      setDraftName(name);
      return;
    }
    onRename(next);
    setRenameError(null);
  };

  return (
    <li className="flex flex-col gap-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] p-2 transition-colors hover:border-[var(--border-strong)]">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-1.5">
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={cn(renameError && '!border-[var(--danger)]')}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChangeValue(e.target.value)}
        />
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title={__('Copy {{token}}')}
            onClick={onCopy}
            className="inline-flex h-7 items-center rounded px-1.5 font-mono text-[10.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          >
            {`{{}}`}
          </button>
          <button
            type="button"
            title={__('Remove')}
            onClick={onRemove}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] hover:bg-red-50 hover:text-[var(--danger)]"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {renameError && (
        <span className="text-[10.5px] text-[var(--danger)]">{renameError}</span>
      )}
    </li>
  );
};

const SystemVariableRow: FC<{
  name: string;
  value: string;
  onCopy: () => void;
}> = ({ name, value, onCopy }) => (
  <li className="flex items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-2 text-[11.5px]">
    <Lock size={11} className="shrink-0 text-[var(--text-muted)]" />
    <span className="shrink-0 truncate font-mono text-[10.5px] text-[var(--text-primary)]">
      {name}
    </span>
    <span className="flex-1 truncate text-[var(--text-muted)]">
      {value || __('(empty in profile)')}
    </span>
    <button
      type="button"
      onClick={onCopy}
      title={__('Copy {{token}}')}
      className="inline-flex h-6 items-center rounded px-1.5 font-mono text-[10.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
    >
      {`{{}}`}
    </button>
  </li>
);

function isValidVariableName(name: string): boolean {
  return /^[a-zA-Z0-9_.-]+$/.test(name);
}
