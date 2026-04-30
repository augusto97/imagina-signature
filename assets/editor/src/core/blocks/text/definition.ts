import { Type } from 'lucide-react';
import type { TextBlock } from '@/core/schema/blocks';
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
    content: 'Edit me',
    style: {
      font_family: 'Arial, sans-serif',
      font_size: 14,
      font_weight: 400,
      color: '#111827',
      line_height: 1.4,
      text_align: 'left',
    },
    padding: { top: 4, right: 0, bottom: 4, left: 0 },
  }),

  Renderer: TextBlockRenderer,
  PropertiesPanel: TextProperties,
  compile: compileText,
};

registerBlock(definition);

export { definition as textDefinition };
