import { Contact } from 'lucide-react';
import type { ContactRowBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { registerBlock, type BlockDefinition } from '../registry';
import { compileContactRow } from './compileContact';
import { ContactRowBlock as Renderer } from './ContactRowBlock';
import { ContactRowProperties } from './ContactRowProperties';

const definition: BlockDefinition<ContactRowBlock> = {
  type: 'contact_row',
  label: 'Contact',
  description: 'Email / phone / web rows with icons.',
  icon: Contact,
  category: 'content',
  create: (): ContactRowBlock => ({
    id: generateId('cr'),
    type: 'contact_row',
    items: [
      { id: generateId('ci'), type: 'email', value: 'name@example.com' },
      { id: generateId('ci'), type: 'phone', value: '+1 555 123 4567' },
      { id: generateId('ci'), type: 'website', value: 'example.com' },
    ],
    layout: 'stacked',
    separator: ' | ',
    show_icons: true,
    icon_shape: 'circle',
    icon_tone: 'brand',
    icon_size: 16,
    label_mode: 'none',
    row_gap: 4,
    // No font_family: the block follows the signature (canvas) font.
    style: {
      font_size: 13,
      font_weight: 400,
      color: '#374151',
      text_align: 'left',
    },
    padding: { top: 4, right: 0, bottom: 4, left: 0 },
  }),
  Renderer,
  PropertiesPanel: ContactRowProperties,
  compile: compileContactRow,
  wrap_in_section: false,
};

registerBlock(definition);
export { definition as contactRowDefinition };
