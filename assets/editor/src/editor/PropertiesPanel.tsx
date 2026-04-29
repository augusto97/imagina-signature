import { JSX } from 'preact';
import type { Block, ButtonCtaBlock, ContactRowBlock, DisclaimerBlock, DividerBlock, ImageBlock, SocialIconsBlock, SpacerBlock, TextBlock, TextStackBlock } from '@shared/types';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { __ } from '../i18n/helpers';
import { ImageUploader } from './ImageUploader';

interface Props {
  block: Block;
  onChange: (block: Block) => void;
  onDelete: () => void;
}

export function PropertiesPanel({ block, onChange, onDelete }: Props): JSX.Element {
  return (
    <aside className="is-w-72 is-bg-white is-border-l is-border-slate-200 is-overflow-y-auto is-flex is-flex-col">
      <header className="is-px-4 is-py-3 is-border-b is-border-slate-200 is-flex is-items-center is-justify-between">
        <h3 className="is-font-semibold is-text-slate-900">{__('Properties')}</h3>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          {__('Delete')}
        </Button>
      </header>
      <div className="is-p-4 is-flex is-flex-col is-gap-3">
        {block.type === 'text' && <TextEditor block={block} onChange={onChange} />}
        {block.type === 'text_stack' && <TextStackEditor block={block} onChange={onChange} />}
        {block.type === 'image' && <ImageEditor block={block} onChange={onChange} />}
        {block.type === 'divider' && <DividerEditor block={block} onChange={onChange} />}
        {block.type === 'spacer' && <SpacerEditor block={block} onChange={onChange} />}
        {block.type === 'social_icons' && <SocialEditor block={block} onChange={onChange} />}
        {block.type === 'contact_row' && <ContactEditor block={block} onChange={onChange} />}
        {block.type === 'button_cta' && <CtaEditor block={block} onChange={onChange} />}
        {block.type === 'disclaimer' && <DisclaimerEditor block={block} onChange={onChange} />}
      </div>
    </aside>
  );
}

function TextEditor({ block, onChange }: { block: TextBlock; onChange: (b: Block) => void }): JSX.Element {
  return (
    <>
      <Input
        label={__('Content')}
        value={block.content}
        onInput={(event) => onChange({ ...block, content: (event.target as HTMLInputElement).value })}
      />
      <Input
        type="number"
        label={__('Font size (px)')}
        value={block.style.font_size ?? 13}
        onInput={(event) =>
          onChange({
            ...block,
            style: { ...block.style, font_size: Number((event.target as HTMLInputElement).value) },
          })
        }
      />
      <Input
        label={__('Color')}
        type="color"
        value={block.style.color ?? '#0f172a'}
        onInput={(event) =>
          onChange({ ...block, style: { ...block.style, color: (event.target as HTMLInputElement).value } })
        }
      />
      <Select
        label={__('Weight')}
        value={String(block.style.font_weight ?? 400)}
        onValueChange={(value) =>
          onChange({ ...block, style: { ...block.style, font_weight: Number(value) as TextBlock['style']['font_weight'] } })
        }
        options={[
          { value: '400', label: __('Regular') },
          { value: '500', label: __('Medium') },
          { value: '600', label: __('Semibold') },
          { value: '700', label: __('Bold') },
        ]}
      />
      <Select
        label={__('Align')}
        value={block.style.text_align ?? 'left'}
        onValueChange={(value) => onChange({ ...block, style: { ...block.style, text_align: value as 'left' | 'center' | 'right' } })}
        options={[
          { value: 'left', label: __('Left') },
          { value: 'center', label: __('Center') },
          { value: 'right', label: __('Right') },
        ]}
      />
    </>
  );
}

function TextStackEditor({ block, onChange }: { block: TextStackBlock; onChange: (b: Block) => void }): JSX.Element {
  const updateChild = (index: number, content: string): void => {
    const children = block.children.slice();
    children[index] = { ...children[index], content };
    onChange({ ...block, children });
  };
  return (
    <>
      <Input
        type="number"
        label={__('Spacing (px)')}
        value={block.spacing}
        onInput={(event) => onChange({ ...block, spacing: Number((event.target as HTMLInputElement).value) })}
      />
      <div className="is-flex is-flex-col is-gap-2">
        {block.children.map((child, index) => (
          <Input
            key={child.id}
            label={index === 0 ? __('Lines') : undefined}
            value={child.content}
            onInput={(event) => updateChild(index, (event.target as HTMLInputElement).value)}
          />
        ))}
      </div>
    </>
  );
}

function ImageEditor({ block, onChange }: { block: ImageBlock; onChange: (b: Block) => void }): JSX.Element {
  return (
    <>
      <ImageUploader
        currentUrl={block.src}
        onUploaded={(asset) => onChange({ ...block, src: asset.public_url, asset_id: asset.id, width: block.width || asset.width || 120 })}
      />
      <Input
        label={__('Alt text')}
        value={block.alt}
        onInput={(event) => onChange({ ...block, alt: (event.target as HTMLInputElement).value })}
      />
      <Input
        type="number"
        label={__('Width (px)')}
        value={block.width}
        onInput={(event) => onChange({ ...block, width: Number((event.target as HTMLInputElement).value) })}
      />
      <Select
        label={__('Shape')}
        value={block.border_radius ?? '0'}
        onValueChange={(value) => onChange({ ...block, border_radius: value })}
        options={[
          { value: '0', label: __('Square') },
          { value: '8px', label: __('Rounded') },
          { value: '50%', label: __('Circle') },
        ]}
      />
      <Input
        label={__('Link (optional)')}
        type="url"
        value={block.link ?? ''}
        onInput={(event) => {
          const value = (event.target as HTMLInputElement).value;
          onChange({ ...block, link: value || undefined });
        }}
      />
    </>
  );
}

function DividerEditor({ block, onChange }: { block: DividerBlock; onChange: (b: Block) => void }): JSX.Element {
  return (
    <>
      <Input
        type="color"
        label={__('Color')}
        value={block.color}
        onInput={(event) => onChange({ ...block, color: (event.target as HTMLInputElement).value })}
      />
      <Input
        type="number"
        label={__('Thickness (px)')}
        value={block.thickness}
        onInput={(event) => onChange({ ...block, thickness: Number((event.target as HTMLInputElement).value) })}
      />
      <Select
        label={__('Style')}
        value={block.style}
        onValueChange={(value) => onChange({ ...block, style: value as DividerBlock['style'] })}
        options={[
          { value: 'solid', label: __('Solid') },
          { value: 'dashed', label: __('Dashed') },
          { value: 'dotted', label: __('Dotted') },
        ]}
      />
    </>
  );
}

function SpacerEditor({ block, onChange }: { block: SpacerBlock; onChange: (b: Block) => void }): JSX.Element {
  return (
    <Input
      type="number"
      label={__('Height (px)')}
      value={block.height}
      onInput={(event) => onChange({ ...block, height: Number((event.target as HTMLInputElement).value) })}
    />
  );
}

function SocialEditor({ block, onChange }: { block: SocialIconsBlock; onChange: (b: Block) => void }): JSX.Element {
  const update = (index: number, key: 'name' | 'url', value: string): void => {
    const networks = block.networks.slice();
    networks[index] = { ...networks[index], [key]: value };
    onChange({ ...block, networks });
  };
  const remove = (index: number): void => {
    const networks = block.networks.slice();
    networks.splice(index, 1);
    onChange({ ...block, networks });
  };
  const add = (): void => {
    onChange({ ...block, networks: [...block.networks, { name: 'linkedin', url: '' }] });
  };

  return (
    <>
      <Input
        type="number"
        label={__('Icon size (px)')}
        value={block.size}
        onInput={(event) => onChange({ ...block, size: Number((event.target as HTMLInputElement).value) })}
      />
      <Input
        type="color"
        label={__('Icon color')}
        value={block.color}
        onInput={(event) => onChange({ ...block, color: (event.target as HTMLInputElement).value })}
      />
      <Select
        label={__('Icon style')}
        value={block.style}
        onValueChange={(value) => onChange({ ...block, style: value as SocialIconsBlock['style'] })}
        options={[
          { value: 'flat', label: __('Flat') },
          { value: 'rounded', label: __('Rounded') },
          { value: 'rounded_filled', label: __('Rounded filled') },
          { value: 'circle', label: __('Circle') },
          { value: 'circle_filled', label: __('Circle filled') },
        ]}
      />
      <div>
        <span className="is-block is-mb-1 is-font-medium is-text-slate-700 is-text-sm">{__('Networks')}</span>
        <div className="is-flex is-flex-col is-gap-2">
          {block.networks.map((network, index) => (
            <div key={index} className="is-grid is-grid-cols-[1fr_2fr_auto] is-gap-1">
              <Select
                value={network.name}
                onValueChange={(value) => update(index, 'name', value)}
                options={[
                  { value: 'linkedin', label: 'LinkedIn' },
                  { value: 'twitter', label: 'Twitter / X' },
                  { value: 'facebook', label: 'Facebook' },
                  { value: 'instagram', label: 'Instagram' },
                  { value: 'youtube', label: 'YouTube' },
                  { value: 'github', label: 'GitHub' },
                  { value: 'tiktok', label: 'TikTok' },
                  { value: 'behance', label: 'Behance' },
                  { value: 'dribbble', label: 'Dribbble' },
                ]}
              />
              <Input
                value={network.url}
                onInput={(event) => update(index, 'url', (event.target as HTMLInputElement).value)}
                placeholder="https://"
              />
              <Button size="sm" variant="ghost" onClick={() => remove(index)}>
                ×
              </Button>
            </div>
          ))}
          <Button size="sm" variant="secondary" onClick={add}>
            {__('Add network')}
          </Button>
        </div>
      </div>
    </>
  );
}

function ContactEditor({ block, onChange }: { block: ContactRowBlock; onChange: (b: Block) => void }): JSX.Element {
  const update = (index: number, key: 'type' | 'value', value: string): void => {
    const items = block.items.slice();
    items[index] = { ...items[index], [key]: value };
    onChange({ ...block, items });
  };
  const remove = (index: number): void => {
    const items = block.items.slice();
    items.splice(index, 1);
    onChange({ ...block, items });
  };
  return (
    <>
      <Select
        label={__('Layout')}
        value={block.layout}
        onValueChange={(value) => onChange({ ...block, layout: value as 'inline' | 'stacked' })}
        options={[
          { value: 'stacked', label: __('Stacked') },
          { value: 'inline', label: __('Inline') },
        ]}
      />
      <div>
        <span className="is-block is-mb-1 is-font-medium is-text-slate-700 is-text-sm">{__('Items')}</span>
        <div className="is-flex is-flex-col is-gap-2">
          {block.items.map((item, index) => (
            <div key={index} className="is-grid is-grid-cols-[1fr_2fr_auto] is-gap-1">
              <Select
                value={item.type}
                onValueChange={(value) => update(index, 'type', value)}
                options={[
                  { value: 'email', label: __('Email') },
                  { value: 'phone', label: __('Phone') },
                  { value: 'website', label: __('Website') },
                  { value: 'address', label: __('Address') },
                  { value: 'custom', label: __('Custom') },
                ]}
              />
              <Input
                value={item.value}
                onInput={(event) => update(index, 'value', (event.target as HTMLInputElement).value)}
              />
              <Button size="sm" variant="ghost" onClick={() => remove(index)}>
                ×
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onChange({ ...block, items: [...block.items, { type: 'email', value: '' }] })}
          >
            {__('Add item')}
          </Button>
        </div>
      </div>
    </>
  );
}

function CtaEditor({ block, onChange }: { block: ButtonCtaBlock; onChange: (b: Block) => void }): JSX.Element {
  return (
    <>
      <Input
        label={__('Text')}
        value={block.text}
        onInput={(event) => onChange({ ...block, text: (event.target as HTMLInputElement).value })}
      />
      <Input
        label={__('URL')}
        type="url"
        value={block.url}
        onInput={(event) => onChange({ ...block, url: (event.target as HTMLInputElement).value })}
      />
      <Input
        type="color"
        label={__('Background')}
        value={block.background_color}
        onInput={(event) => onChange({ ...block, background_color: (event.target as HTMLInputElement).value })}
      />
      <Input
        type="color"
        label={__('Text color')}
        value={block.text_color}
        onInput={(event) => onChange({ ...block, text_color: (event.target as HTMLInputElement).value })}
      />
      <Input
        label={__('Border radius')}
        value={block.border_radius}
        onInput={(event) => onChange({ ...block, border_radius: (event.target as HTMLInputElement).value })}
      />
    </>
  );
}

function DisclaimerEditor({ block, onChange }: { block: DisclaimerBlock; onChange: (b: Block) => void }): JSX.Element {
  return (
    <>
      <label className="is-block is-text-sm">
        <span className="is-block is-mb-1 is-font-medium is-text-slate-700">{__('Content')}</span>
        <textarea
          rows={4}
          className="is-w-full is-px-3 is-py-2 is-border is-rounded is-border-slate-300 focus:is-outline-none focus:is-ring-2 focus:is-ring-brand-500"
          value={block.content}
          onInput={(event) => onChange({ ...block, content: (event.target as HTMLTextAreaElement).value })}
        />
      </label>
      <Input
        type="number"
        label={__('Font size (px)')}
        value={block.style.font_size ?? 10}
        onInput={(event) =>
          onChange({ ...block, style: { ...block.style, font_size: Number((event.target as HTMLInputElement).value) } })
        }
      />
    </>
  );
}
