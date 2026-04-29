// Block definitions: descriptors for the palette, factories that
// produce a default schema instance, and a label resolver used by the
// layers panel.

import type { Block } from '@shared/types';
import { __ } from '../../i18n/helpers';

export interface BlockDescriptor {
  type: Block['type'];
  label: () => string;
  description: () => string;
  factory: () => Block;
}

let nextId = 1;
const newId = (prefix: string): string => `${prefix}_${Date.now().toString(36)}_${nextId++}`;

export const BLOCK_DESCRIPTORS: BlockDescriptor[] = [
  {
    type: 'text',
    label: () => __('Text'),
    description: () => __('A single paragraph of text.'),
    factory: () => ({
      id: newId('txt'),
      type: 'text',
      grid: { col: 1, row: 1 },
      content: __('Your name'),
      style: { font_size: 14, color: '#0f172a' },
    }),
  },
  {
    type: 'text_stack',
    label: () => __('Text stack'),
    description: () => __('Multiple text lines stacked together.'),
    factory: () => ({
      id: newId('stk'),
      type: 'text_stack',
      grid: { col: 1, row: 1 },
      spacing: 4,
      children: [
        {
          id: newId('txt'),
          type: 'text',
          grid: { col: 1, row: 1 },
          content: __('Jane Doe'),
          style: { font_size: 16, font_weight: 700 },
        },
        {
          id: newId('txt'),
          type: 'text',
          grid: { col: 1, row: 2 },
          content: __('Account Executive · Acme Inc.'),
          style: { font_size: 13, color: '#64748b' },
        },
      ],
    }),
  },
  {
    type: 'image',
    label: () => __('Image'),
    description: () => __('Avatar, logo, or any image.'),
    factory: () => ({
      id: newId('img'),
      type: 'image',
      grid: { col: 1, row: 1 },
      src: '',
      alt: __('Image'),
      width: 120,
      border_radius: '0',
    }),
  },
  {
    type: 'divider',
    label: () => __('Divider'),
    description: () => __('A horizontal separator line.'),
    factory: () => ({
      id: newId('div'),
      type: 'divider',
      grid: { col: 1, row: 1 },
      color: '#e2e8f0',
      thickness: 1,
      style: 'solid',
    }),
  },
  {
    type: 'spacer',
    label: () => __('Spacer'),
    description: () => __('Vertical empty space.'),
    factory: () => ({
      id: newId('spc'),
      type: 'spacer',
      grid: { col: 1, row: 1 },
      height: 12,
    }),
  },
  {
    type: 'social_icons',
    label: () => __('Social icons'),
    description: () => __('Row of social network icons.'),
    factory: () => ({
      id: newId('soc'),
      type: 'social_icons',
      grid: { col: 1, row: 1 },
      networks: [
        { name: 'linkedin', url: 'https://linkedin.com/' },
        { name: 'twitter', url: 'https://twitter.com/' },
      ],
      size: 22,
      gap: 6,
      color: '#1d4ed8',
      style: 'rounded',
    }),
  },
  {
    type: 'contact_row',
    label: () => __('Contact row'),
    description: () => __('Email, phone, address, website.'),
    factory: () => ({
      id: newId('ctc'),
      type: 'contact_row',
      grid: { col: 1, row: 1 },
      items: [
        { type: 'email', value: 'jane@example.com' },
        { type: 'phone', value: '+1 555 0100' },
        { type: 'website', value: 'https://example.com' },
      ],
      layout: 'stacked',
      icon: false,
      icon_color: '#1d4ed8',
      text_style: { font_size: 12 },
    }),
  },
  {
    type: 'button_cta',
    label: () => __('CTA button'),
    description: () => __('A prominent call-to-action button.'),
    factory: () => ({
      id: newId('cta'),
      type: 'button_cta',
      grid: { col: 1, row: 1 },
      text: __('Schedule a call'),
      url: 'https://example.com',
      background_color: '#2563eb',
      text_color: '#ffffff',
      border_radius: '4px',
      padding: { top: 10, right: 16, bottom: 10, left: 16 },
      font_size: 14,
      font_weight: 600,
    }),
  },
  {
    type: 'disclaimer',
    label: () => __('Disclaimer'),
    description: () => __('Small legal text at the bottom.'),
    factory: () => ({
      id: newId('dsc'),
      type: 'disclaimer',
      grid: { col: 1, row: 1 },
      content: __('This email is intended only for the addressee.'),
      style: { font_size: 10, color: '#94a3b8' },
    }),
  },
];

export function describeBlock(block: Block): string {
  const descriptor = BLOCK_DESCRIPTORS.find((b) => b.type === block.type);
  if (!descriptor) return block.type;
  if (block.type === 'text') {
    const text = block.content.replace(/<[^>]*>/g, '').trim();
    return text.length > 30 ? text.slice(0, 30) + '…' : text || descriptor.label();
  }
  if (block.type === 'image') {
    return block.alt || descriptor.label();
  }
  if (block.type === 'button_cta') {
    return block.text || descriptor.label();
  }
  return descriptor.label();
}
