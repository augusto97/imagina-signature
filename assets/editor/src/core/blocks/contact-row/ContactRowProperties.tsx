import type { FC } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import type { ContactRowBlock } from '@/core/schema/blocks';
import { iconUrl } from '@/core/compiler/assets';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { generateId } from '@/utils/idGenerator';
import { PropertySection } from '@/editor/sidebar-right/sections/PropertySection';
import { ColorInput } from '@/editor/sidebar-right/inputs/ColorInput';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { FontFamilyInput } from '@/editor/sidebar-right/inputs/FontFamilyInput';
import { FontWeightInput } from '@/editor/sidebar-right/inputs/FontWeightInput';
import { PaddingInput } from '@/editor/sidebar-right/inputs/PaddingInput';
import { AlignButtons } from '../social-icons/AlignButtons';
import { IconButton } from '../social-icons/IconButton';
import { IconStylePicker } from '../social-icons/IconStylePicker';
import {
  CONTACT_ICON,
  CONTACT_ICON_SIZE_RANGE,
  CONTACT_ROW_GAP_RANGE,
  CONTACT_TYPES,
  SEPARATOR_PRESETS,
  contactHref,
  normalizeContactRow,
  shortLabel,
  toV2Patch,
  typeLabel,
  type ContactItem,
  type ContactType,
  type LabelMode,
  type NormalizedContactRow,
} from './normalize';
import { valuePlaceholder } from './placeholders';

interface Props {
  block: ContactRowBlock;
  onChange: (updates: Partial<ContactRowBlock>) => void;
}

const ZERO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_FONT = 'Arial, sans-serif';

/**
 * Contact panel: typed items (value, optional custom label, optional
 * link override — the automatic link is shown as the placeholder),
 * layout, icons, typography and spacing. Every edit stores the
 * complete v2 shape, converting a v1 block on its first change.
 */
export const ContactRowProperties: FC<Props> = ({ block, onChange }) => {
  const c = normalizeContactRow(block);
  const commit = (patch: Partial<NormalizedContactRow>) => onChange(toV2Patch({ ...c, ...patch }));
  const setItems = (items: ContactItem[]) => commit({ items });
  const setItem = (index: number, patch: Partial<ContactItem>) =>
    setItems(c.items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= c.items.length) return;
    const next = [...c.items];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setItems(next);
  };
  const add = () => {
    const used = new Set(c.items.map((i) => i.type));
    const type = CONTACT_TYPES.find((t) => t !== 'custom' && !used.has(t)) ?? 'custom';
    setItems([...c.items, { id: generateId('ci'), type, value: '' }]);
  };
  const setStyle = (patch: Partial<NormalizedContactRow['style']>) =>
    commit({ style: { ...c.style, ...patch } });

  const isPreset = (SEPARATOR_PRESETS as readonly string[]).includes(c.separator);
  const previewIcon = CONTACT_ICON[c.items[0]?.type ?? 'phone'];

  return (
    <>
      <PropertySection title={__('Contact details')}>
        <div className="space-y-2 text-xs">
          {c.items.length === 0 && (
            <p className="text-[var(--text-muted)]">{__('No items yet.')}</p>
          )}
          {c.items.map((item, i) => (
            <div
              key={item.id}
              className="space-y-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
            >
              <div className="flex items-center gap-1">
                <img
                  src={iconUrl(CONTACT_ICON[item.type], 'circle', 'brand')}
                  width={18}
                  height={18}
                  alt=""
                  draggable={false}
                  className="shrink-0"
                />
                <select
                  className="min-w-0 flex-1"
                  aria-label={__('Type')}
                  value={item.type}
                  onChange={(e) => setItem(i, { type: e.target.value as ContactType })}
                >
                  {CONTACT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {typeLabel(t)}
                    </option>
                  ))}
                </select>
                <IconButton label={__('Move up')} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp size={12} />
                </IconButton>
                <IconButton
                  label={__('Move down')}
                  disabled={i === c.items.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={12} />
                </IconButton>
                <IconButton
                  label={__('Remove')}
                  danger
                  onClick={() => setItems(c.items.filter((_, idx) => idx !== i))}
                >
                  <X size={12} />
                </IconButton>
              </div>
              {c.label_mode === 'custom' && (
                <input
                  type="text"
                  className="w-full"
                  aria-label={__('Label')}
                  placeholder={__('Label (e.g. Office)')}
                  value={item.label ?? ''}
                  onChange={(e) => setItem(i, { label: e.target.value })}
                />
              )}
              <input
                type="text"
                className="w-full"
                aria-label={typeLabel(item.type)}
                placeholder={valuePlaceholder(item.type)}
                value={item.value}
                onChange={(e) => setItem(i, { value: e.target.value })}
              />
              <input
                type="text"
                inputMode="url"
                className="w-full text-[11px]"
                aria-label={__('Link')}
                title={__('Leave empty to use the automatic link.')}
                placeholder={
                  contactHref({ ...item, href: undefined }) ||
                  (item.type === 'custom' ? __('Link (optional)') : __('No link'))
                }
                value={item.href ?? ''}
                onChange={(e) =>
                  setItem(i, { href: e.target.value === '' ? undefined : e.target.value })
                }
              />
            </div>
          ))}
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-[var(--border-strong)] px-2 py-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            onClick={add}
          >
            <Plus size={12} />
            {__('Add item')}
          </button>
        </div>
      </PropertySection>

      <PropertySection title={__('Layout')}>
        <div className="space-y-3 text-xs">
          <Segmented
            label={__('Layout')}
            value={c.layout}
            options={[
              { value: 'stacked', label: __('Stacked') },
              { value: 'inline', label: __('One line') },
            ]}
            onChange={(layout) => commit({ layout })}
          />
          {c.layout === 'inline' ? (
            <div>
              <span className="is-section-label mb-1 block">{__('Separator')}</span>
              <div className="flex gap-1">
                {SEPARATOR_PRESETS.map((sep) => (
                  <button
                    key={sep}
                    type="button"
                    onClick={() => commit({ separator: sep })}
                    className={cn(
                      'h-7 w-9 rounded border font-semibold',
                      c.separator === sep
                        ? 'border-[var(--border-selected)] bg-[var(--bg-selected)]'
                        : 'border-[var(--border-default)] hover:bg-[var(--bg-hover)]',
                    )}
                  >
                    {sep.trim()}
                  </button>
                ))}
                <input
                  type="text"
                  className={cn('min-w-0 flex-1', !isPreset && 'border-[var(--border-selected)]')}
                  aria-label={__('Custom separator')}
                  placeholder={__('Custom')}
                  maxLength={8}
                  value={isPreset ? '' : c.separator}
                  onChange={(e) => commit({ separator: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <DimensionInput
              label={__('Row spacing')}
              value={c.row_gap}
              min={CONTACT_ROW_GAP_RANGE.min}
              max={CONTACT_ROW_GAP_RANGE.max}
              onChange={(row_gap) => commit({ row_gap })}
            />
          )}
          <label className="block">
            <span className="is-section-label mb-1 block">{__('Labels')}</span>
            <select
              value={c.label_mode}
              onChange={(e) => commit({ label_mode: e.target.value as LabelMode })}
            >
              <option value="none">{__('None')}</option>
              <option value="short">
                {__('Short (%s)', [shortLabel('phone'), shortLabel('email')].join(' '))}
              </option>
              <option value="custom">{__('Custom per item')}</option>
            </select>
          </label>
          <AlignButtons
            value={c.style.text_align ?? 'left'}
            onChange={(text_align) => setStyle({ text_align })}
          />
        </div>
      </PropertySection>

      <PropertySection title={__('Icons')}>
        <div className="space-y-3 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={c.show_icons}
              onChange={(e) => commit({ show_icons: e.target.checked })}
            />
            <span>{__('Show icons')}</span>
          </label>
          {c.show_icons && (
            <>
              <IconStylePicker
                shape={c.icon_shape}
                tone={c.icon_tone}
                previewIcon={previewIcon}
                onChange={({ shape, tone }) =>
                  commit({
                    ...(shape ? { icon_shape: shape } : {}),
                    ...(tone ? { icon_tone: tone } : {}),
                  })
                }
              />
              <DimensionInput
                label={__('Icon size')}
                value={c.icon_size}
                min={CONTACT_ICON_SIZE_RANGE.min}
                max={CONTACT_ICON_SIZE_RANGE.max}
                onChange={(icon_size) => commit({ icon_size })}
              />
            </>
          )}
        </div>
      </PropertySection>

      <PropertySection title={__('Typography')}>
        <div className="space-y-3 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={c.style.font_family === undefined}
              onChange={(e) =>
                commit({
                  style: e.target.checked
                    ? withoutFontFamily(c.style)
                    : { ...c.style, font_family: DEFAULT_FONT },
                })
              }
            />
            <span>{__('Use the signature font')}</span>
          </label>
          {c.style.font_family !== undefined && (
            <FontFamilyInput
              label={__('Font')}
              value={c.style.font_family}
              onChange={(font_family) => setStyle({ font_family })}
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <DimensionInput
              label={__('Font size')}
              value={c.style.font_size}
              min={8}
              max={32}
              onChange={(font_size) => setStyle({ font_size })}
            />
            <FontWeightInput
              label={__('Weight')}
              value={c.style.font_weight}
              onChange={(font_weight) => setStyle({ font_weight })}
            />
          </div>
          <ColorInput
            label={__('Text color')}
            value={c.style.color}
            onChange={(color) => setStyle({ color })}
          />
          <ColorInput
            label={__('Link color')}
            value={c.link_color ?? c.style.color}
            onChange={(link_color) => commit({ link_color })}
          />
          {c.link_color !== undefined && (
            <button
              type="button"
              className="text-[11px] text-[var(--accent)] hover:underline"
              onClick={() => commit({ link_color: undefined })}
            >
              {__('Use the text color for links')}
            </button>
          )}
        </div>
      </PropertySection>

      <PropertySection title={__('Spacing')} defaultOpen={false}>
        <PaddingInput
          value={block.padding ?? ZERO_PADDING}
          onChange={(padding) => onChange({ ...toV2Patch(c), padding })}
        />
      </PropertySection>
    </>
  );
};

function withoutFontFamily(style: NormalizedContactRow['style']): NormalizedContactRow['style'] {
  const { font_family: _unused, ...rest } = style;
  return rest;
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <span className="is-section-label mb-1 block">{label}</span>
      <div
        className="grid rounded-md border border-[var(--border-default)] p-0.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
        role="radiogroup"
        aria-label={label}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-7 rounded transition-colors',
              value === o.value
                ? 'bg-[var(--bg-selected)] font-medium text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
