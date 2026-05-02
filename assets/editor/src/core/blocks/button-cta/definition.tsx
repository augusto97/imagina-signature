import type { FC } from 'react';
import { MousePointer2 } from 'lucide-react';
import type { ButtonCtaBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { ColorInput } from '@/editor/sidebar-right/inputs/ColorInput';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { PaddingInput } from '@/editor/sidebar-right/inputs/PaddingInput';
import { escapeAttr } from '@/core/compiler/compile';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';

const Renderer: FC<{ block: ButtonCtaBlock }> = ({ block }) => {
  const padding = block.padding;
  const td: React.CSSProperties = {
    padding: padding ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px` : '0',
  };

  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse' }}>
      <tbody>
        <tr>
          <td style={td}>
            <a
              href={block.href}
              style={{
                display: 'inline-block',
                padding: '12px 24px',
                background: block.background_color,
                color: block.text_color,
                textDecoration: 'none',
                borderRadius: `${block.border_radius}px`,
                fontFamily: 'Arial, sans-serif',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              {block.label}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
};

const Properties: FC<{ block: ButtonCtaBlock; onChange: (u: Partial<ButtonCtaBlock>) => void }> = ({
  block,
  onChange,
}) => (
  <div className="space-y-3 text-xs">
    <label className="block">
      <span className="mb-1 block text-[var(--text-secondary)]">{__('Label')}</span>
      <input
        type="text"
        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
        value={block.label}
        onChange={(e) => onChange({ label: e.target.value })}
      />
    </label>
    <label className="block">
      <span className="mb-1 block text-[var(--text-secondary)]">{__('Link URL')}</span>
      <input
        type="url"
        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
        value={block.href}
        onChange={(e) => onChange({ href: e.target.value })}
      />
    </label>
    <ColorInput label={__('Background')} value={block.background_color} onChange={(v) => onChange({ background_color: v })} />
    <ColorInput label={__('Text color')} value={block.text_color} onChange={(v) => onChange({ text_color: v })} />
    <DimensionInput label={__('Border radius')} value={block.border_radius} onChange={(v) => onChange({ border_radius: v })} min={0} max={32} />
    <PaddingInput value={block.padding ?? { top: 0, right: 0, bottom: 0, left: 0 }} onChange={(p) => onChange({ padding: p })} />
  </div>
);

function compile(block: ButtonCtaBlock, _ctx: CompileContext): string {
  const p = block.padding;
  const padding = p ? `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px` : '0';
  // Strict escapers — label was missing `"` and href was missing
  // `&`/`<`/`>`. Both are interpolated into attributes / text where
  // a malicious input could break out.
  const safeLabel = escapeAttr(block.label);
  const safeHref = escapeAttr(block.href);
  const safeBg = escapeAttr(block.background_color);
  const safeText = escapeAttr(block.text_color);

  // Bullet-proof button: Outlook desktop (uses Microsoft Word's render
  // engine, no border-radius / no padding on <a>) sees a VML <v:roundrect>
  // sized to ~200x40 with the same background/text. Every other client
  // ignores the conditional and renders the regular CSS <a> below.
  // Reference: https://www.caniemail.com (round buttons in Outlook).
  const vmlButton =
    `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:40px;v-text-anchor:middle;width:200px;" arcsize="${Math.round((block.border_radius / 40) * 100)}%" stroke="f" fillcolor="${safeBg}">
<w:anchorlock/>
<center style="color:${safeText};font-family:Arial,sans-serif;font-size:14px;font-weight:600;">${safeLabel}</center>
</v:roundrect>
<![endif]-->`;

  const cssButton = `<!--[if !mso]><!-- --><a href="${safeHref}" style="display:inline-block;padding:12px 24px;background:${safeBg};color:${safeText};text-decoration:none;border-radius:${block.border_radius}px;font-family:Arial,sans-serif;font-weight:600;font-size:14px">${safeLabel}</a><!--<![endif]-->`;

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="padding:${padding}">${vmlButton}${cssButton}</td></tr></table>`;
}

const definition: BlockDefinition<ButtonCtaBlock> = {
  type: 'button_cta',
  label: 'Button',
  description: 'Call-to-action button.',
  icon: MousePointer2,
  category: 'content',
  create: (): ButtonCtaBlock => ({
    id: generateId('btn'),
    type: 'button_cta',
    label: 'Book a call',
    href: 'https://',
    background_color: '#1d4ed8',
    text_color: '#ffffff',
    border_radius: 6,
    padding: { top: 8, right: 0, bottom: 8, left: 0 },
  }),
  Renderer,
  PropertiesPanel: Properties,
  compile,
};

registerBlock(definition);
export { definition as buttonCtaDefinition };
