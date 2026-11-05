import { Type } from 'lucide-react';
import type { TextBlock } from '@/core/schema/blocks';
import { __ } from '@/i18n/helpers';
import { generateId } from '@/utils/idGenerator';
import { registerBlock, type BlockDefinition } from '../registry';
import { TextBlock as TextBlockRenderer } from './TextBlock';
import { TextProperties } from './TextProperties';
import { compileText } from './compileText';

const definition: BlockDefinition<TextBlock> = {
  type: 'text',
  label: 'Text',
  description: 'Single block of formatted text.',
  icon: Type,
  category: 'content',

  create: (): TextBlock => ({
    id: generateId('text'),
    type: 'text',
    content: __('Edit me'),
    // Family, size, weight and colour are left unset: they follow the
    // canvas defaults until the user overrides them.
    style: {
      line_height: 1.4,
      text_align: 'left',
    },
    padding: { top: 4, right: 0, bottom: 4, left: 0 },
  }),

  Renderer: TextBlockRenderer,
  PropertiesPanel: TextProperties,
  compile: compileText,
  // The panel is organised in its own PropertySections.
  wrap_in_section: false,
};

registerBlock(definition);

export { definition as textDefinition };
