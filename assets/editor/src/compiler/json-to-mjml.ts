// JSON schema → MJML compiler.
//
// Each block type is rendered as an `<mj-section><mj-column>...` group.
// MJML handles the tedious cross-client compatibility (Outlook VML,
// Gmail clipping headers, etc.).

import type {
  Block,
  ButtonCtaBlock,
  ContactRowBlock,
  ContainerBlock,
  DisclaimerBlock,
  DividerBlock,
  ImageBlock,
  SignatureSchema,
  SocialIconsBlock,
  SpacerBlock,
  TextBlock,
  TextStackBlock,
  TextStyle,
} from '@shared/types';
import { escapeAttr, escapeHtml } from './escape';
import { interpolate } from './variables';

function styleAttrs(style: TextStyle | undefined): string {
  if (!style) return '';
  const attrs: string[] = [];
  if (style.font_family) attrs.push(`font-family="${escapeAttr(style.font_family)}"`);
  if (style.font_size) attrs.push(`font-size="${escapeAttr(style.font_size)}px"`);
  if (style.font_weight) attrs.push(`font-weight="${escapeAttr(style.font_weight)}"`);
  if (style.font_style) attrs.push(`font-style="${escapeAttr(style.font_style)}"`);
  if (style.color) attrs.push(`color="${escapeAttr(style.color)}"`);
  if (style.text_align) attrs.push(`align="${escapeAttr(style.text_align)}"`);
  if (style.text_decoration) attrs.push(`text-decoration="${escapeAttr(style.text_decoration)}"`);
  if (style.line_height) attrs.push(`line-height="${escapeAttr(style.line_height)}"`);
  if (style.letter_spacing) attrs.push(`letter-spacing="${escapeAttr(style.letter_spacing)}px"`);
  return attrs.join(' ');
}

function paddingAttr(block: Block): string {
  if (!block.padding) return '';
  const p = block.padding;
  return `padding="${p.top}px ${p.right}px ${p.bottom}px ${p.left}px"`;
}

function renderText(block: TextBlock, variables: Record<string, string>): string {
  const html = interpolate(block.content ?? '', variables);
  return `<mj-text ${styleAttrs(block.style)} ${paddingAttr(block)}>${html}</mj-text>`;
}

function renderTextStack(block: TextStackBlock, variables: Record<string, string>): string {
  return block.children
    .map((child, i) => {
      const margin = i > 0 ? `padding-top="${block.spacing}px"` : '';
      return `<mj-text ${styleAttrs(child.style)} ${margin}>${interpolate(child.content ?? '', variables)}</mj-text>`;
    })
    .join('');
}

function renderImage(block: ImageBlock): string {
  const attrs: string[] = [
    `src="${escapeAttr(block.src)}"`,
    `alt="${escapeAttr(block.alt)}"`,
    `width="${escapeAttr(block.width)}px"`,
  ];
  if (block.height) attrs.push(`height="${escapeAttr(block.height)}px"`);
  if (block.border_radius) attrs.push(`border-radius="${escapeAttr(block.border_radius)}"`);
  if (block.link) attrs.push(`href="${escapeAttr(block.link)}"`);
  if (block.border) {
    attrs.push(`border="${block.border.width}px ${block.border.style} ${escapeAttr(block.border.color)}"`);
  }
  return `<mj-image ${attrs.join(' ')} ${paddingAttr(block)} />`;
}

function renderDivider(block: DividerBlock): string {
  return `<mj-divider border-color="${escapeAttr(block.color)}" border-width="${escapeAttr(block.thickness)}px" border-style="${escapeAttr(block.style)}" ${paddingAttr(block)} />`;
}

function renderSpacer(block: SpacerBlock): string {
  return `<mj-spacer height="${escapeAttr(block.height)}px" />`;
}

function renderSocialIcons(block: SocialIconsBlock): string {
  const innerPadding = `inner-padding="${block.gap / 2}px ${block.gap / 2}px"`;
  const items = block.networks
    .map(
      (n) =>
        `<mj-social-element name="${escapeAttr(n.name)}" href="${escapeAttr(n.url)}" background-color="${escapeAttr(block.background_color ?? 'transparent')}"></mj-social-element>`,
    )
    .join('');
  return `<mj-social ${innerPadding} icon-size="${escapeAttr(block.size)}px" mode="horizontal" ${paddingAttr(block)}>${items}</mj-social>`;
}

function renderContactRow(block: ContactRowBlock, variables: Record<string, string>): string {
  const lines = block.items
    .map((item) => {
      const value = interpolate(item.value, variables);
      const label = item.label ? `<strong>${escapeHtml(item.label)}:</strong> ` : '';
      switch (item.type) {
        case 'email':
          return `${label}<a href="mailto:${escapeAttr(value)}">${escapeHtml(value)}</a>`;
        case 'phone':
          return `${label}<a href="tel:${escapeAttr(value)}">${escapeHtml(value)}</a>`;
        case 'website':
          return `${label}<a href="${escapeAttr(value)}">${escapeHtml(value)}</a>`;
        default:
          return `${label}${escapeHtml(value)}`;
      }
    })
    .join(block.layout === 'inline' ? ' &nbsp;|&nbsp; ' : '<br />');
  return `<mj-text ${styleAttrs(block.text_style)} ${paddingAttr(block)}>${lines}</mj-text>`;
}

function renderButtonCta(block: ButtonCtaBlock, variables: Record<string, string>): string {
  const url = interpolate(block.url, variables);
  return `<mj-button href="${escapeAttr(url)}" background-color="${escapeAttr(block.background_color)}" color="${escapeAttr(block.text_color)}" border-radius="${escapeAttr(block.border_radius)}" font-size="${escapeAttr(block.font_size)}px" font-weight="${escapeAttr(block.font_weight)}" inner-padding="${block.padding.top}px ${block.padding.right}px ${block.padding.bottom}px ${block.padding.left}px">${escapeHtml(interpolate(block.text, variables))}</mj-button>`;
}

function renderDisclaimer(block: DisclaimerBlock, variables: Record<string, string>): string {
  return `<mj-text ${styleAttrs(block.style)} ${paddingAttr(block)}>${interpolate(block.content, variables)}</mj-text>`;
}

function renderContainer(block: ContainerBlock, variables: Record<string, string>): string {
  const inner = block.children.map((c) => renderBlock(c, variables)).join('');
  const bg = block.background_color ? `background-color="${escapeAttr(block.background_color)}"` : '';
  return `<mj-section ${bg} ${paddingAttr(block)}><mj-column>${inner}</mj-column></mj-section>`;
}

function renderBlock(block: Block, variables: Record<string, string>): string {
  if (block.visible === false) return '';
  switch (block.type) {
    case 'text':
      return renderText(block, variables);
    case 'text_stack':
      return renderTextStack(block, variables);
    case 'image':
      return renderImage(block);
    case 'divider':
      return renderDivider(block);
    case 'spacer':
      return renderSpacer(block);
    case 'social_icons':
      return renderSocialIcons(block);
    case 'contact_row':
      return renderContactRow(block, variables);
    case 'button_cta':
      return renderButtonCta(block, variables);
    case 'disclaimer':
      return renderDisclaimer(block, variables);
    case 'container':
      return renderContainer(block, variables);
    default:
      return '';
  }
}

export function compileToMjml(schema: SignatureSchema): string {
  const { canvas, blocks, variables } = schema;
  const blocksMjml = blocks.map((b) => renderBlock(b, variables)).join('');

  return `<mjml>
    <mj-head>
      <mj-attributes>
        <mj-all font-family="${escapeAttr(canvas.font_family)}" />
        <mj-text font-size="${canvas.font_size}px" color="${escapeAttr(canvas.text_color)}" line-height="1.4" />
      </mj-attributes>
    </mj-head>
    <mj-body width="${canvas.width}" background-color="${escapeAttr(canvas.background_color)}">
      <mj-section><mj-column>${blocksMjml || '<mj-spacer height="1px" />'}</mj-column></mj-section>
    </mj-body>
  </mjml>`;
}
