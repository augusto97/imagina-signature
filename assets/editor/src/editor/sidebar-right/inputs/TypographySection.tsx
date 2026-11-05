import type { FC, ReactNode } from 'react';
import { Italic } from 'lucide-react';
import type { FontWeight, TextStyle, TextTransform } from '@/core/schema/styles';
import {
  LETTER_SPACING_MAX,
  LETTER_SPACING_MIN,
  withStyleField,
  type InheritedTypography,
} from '@/core/blocks/text/typography';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { PropertySection } from '../sections/PropertySection';
import { AlignInput } from './AlignInput';
import { ColorInput } from './ColorInput';
import { FontFamilyInput } from './FontFamilyInput';
import { FontWeightInput } from './FontWeightInput';
import { OptionalNumberInput } from './OptionalNumberInput';
import { SegmentedInput } from './SegmentedInput';

/** Every field the section can edit; pass the ones to hide in `hide`. */
export type TypographyField =
  | 'font_family'
  | 'font_size'
  | 'font_weight'
  | 'color'
  | 'line_height'
  | 'letter_spacing'
  | 'text_transform'
  | 'font_style'
  | 'text_align';

export interface TypographySectionProps {
  /** The block's current style (unset family / size / colour = inherited). */
  value: TextStyle;
  /**
   * Receives the complete next style. Fields reset to "inherit" are
   * removed from the object (never stored as `undefined`).
   */
  onChange: (next: TextStyle) => void;
  /**
   * What unset fields resolve to — normally
   * `inheritedTypography(canvas, BLOCK_DEFAULTS)` — shown as
   * placeholders / the "Canvas default (…)" option.
   */
  inherited: InheritedTypography;
  /** Fields not offered for this block (e.g. `['color']` for a button). */
  hide?: TypographyField[];
  /** Font-size range in px. Default 8–72. */
  sizeRange?: [number, number];
  /** Section title. Default "Typography". */
  title?: string;
  defaultOpen?: boolean;
  /** Render the controls without the collapsible section wrapper. */
  bare?: boolean;
}

const TRANSFORMS: TextTransform[] = ['none', 'uppercase', 'capitalize'];

/**
 * Shared typography inspector for text-like blocks (text, heading,
 * disclaimer, button): font family (web-safe + "Canvas default"),
 * size, weight, colour (brand swatches), line height, letter spacing,
 * text transform, italic and alignment.
 *
 * Family, size and colour can be reset to the canvas default; the
 * inherited value is displayed while unset.
 */
export const TypographySection: FC<TypographySectionProps> = ({
  value,
  onChange,
  inherited,
  hide = [],
  sizeRange = [8, 72],
  title,
  defaultOpen = true,
  bare = false,
}) => {
  const shown = (field: TypographyField) => !hide.includes(field);
  const set = <K extends keyof TextStyle>(key: K, next: TextStyle[K] | undefined) => {
    onChange(withStyleField(value, key, next));
  };

  const transform = value.text_transform ?? 'none';
  const italic = value.font_style === 'italic';

  const body = (
    <div className="space-y-2.5">
      {shown('font_family') && (
        <FontFamilyInput
          label={__('Font')}
          inheritable
          value={value.font_family}
          inheritedValue={inherited.font_family}
          onChange={(v) => set('font_family', v)}
        />
      )}

      {(shown('font_size') || shown('font_weight')) && (
        <div className="grid grid-cols-2 gap-2">
          {shown('font_size') && (
            <OptionalNumberInput
              label={__('Size')}
              value={value.font_size}
              placeholder={inherited.font_size}
              onChange={(v) => set('font_size', v)}
              min={sizeRange[0]}
              max={sizeRange[1]}
              unit="px"
              resetLabel={__('Use canvas default')}
            />
          )}
          {shown('font_weight') && (
            <FontWeightInput
              label={__('Weight')}
              value={(value.font_weight ?? inherited.font_weight) as FontWeight}
              onChange={(v) => set('font_weight', v)}
            />
          )}
        </div>
      )}

      {shown('color') && (
        <ColorInput
          label={__('Color')}
          value={value.color ?? inherited.color}
          onChange={(v) => set('color', v)}
          onReset={value.color !== undefined ? () => set('color', undefined) : undefined}
          resetLabel={__('Use canvas default')}
        />
      )}

      {(shown('line_height') || shown('letter_spacing')) && (
        <div className="grid grid-cols-2 gap-2">
          {shown('line_height') && (
            <OptionalNumberInput
              label={__('Line height')}
              value={value.line_height}
              placeholder={inherited.line_height}
              onChange={(v) => set('line_height', v)}
              min={0.8}
              max={3}
              step={0.05}
              unit="×"
            />
          )}
          {shown('letter_spacing') && (
            <OptionalNumberInput
              label={__('Letter spacing')}
              value={value.letter_spacing}
              placeholder={0}
              onChange={(v) => set('letter_spacing', v === 0 ? undefined : v)}
              min={LETTER_SPACING_MIN}
              max={LETTER_SPACING_MAX}
              step={0.5}
              unit="px"
            />
          )}
        </div>
      )}

      {(shown('text_transform') || shown('font_style')) && (
        <div className="flex items-end gap-2">
          {shown('text_transform') && (
            <div className="flex-1">
              <SegmentedInput<TextTransform>
                label={__('Case')}
                value={transform}
                onChange={(v) => set('text_transform', v === 'none' ? undefined : v)}
                options={TRANSFORMS.map((t) => ({
                  value: t,
                  label: transformLabel(t),
                  content: transformGlyph(t),
                }))}
              />
            </div>
          )}
          {shown('font_style') && (
            <button
              type="button"
              aria-pressed={italic}
              title={__('Italic')}
              aria-label={__('Italic')}
              onClick={() => set('font_style', italic ? undefined : 'italic')}
              className={cn(
                'flex h-7 w-8 shrink-0 items-center justify-center rounded border transition-colors',
                italic
                  ? 'border-[var(--accent)] bg-[var(--bg-selected)] text-[var(--accent)]'
                  : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
              )}
            >
              <Italic size={13} />
            </button>
          )}
        </div>
      )}

      {shown('text_align') && (
        <AlignInput value={value.text_align} onChange={(v) => set('text_align', v)} />
      )}
    </div>
  );

  if (bare) return body;
  return (
    <PropertySection title={title ?? __('Typography')} defaultOpen={defaultOpen}>
      {body}
    </PropertySection>
  );
};

function transformLabel(t: TextTransform): string {
  if (t === 'uppercase') return __('Uppercase');
  if (t === 'capitalize') return __('Capitalize');
  return __('No case change');
}

function transformGlyph(t: TextTransform): ReactNode {
  // Typographic samples, not words — i18n-ignore
  if (t === 'uppercase') return 'AA';
  if (t === 'capitalize') return 'Aa';
  return '—';
}
