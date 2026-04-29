import { JSX } from 'preact';
import { BLOCK_DESCRIPTORS } from './blocks';
import { __ } from '../i18n/helpers';

interface Props {
  onAdd: (type: string) => void;
}

export function BlocksPanel({ onAdd }: Props): JSX.Element {
  return (
    <aside className="is-w-56 is-bg-white is-border-r is-border-slate-200 is-overflow-y-auto">
      <header className="is-px-4 is-py-3 is-border-b is-border-slate-200">
        <h3 className="is-font-semibold is-text-slate-900">{__('Blocks')}</h3>
      </header>
      <div className="is-grid is-grid-cols-2 is-gap-2 is-p-3">
        {BLOCK_DESCRIPTORS.map((descriptor) => (
          <button
            key={descriptor.type}
            type="button"
            onClick={() => onAdd(descriptor.type)}
            className="is-bg-slate-50 hover:is-bg-brand-50 is-border is-border-slate-200 hover:is-border-brand-300 is-rounded is-p-2 is-text-left is-text-xs is-flex is-flex-col is-gap-1 is-cursor-pointer"
          >
            <span className="is-font-medium is-text-slate-800">{descriptor.label()}</span>
            <span className="is-text-slate-500">{descriptor.description()}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
