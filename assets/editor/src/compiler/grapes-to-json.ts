// GrapesJS → SignatureSchema bridge (CLAUDE.md §12.3).
//
// Walks the editor's component tree and emits a SignatureSchema per
// CLAUDE.md §6.1. Every component the user dragged from the Blocks panel
// carries a `data-imgsig-type` attribute identifying its schema mapping.

import type { Editor, Component } from 'grapesjs';
import type {
  Block,
  ButtonCtaBlock,
  ContactRowBlock,
  DisclaimerBlock,
  DividerBlock,
  ImageBlock,
  SignatureSchema,
  SocialIconsBlock,
  SocialNetwork,
  SpacerBlock,
  TextBlock,
  TextStackBlock,
} from '@shared/types';
import { CANVAS_DEFAULTS, SCHEMA_VERSION } from '@shared/constants';
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

let nextId = 1;
const newId = (prefix: string): string => `${prefix}_${Date.now().toString(36)}_${nextId++}`;

function attrs(c: Component): Record<string, string> {
  return c.getAttributes() as Record<string, string>;
}

function gridFor(index: number): { col: number; row: number } {
  return { col: 1, row: index + 1 };
}

export function grapesToSchema(editor: Editor, base?: Partial<SignatureSchema>): SignatureSchema {
  const wrapper = editor.getWrapper();
  if (! wrapper) {
    return emptySchema(base);
  }

  const blocks: Block[] = [];
  let index = 0;

  wrapper.components().each((component: Component) => {
    const block = componentToBlock(component, index);
    if (block) {
      blocks.push(block);
      index++;
    }
  });

  const now = new Date().toISOString();
  return {
    schema_version: SCHEMA_VERSION,
    meta: {
      created_at: base?.meta?.created_at ?? now,
      updated_at: now,
      editor_version: '1.1.0',
    },
    canvas: { ...CANVAS_DEFAULTS, ...(base?.canvas ?? {}) },
    layout: base?.layout ?? {
      type: 'table',
      columns: 1,
      gap: 8,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    blocks,
    variables: base?.variables ?? {},
  };
}

function emptySchema(base?: Partial<SignatureSchema>): SignatureSchema {
  const now = new Date().toISOString();
  return {
    schema_version: SCHEMA_VERSION,
    meta: { created_at: now, updated_at: now, editor_version: '1.1.0' },
    canvas: { ...CANVAS_DEFAULTS, ...(base?.canvas ?? {}) },
    layout: base?.layout ?? {
      type: 'table',
      columns: 1,
      gap: 8,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    blocks: [],
    variables: base?.variables ?? {},
  };
}

function componentToBlock(component: Component, index: number): Block | null {
  const a = attrs(component);
  const type = a['data-imgsig-type'];
  switch (type) {
    case AVATAR_TYPE:
    case IMAGE_BLOCK_TYPE: {
      const image: ImageBlock = {
        id: a.id ?? newId('img'),
        type: 'image',
        grid: gridFor(index),
        src: a.src ?? '',
        alt: a.alt ?? '',
        width: parseInt(a.width ?? '120', 10),
        border_radius: a['data-imgsig-shape'] ?? undefined,
        link: a['data-imgsig-link'] || undefined,
      };
      return image;
    }
    case TEXT_STACK_TYPE: {
      const lines: TextBlock[] = [];
      let li = 0;
      component.components().each((child: Component) => {
        const text: TextBlock = {
          id: newId('txt'),
          type: 'text',
          grid: { col: 1, row: ++li },
          content: child.toHTML().replace(/^<[^>]+>|<\/[^>]+>$/g, ''),
          style: {},
        };
        lines.push(text);
      });
      const stack: TextStackBlock = {
        id: a.id ?? newId('stk'),
        type: 'text_stack',
        grid: gridFor(index),
        spacing: parseInt(a['data-imgsig-spacing'] ?? '4', 10),
        children: lines,
      };
      return stack;
    }
    case SOCIAL_ROW_TYPE: {
      const networks: SocialNetwork[] = (a['data-imgsig-networks'] ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => ({ name, url: '#' }));
      const social: SocialIconsBlock = {
        id: a.id ?? newId('soc'),
        type: 'social_icons',
        grid: gridFor(index),
        networks,
        size: parseInt(a['data-imgsig-size'] ?? '24', 10),
        gap: parseInt(a['data-imgsig-gap'] ?? '6', 10),
        color: '#0a66c2',
        style: 'flat',
      };
      return social;
    }
    case CONTACT_ROW_TYPE: {
      const items: ContactRowBlock['items'] = [];
      component.components().each((child: Component) => {
        const html = child.toHTML();
        const match = html.match(/<a[^>]*data-kind="([^"]+)"[^>]*>([^<]+)<\/a>/);
        if (match) {
          items.push({ type: match[1] as 'email' | 'phone' | 'website' | 'address' | 'custom', value: match[2] });
        }
      });
      const contact: ContactRowBlock = {
        id: a.id ?? newId('ctc'),
        type: 'contact_row',
        grid: gridFor(index),
        items,
        layout: (a['data-imgsig-layout'] === 'inline' ? 'inline' : 'stacked'),
        icon: false,
        icon_color: '#1d4ed8',
        text_style: { font_size: 13 },
      };
      return contact;
    }
    case DIVIDER_TYPE: {
      const divider: DividerBlock = {
        id: a.id ?? newId('div'),
        type: 'divider',
        grid: gridFor(index),
        color: a['data-imgsig-color'] ?? '#e2e8f0',
        thickness: parseInt(a['data-imgsig-thickness'] ?? '1', 10),
        style: (a['data-imgsig-style'] as DividerBlock['style']) ?? 'solid',
      };
      return divider;
    }
    case SPACER_TYPE: {
      const spacer: SpacerBlock = {
        id: a.id ?? newId('spc'),
        type: 'spacer',
        grid: gridFor(index),
        height: parseInt(a['data-imgsig-height'] ?? '12', 10),
      };
      return spacer;
    }
    case BUTTON_CTA_TYPE: {
      const cta: ButtonCtaBlock = {
        id: a.id ?? newId('cta'),
        type: 'button_cta',
        grid: gridFor(index),
        text: (component.get('content') as string) ?? '',
        url: a.href ?? '#',
        background_color: a['data-imgsig-bg'] ?? '#2563eb',
        text_color: a['data-imgsig-fg'] ?? '#ffffff',
        border_radius: a['data-imgsig-radius'] ?? '4px',
        padding: { top: 10, right: 16, bottom: 10, left: 16 },
        font_size: 14,
        font_weight: 600,
      };
      return cta;
    }
    case DISCLAIMER_TYPE: {
      const disclaimer: DisclaimerBlock = {
        id: a.id ?? newId('dsc'),
        type: 'disclaimer',
        grid: gridFor(index),
        content: (component.get('content') as string) ?? '',
        style: { font_size: 10, color: '#94a3b8' },
      };
      return disclaimer;
    }
    default:
      return null;
  }
}
