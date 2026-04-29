import { JSX } from 'preact';
import type { CanvasConfig } from '@shared/types';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { __ } from '../i18n/helpers';
import { SAFE_FONT_FAMILIES } from '@shared/constants';

interface Props {
  canvas: CanvasConfig;
  onChange: (canvas: CanvasConfig) => void;
}

export function CanvasPanel({ canvas, onChange }: Props): JSX.Element {
  return (
    <div className="is-p-4 is-border-b is-border-slate-200 is-flex is-flex-col is-gap-3">
      <h3 className="is-font-semibold is-text-slate-900">{__('Canvas')}</h3>
      <Input
        type="number"
        label={__('Width (px)')}
        min={320}
        max={800}
        value={canvas.width}
        onInput={(event) => onChange({ ...canvas, width: Number((event.target as HTMLInputElement).value) })}
      />
      <Select
        label={__('Font family')}
        value={canvas.font_family}
        onValueChange={(value) => onChange({ ...canvas, font_family: value })}
        options={SAFE_FONT_FAMILIES.map((font) => ({ value: font, label: font.split(',')[0] }))}
      />
      <Input
        type="number"
        label={__('Font size (px)')}
        value={canvas.font_size}
        onInput={(event) => onChange({ ...canvas, font_size: Number((event.target as HTMLInputElement).value) })}
      />
      <Input
        type="color"
        label={__('Text color')}
        value={canvas.text_color}
        onInput={(event) => onChange({ ...canvas, text_color: (event.target as HTMLInputElement).value })}
      />
      <Input
        type="color"
        label={__('Link color')}
        value={canvas.link_color}
        onInput={(event) => onChange({ ...canvas, link_color: (event.target as HTMLInputElement).value })}
      />
      <Input
        type="color"
        label={__('Background')}
        value={canvas.background_color}
        onInput={(event) => onChange({ ...canvas, background_color: (event.target as HTMLInputElement).value })}
      />
    </div>
  );
}
