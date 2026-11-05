import { useState, type FC } from 'react';
import { Plus, Trash2, Lock, ExternalLink } from 'lucide-react';
import { useSchemaStore } from '@/stores/schemaStore';
import { useToastStore } from '@/stores/toastStore';
import { getConfig } from '@/bridge/apiClient';
import { isShadowedByProfile, profileVariableKeys } from '@/core/compiler/variables';
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
  const config = getConfig();
  const system = config.systemVariables ?? {};
  const profileKeys = profileVariableKeys();
  const labels = new Map((config.profileFields ?? []).map((f) => [f.key, f.label]));
  const { profile: profileEntries, company: companyEntries } = groupSystemVariables(
    system,
    profileKeys,
  );
  // A signature variable overrides a system value of the same name —
  // except a non-empty profile value, which always ships.
  const isOverridden = (key: string): boolean =>
    Object.prototype.hasOwnProperty.call(variables, key) &&
    !isShadowedByProfile(key, system, profileKeys);

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

      {profileEntries.length > 0 && (
        <SystemVariableGroup
          title={__('Your profile')}
          hint={__(
            'Filled from your profile. A value set there replaces the example in this signature.',
          )}
          action={
            config.profileUrl ? (
              <a
                href={config.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10.5px] font-medium normal-case tracking-normal text-[var(--accent)] hover:underline"
              >
                {__('Edit profile')}
                <ExternalLink size={10} />
              </a>
            ) : undefined
          }
        >
          {profileEntries.map(([key, value]) => (
            <SystemVariableRow
              key={key}
              name={key}
              label={labels.get(key)}
              value={value}
              emptyLabel={__('(empty in profile)')}
              overridden={isOverridden(key)}
              onCopy={() => void copyToken(key)}
            />
          ))}
        </SystemVariableGroup>
      )}

      {companyEntries.length > 0 && (
        <SystemVariableGroup
          title={__('Company')}
          hint={__('From the brand kit your administrator set up.')}
        >
          {companyEntries.map(([key, value]) => (
            <SystemVariableRow
              key={key}
              name={key}
              value={value}
              emptyLabel={__('(not set in brand kit)')}
              overridden={isOverridden(key)}
              onCopy={() => void copyToken(key)}
            />
          ))}
        </SystemVariableGroup>
      )}

      {entries.length > 0 && (profileEntries.length > 0 || companyEntries.length > 0) && (
        <span className="is-section-label">{__('This signature')}</span>
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
              shadowed={isShadowedByProfile(key, system, profileKeys)}
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
  /** A non-empty profile value of the same name ships instead. */
  shadowed?: boolean;
}

const VariableRow: FC<RowProps> = ({
  name,
  value,
  onRename,
  onChangeValue,
  onRemove,
  onCopy,
  shadowed,
}) => {
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
      setRenameError(__('Invalid name.'));
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
      {shadowed && (
        <span className="flex items-center gap-1 text-[10.5px] text-[var(--text-muted)]">
          <Lock size={10} className="shrink-0" />
          {__('Your profile value is used instead of this one.')}
        </span>
      )}
    </li>
  );
};

/** Prefix of the read-only brand-kit variables (`company_name`, …). */
const COMPANY_PREFIX = 'company_';

/**
 * Splits the read-only system variables into the user's own profile
 * (profile fields first, in `profileKeys` order, then `wp_*` and
 * filter-added extras) and the company brand kit (`company_*`).
 */
function groupSystemVariables(
  system: Record<string, string>,
  profileKeys: readonly string[],
): {
  profile: Array<[string, string]>;
  company: Array<[string, string]>;
} {
  const profile: Array<[string, string]> = [];
  const company: Array<[string, string]> = [];
  for (const key of profileKeys) {
    if (Object.prototype.hasOwnProperty.call(system, key)) profile.push([key, system[key] ?? '']);
  }
  for (const entry of Object.entries(system)) {
    if (profileKeys.includes(entry[0])) continue;
    (entry[0].startsWith(COMPANY_PREFIX) ? company : profile).push(entry);
  }
  return { profile, company };
}

const SystemVariableGroup: FC<{
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, hint, action, children }) => (
  <div className="flex flex-col gap-1">
    <span className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
      <Lock size={10} className="shrink-0" />
      <span className="flex-1">{title}</span>
      {action}
    </span>
    {hint && <span className="text-[10.5px] text-[var(--text-muted)]">{hint}</span>}
    <ul className="flex flex-col gap-1">{children}</ul>
  </div>
);

const SystemVariableRow: FC<{
  name: string;
  /** Human label (profile fields), shown as the tooltip. */
  label?: string;
  value: string;
  emptyLabel: string;
  /** A signature variable with the same name wins at export. */
  overridden?: boolean;
  onCopy: () => void;
}> = ({ name, label, value, emptyLabel, overridden, onCopy }) => (
  <li
    className="flex items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-2 text-[11.5px]"
    title={
      overridden ? __("Overridden by this signature's own variable of the same name.") : label
    }
  >
    <Lock size={11} className="shrink-0 text-[var(--text-muted)]" />
    <span
      className={cn(
        'shrink-0 truncate font-mono text-[10.5px] text-[var(--text-primary)]',
        overridden && 'line-through opacity-60',
      )}
    >
      {name}
    </span>
    <span className="flex-1 truncate text-[var(--text-muted)]">{value || emptyLabel}</span>
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
