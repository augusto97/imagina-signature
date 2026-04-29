import { JSX } from 'preact';
import type { Block } from '@shared/types';
import { describeBlock, BLOCK_DESCRIPTORS } from './blocks';
import { __ } from '../i18n/helpers';

interface Props {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onToggleVisible: (id: string) => void;
}

export function LayersPanel({ blocks, selectedId, onSelect, onMove, onToggleVisible }: Props): JSX.Element {
  return (
    <div className="is-border-t is-border-slate-200">
      <header className="is-px-4 is-py-2 is-bg-slate-50 is-border-b is-border-slate-200">
        <h3 className="is-text-xs is-font-semibold is-uppercase is-tracking-wider is-text-slate-500">
          {__('Layers')}
        </h3>
      </header>
      <ul className="is-divide-y is-divide-slate-100">
        {blocks.length === 0 && (
          <li className="is-px-4 is-py-3 is-text-xs is-text-slate-400">{__('No blocks yet.')}</li>
        )}
        {blocks.map((block, index) => {
          const descriptor = BLOCK_DESCRIPTORS.find((b) => b.type === block.type);
          return (
            <li
              key={block.id}
              className={`is-px-3 is-py-2 is-flex is-items-center is-gap-2 is-cursor-pointer ${
                selectedId === block.id ? 'is-bg-brand-50' : 'hover:is-bg-slate-50'
              }`}
              onClick={() => onSelect(block.id)}
            >
              <span className="is-flex-1 is-min-w-0 is-truncate is-text-sm">
                <span className="is-text-slate-400 is-text-xs is-mr-1">{descriptor?.label()}</span>
                <span className="is-text-slate-900">{describeBlock(block)}</span>
              </span>
              <div className="is-flex is-gap-1 is-shrink-0">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleVisible(block.id);
                  }}
                  className="is-text-xs is-text-slate-500 hover:is-text-slate-800 is-bg-transparent is-border-0"
                  title={block.visible === false ? __('Show') : __('Hide')}
                >
                  {block.visible === false ? '○' : '●'}
                </button>
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMove(block.id, -1);
                  }}
                  className="is-text-xs is-text-slate-500 hover:is-text-slate-800 disabled:is-opacity-30 is-bg-transparent is-border-0"
                  title={__('Move up')}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === blocks.length - 1}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMove(block.id, 1);
                  }}
                  className="is-text-xs is-text-slate-500 hover:is-text-slate-800 disabled:is-opacity-30 is-bg-transparent is-border-0"
                  title={__('Move down')}
                >
                  ↓
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
