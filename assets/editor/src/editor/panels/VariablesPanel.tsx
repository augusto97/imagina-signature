// Variables panel (CLAUDE.md §2 file layout / §6.1 schema.variables).
//
// Displays the {{name}} / {{role}} / {{email}} placeholders the schema
// holds and lets the user edit their values. Changes propagate to the
// preview via the SignatureSchema flowing back to the EditorPage state.

import { JSX } from 'preact';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { __ } from '../../i18n/helpers';

interface Props {
  variables: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}

export function VariablesPanel({ variables, onChange }: Props): JSX.Element {
  const entries = Object.entries(variables);

  const update = (key: string, value: string): void => {
    onChange({ ...variables, [key]: value });
  };
  const remove = (key: string): void => {
    const next = { ...variables };
    delete next[key];
    onChange(next);
  };
  const add = (): void => {
    const base = 'var';
    let i = entries.length + 1;
    let name = `${base}${i}`;
    while (variables[name] !== undefined) {
      i += 1;
      name = `${base}${i}`;
    }
    onChange({ ...variables, [name]: '' });
  };

  return (
    <div className="is-p-3 is-flex is-flex-col is-gap-2">
      <header className="is-flex is-items-center is-justify-between">
        <h3 className="is-font-semibold is-text-slate-900">{__('Variables')}</h3>
        <Button size="sm" variant="ghost" onClick={add}>
          + {__('Add')}
        </Button>
      </header>
      <p className="is-text-xs is-text-slate-500">
        {__('Reference these from any text block as {{name}}.')}
      </p>
      {entries.length === 0 && (
        <p className="is-text-sm is-text-slate-500">{__('No variables yet.')}</p>
      )}
      {entries.map(([key, value]) => (
        <div key={key} className="is-grid is-grid-cols-[1fr_2fr_auto] is-gap-1">
          <Input
            value={key}
            onInput={(event) => {
              const next = (event.target as HTMLInputElement).value;
              if (! next || next === key || variables[next] !== undefined) return;
              const map = { ...variables };
              map[next] = map[key];
              delete map[key];
              onChange(map);
            }}
          />
          <Input value={value} onInput={(event) => update(key, (event.target as HTMLInputElement).value)} />
          <Button size="sm" variant="ghost" onClick={() => remove(key)}>
            ×
          </Button>
        </div>
      ))}
    </div>
  );
}
