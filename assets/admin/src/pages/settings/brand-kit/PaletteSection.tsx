import type { FC } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@admin/components/Button';
import { __ } from '@admin/i18n';
import { Section } from '../_shared';

export const HEX_REGEX = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/;
export const MAX_PALETTE = 12;
const DEFAULT_NEW_COLOR = '#2563eb';

const STARTER_PALETTE = [
  '#2563eb', // accent blue
  '#16a34a', // success green
  '#d97706', // warning orange
  '#dc2626', // danger red
  '#0f172a', // primary text
];

interface Props {
  palette: string[];
  onChange: (next: string[]) => void;
  /** Reports a validation message (e.g. palette full). */
  onError: (message: string) => void;
}

/**
 * Brand palette — the site-wide swatches shown under every ColorInput
 * in the editor.
 *
 * 1.0.28 UX: "+ Add colour" appends a default swatch; every swatch is
 * itself an `<input type="color">` styled as a colour block (click to
 * open the OS picker); the trash button removes it. Saved together with
 * the rest of the brand kit.
 */
export const PaletteSection: FC<Props> = ({ palette, onChange, onError }) => {
  const addBlankColor = (): void => {
    if (palette.length >= MAX_PALETTE) {
      onError(__('Palette is full (max %s colours).', String(MAX_PALETTE)));
      return;
    }
    onChange([...palette, DEFAULT_NEW_COLOR]);
  };

  const updateColorAt = (index: number, hex: string): void => {
    const v = hex.trim().toLowerCase();
    if (!HEX_REGEX.test(v)) return;
    const next = [...palette];
    next[index] = v;
    onChange(next);
  };

  const removeColorAt = (index: number): void => {
    onChange(palette.filter((_, i) => i !== index));
  };

  return (
    <Section
      title={__('Brand palette')}
      description={__(
        'Up to %s colours that appear as quick-pick swatches under every ColorInput in the editor. Click a swatch to edit; click "+ Add colour" to append a new one.',
        String(MAX_PALETTE),
      )}
    >
      {palette.length === 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-3">
          <p className="flex-1 text-[12px] text-[var(--text-muted)]">
            {__('No swatches yet. Use a starter set or add your own below.')}
          </p>
          <Button size="sm" variant="secondary" onClick={() => onChange(STARTER_PALETTE)}>
            {__('Use starter palette')}
          </Button>
        </div>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {palette.map((color, index) => (
            <li
              // Index-keyed because identical colours are valid
              // mid-edit (a fresh swatch defaults to the same colour
              // every time); a value-keyed list would collapse two
              // entries into one React node.
              key={`${index}-${color}`}
              className="group relative flex items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] py-1 pl-1 pr-2 transition-colors hover:border-[var(--border-strong)]"
            >
              <label
                className="relative inline-flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded ring-1 ring-inset ring-black/10"
                style={{ backgroundColor: color }}
                title={__('Click to edit colour')}
              >
                <input
                  type="color"
                  value={HEX_REGEX.test(color) ? color : DEFAULT_NEW_COLOR}
                  onChange={(e) => updateColorAt(index, e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label={__('Edit colour %s', color)}
                />
              </label>
              <code className="font-mono text-[11.5px] uppercase text-[var(--text-secondary)]">
                {color}
              </code>
              <button
                type="button"
                onClick={() => removeColorAt(index)}
                title={__('Remove')}
                className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] opacity-0 hover:bg-red-50 hover:text-[var(--danger)] group-hover:opacity-100"
              >
                <Trash2 size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus size={12} />}
          onClick={addBlankColor}
          disabled={palette.length >= MAX_PALETTE}
        >
          {__('Add colour')}
        </Button>
        <span className="text-[11px] text-[var(--text-muted)]">
          {__('%s of %s used', String(palette.length), String(MAX_PALETTE))}
        </span>
      </div>
    </Section>
  );
};
