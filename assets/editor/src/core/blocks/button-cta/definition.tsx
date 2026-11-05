import type { FC } from 'react';
import { MousePointer2 } from 'lucide-react';
import type { ButtonCtaBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { ColorInput } from '@/editor/sidebar-right/inputs/ColorInput';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { PaddingInput } from '@/editor/sidebar-right/inputs/PaddingInput';
import {
  attr,
  bgcolorAttr,
  escapeHtml,
  horizontalPadding,
  paddingCss,
  px,
  safeColor,
} from '@/core/compiler/css';
import { markerAttr, report } from '@/core/compiler/issues';
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
            {/* Same table-cell button the export ships to non-Outlook
                clients (Outlook desktop gets the VML version). */}
            <table
              role="presentation"
              cellPadding={0}
              cellSpacing={0}
              border={0}
              style={{ borderCollapse: 'separate' }}
            >
              <tbody>
                <tr>
                  <td
                    style={{
                      background: block.background_color,
                      borderRadius: `${block.border_radius}px`,
                      padding: '12px 24px',
                    }}
                  >
                    <a
                      href={block.href}
                      style={{
                        display: 'inline-block',
                        color: block.text_color,
                        textDecoration: 'none',
                        fontFamily: 'Arial, sans-serif',
                        fontWeight: 600,
                        fontSize: '14px',
                        lineHeight: '16px',
                      }}
                    >
                      {block.label}
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
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

const BUTTON_HEIGHT = 40;
const BUTTON_PADDING_X = 24;
const CHAR_WIDTH = 8.5; // ≈ average advance of 14px Arial semibold
const MIN_VML_WIDTH = 120;

/**
 * Pixel width the VML button needs for `label` (≈ chars × 8.5 +
 * horizontal padding, min 120) so long labels don't clip in Outlook.
 */
export function vmlButtonWidth(label: string): number {
  const chars = Array.from(label).length;
  return Math.max(MIN_VML_WIDTH, Math.round(chars * CHAR_WIDTH + BUTTON_PADDING_X * 2));
}

function compile(block: ButtonCtaBlock, ctx: CompileContext): string {
  const padding = paddingCss(block.padding);
  // Central serializer for every interpolated value — label / href
  // are user-controlled, colours are free-form schema strings.
  const safeLabel = escapeHtml(block.label);
  const safeHref = attr(block.href);
  const safeBg = safeColor(block.background_color, '#1d4ed8');
  const safeText = safeColor(block.text_color, '#ffffff');
  const radius = px(block.border_radius, 0, 999, 0);
  const marker = markerAttr(block);

  // Size the VML shape from the label as the recipient will see it
  // (variables resolved), capped to the width available here.
  const resolvedLabel = String(block.label ?? '').replace(
    /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
    (m, name: string) => ctx.variables[name] ?? m,
  );
  const available = Math.max(MIN_VML_WIDTH, Math.floor(ctx.availableWidth - horizontalPadding(block.padding)));
  const wanted = vmlButtonWidth(resolvedLabel);
  if (wanted > available) {
    report(
      ctx,
      'warning',
      __('Button label is too long to fit on one line in Outlook; shorten it or it may be cut off.'),
      block,
      'button-too-wide',
    );
  }
  const vmlWidth = Math.min(wanted, available);
  const arcsize = Math.min(50, Math.round((radius / BUTTON_HEIGHT) * 100));

  // Bullet-proof button: Outlook desktop (Word's render engine — no
  // border-radius, no padding on <a>) gets a VML <v:roundrect> sized to
  // the label. Every other client ignores that conditional and renders
  // the table-cell button below: the background colour, radius and
  // padding sit on a <td bgcolor>, so it still looks like a button where
  // inline-block / padding on <a> are dropped.
  // Reference: https://www.caniemail.com (round buttons in Outlook).
  const vmlButton = `<!--[if mso]>
<v:roundrect${marker} xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:${BUTTON_HEIGHT}px;v-text-anchor:middle;width:${vmlWidth}px;" arcsize="${arcsize}%" stroke="f" fillcolor="${safeBg}">
<w:anchorlock/>
<center style="color:${safeText};font-family:Arial,sans-serif;font-size:14px;font-weight:600;">${safeLabel}</center>
</v:roundrect>
<![endif]-->`;

  const cellStyle = `background-color:${safeBg};border-radius:${radius}px;padding:12px ${BUTTON_PADDING_X}px`;
  const linkStyle = `display:inline-block;color:${safeText};text-decoration:none;font-family:Arial,sans-serif;font-weight:600;font-size:14px;line-height:16px`;
  const cellButton = `<!--[if !mso]><!-- --><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td${bgcolorAttr(safeBg)} style="${cellStyle}"><a${marker} href="${safeHref}" style="${linkStyle}">${safeLabel}</a></td></tr></table><!--<![endif]-->`;

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="padding:${padding}">${vmlButton}${cellButton}</td></tr></table>`;
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
    label: __('Book a call'),
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
