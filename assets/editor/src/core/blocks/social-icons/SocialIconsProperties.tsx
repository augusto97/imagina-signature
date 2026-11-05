import { useState, type FC } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Plus, X } from 'lucide-react';
import type { SocialIconsBlock } from '@/core/schema/blocks';
import { iconUrl } from '@/core/compiler/assets';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { generateId } from '@/utils/idGenerator';
import { PropertySection } from '@/editor/sidebar-right/sections/PropertySection';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { PaddingInput } from '@/editor/sidebar-right/inputs/PaddingInput';
import { AlignButtons } from './AlignButtons';
import { IconButton } from './IconButton';
import { IconStylePicker } from './IconStylePicker';
import { SOCIAL_NETWORKS, iconTitle } from './iconSet';
import {
  SOCIAL_SIZE_RANGE,
  SOCIAL_SPACING_RANGE,
  normalizeSocialIcons,
  toV2Patch,
  type NormalizedSocialIcons,
  type SocialItem,
} from './normalize';
import { urlPlaceholder } from './placeholders';

interface Props {
  block: SocialIconsBlock;
  onChange: (updates: Partial<SocialIconsBlock>) => void;
}

const ZERO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Social icons panel: the list of networks (picker with the real
 * icons, URL with a per-network example, reorder / remove), then icon
 * style, size, spacing, alignment and padding. Every edit stores the
 * complete v2 shape, which converts a v1 block on its first change.
 */
export const SocialIconsProperties: FC<Props> = ({ block, onChange }) => {
  const s = normalizeSocialIcons(block);
  const [openPicker, setOpenPicker] = useState<string | null>(null);

  const commit = (patch: Partial<NormalizedSocialIcons>) => onChange(toV2Patch({ ...s, ...patch }));
  const setItems = (items: SocialItem[]) => commit({ items });
  const setItem = (index: number, patch: Partial<SocialItem>) =>
    setItems(s.items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= s.items.length) return;
    const next = [...s.items];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setItems(next);
  };
  const add = () => {
    const used = new Set(s.items.map((i) => i.network));
    const network = SOCIAL_NETWORKS.find((n) => !used.has(n)) ?? 'website';
    const id = generateId('sn');
    setItems([...s.items, { id, network, url: '' }]);
    setOpenPicker(id);
  };

  const previewIcon = s.items[0]?.network ?? 'linkedin';

  return (
    <>
      <PropertySection title={__('Networks')}>
        <div className="space-y-2 text-xs">
          {s.items.length === 0 && (
            <p className="text-[var(--text-muted)]">{__('No networks yet.')}</p>
          )}
          {s.items.map((item, i) => (
            <div
              key={item.id}
              className="rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
            >
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-[var(--bg-hover)]"
                  aria-expanded={openPicker === item.id}
                  onClick={() => setOpenPicker(openPicker === item.id ? null : item.id)}
                  title={__('Change network')}
                >
                  <img
                    src={iconUrl(item.network, 'circle', 'brand')}
                    width={18}
                    height={18}
                    alt=""
                    draggable={false}
                  />
                  <span className="truncate font-medium text-[var(--text-primary)]">
                    {iconTitle(item.network)}
                  </span>
                  <ChevronDown size={12} className="ml-auto shrink-0 text-[var(--text-muted)]" />
                </button>
                <IconButton label={__('Move up')} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp size={12} />
                </IconButton>
                <IconButton
                  label={__('Move down')}
                  disabled={i === s.items.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={12} />
                </IconButton>
                <IconButton
                  label={__('Remove')}
                  danger
                  onClick={() => setItems(s.items.filter((_, idx) => idx !== i))}
                >
                  <X size={12} />
                </IconButton>
              </div>
              {openPicker === item.id && (
                <NetworkGrid
                  value={item.network}
                  onPick={(network) => {
                    setItem(i, { network });
                    setOpenPicker(null);
                  }}
                />
              )}
              <input
                type="text"
                inputMode="url"
                className="mt-1 w-full"
                aria-label={__('%s link', iconTitle(item.network))}
                placeholder={urlPlaceholder(item.network)}
                value={item.url}
                onChange={(e) => setItem(i, { url: e.target.value })}
              />
            </div>
          ))}
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-[var(--border-strong)] px-2 py-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            onClick={add}
          >
            <Plus size={12} />
            {__('Add network')}
          </button>
        </div>
      </PropertySection>

      <PropertySection title={__('Icons')}>
        <div className="space-y-3 text-xs">
          <IconStylePicker
            shape={s.shape}
            tone={s.tone}
            previewIcon={previewIcon}
            onChange={(patch) => commit(patch)}
          />
          <div className="grid grid-cols-2 gap-2">
            <DimensionInput
              label={__('Size')}
              value={s.size}
              min={SOCIAL_SIZE_RANGE.min}
              max={SOCIAL_SIZE_RANGE.max}
              onChange={(v) => commit({ size: v })}
            />
            <DimensionInput
              label={__('Spacing')}
              value={s.spacing}
              min={SOCIAL_SPACING_RANGE.min}
              max={SOCIAL_SPACING_RANGE.max}
              onChange={(v) => commit({ spacing: v })}
            />
          </div>
          <AlignButtons value={s.align} onChange={(align) => commit({ align })} />
        </div>
      </PropertySection>

      <PropertySection title={__('Spacing')} defaultOpen={false}>
        <PaddingInput
          value={block.padding ?? ZERO_PADDING}
          onChange={(padding) => onChange({ ...toV2Patch(s), padding })}
        />
      </PropertySection>
    </>
  );
};

const NetworkGrid: FC<{ value: string; onPick: (network: string) => void }> = ({
  value,
  onPick,
}) => (
  <div className="mt-1 grid grid-cols-6 gap-1 rounded-md bg-[var(--bg-panel-soft)] p-1.5">
    {SOCIAL_NETWORKS.map((network) => (
      <button
        key={network}
        type="button"
        title={iconTitle(network)}
        aria-label={iconTitle(network)}
        aria-pressed={network === value}
        onClick={() => onPick(network)}
        className={cn(
          'flex h-8 items-center justify-center rounded transition-colors',
          network === value
            ? 'bg-[var(--bg-selected)] ring-1 ring-[var(--border-selected)]'
            : 'hover:bg-[var(--bg-panel)]',
        )}
      >
        <img
          src={iconUrl(network, 'circle', 'brand')}
          width={22}
          height={22}
          alt=""
          draggable={false}
        />
      </button>
    ))}
  </div>
);
