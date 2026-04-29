// SignatureSchema → GrapesJS bridge (CLAUDE.md §12.3).
//
// Inverse of grapes-to-json. Converts each schema block into the
// `{ type, ... }` component descriptor GrapesJS understands.

import type { Editor } from 'grapesjs';
import type { Block, SignatureSchema } from '@shared/types';
import {
  AVATAR_TYPE,
  BUTTON_CTA_TYPE,
  CONTACT_ROW_TYPE,
  DISCLAIMER_TYPE,
  DIVIDER_TYPE,
  IMAGE_BLOCK_TYPE,
  SOCIAL_ROW_TYPE,
  SPACER_TYPE,
  TEXT_STACK_TYPE,
} from '../editor/blocks';

interface ComponentDescriptor {
  type?: string;
  tagName?: string;
  attributes?: Record<string, string>;
  components?: ComponentDescriptor[];
  content?: string;
}

export function schemaToComponents(schema: SignatureSchema): ComponentDescriptor[] {
  return schema.blocks.map(blockToComponent).filter(Boolean) as ComponentDescriptor[];
}

export function loadSchemaIntoEditor(editor: Editor, schema: SignatureSchema): void {
  const components = schemaToComponents(schema);
  editor.setComponents(components as unknown as Parameters<Editor['setComponents']>[0]);
}

function blockToComponent(block: Block): ComponentDescriptor | null {
  switch (block.type) {
    case 'image':
      // Round-trip ambiguity: shape + 'is-avatar' becomes Avatar; otherwise
      // generic image block. CLAUDE.md §12.2 allows both round-trip mappings.
      if (block.border_radius === '50%' || block.border_radius === '8px') {
        return {
          type: AVATAR_TYPE,
          attributes: {
            src: block.src,
            alt: block.alt,
            width: String(block.width),
            'data-imgsig-shape': block.border_radius ?? '50%',
          },
        };
      }
      return {
        type: IMAGE_BLOCK_TYPE,
        attributes: {
          src: block.src,
          alt: block.alt,
          width: String(block.width),
          ...(block.link ? { 'data-imgsig-link': block.link } : {}),
        },
      };
    case 'text_stack':
      return {
        type: TEXT_STACK_TYPE,
        attributes: { 'data-imgsig-spacing': String(block.spacing) },
        components: block.children.map((line) => ({
          tagName: 'div',
          attributes: { style: 'font-size:13px; color:#0f172a; line-height:1.6;' },
          content: line.content,
        })),
      };
    case 'social_icons':
      return {
        type: SOCIAL_ROW_TYPE,
        attributes: {
          'data-imgsig-networks': block.networks.map((n) => n.name).join(','),
          'data-imgsig-size': String(block.size),
          'data-imgsig-gap': String(block.gap),
        },
      };
    case 'contact_row':
      return {
        type: CONTACT_ROW_TYPE,
        attributes: { 'data-imgsig-layout': block.layout },
        components: block.items.map((item) => ({
          tagName: 'div',
          attributes: { style: 'font-size:13px; color:#0f172a; line-height:1.6;' },
          content: contactItemHtml(item.type, item.value),
        })),
      };
    case 'divider':
      return {
        type: DIVIDER_TYPE,
        attributes: {
          'data-imgsig-color': block.color,
          'data-imgsig-thickness': String(block.thickness),
          'data-imgsig-style': block.style,
        },
      };
    case 'spacer':
      return {
        type: SPACER_TYPE,
        attributes: { 'data-imgsig-height': String(block.height) },
      };
    case 'button_cta':
      return {
        type: BUTTON_CTA_TYPE,
        attributes: {
          href: block.url,
          'data-imgsig-bg': block.background_color,
          'data-imgsig-fg': block.text_color,
          'data-imgsig-radius': block.border_radius,
        },
        content: block.text,
      };
    case 'disclaimer':
      return {
        type: DISCLAIMER_TYPE,
        content: block.content,
      };
    case 'text':
    case 'container':
    default:
      return null;
  }
}

function contactItemHtml(type: string, value: string): string {
  switch (type) {
    case 'email':
      return `✉ <a href="mailto:${value}" data-kind="email">${value}</a>`;
    case 'phone':
      return `☎ <a href="tel:${value}" data-kind="phone">${value}</a>`;
    case 'website':
      return `🌐 <a href="${value}" data-kind="website">${value}</a>`;
    case 'address':
      return `📍 <span data-kind="address">${value}</span>`;
    default:
      return `<span data-kind="custom">${value}</span>`;
  }
}
