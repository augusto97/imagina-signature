import { Share2 } from 'lucide-react';
import type { SocialIconsBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { registerBlock, type BlockDefinition } from '../registry';
import { compileSocialIcons } from './compileSocial';
import { SocialIconsBlock as Renderer } from './SocialIconsBlock';
import { SocialIconsProperties } from './SocialIconsProperties';
import { SOCIAL_DEFAULTS } from './normalize';

const definition: BlockDefinition<SocialIconsBlock> = {
  type: 'social_icons',
  label: 'Social',
  description: 'Row of social media icons.',
  icon: Share2,
  category: 'social',
  create: (): SocialIconsBlock => ({
    id: generateId('soc'),
    type: 'social_icons',
    items: [
      { id: generateId('sn'), network: 'linkedin', url: '' },
      { id: generateId('sn'), network: 'x', url: '' },
      { id: generateId('sn'), network: 'instagram', url: '' },
    ],
    shape: SOCIAL_DEFAULTS.shape,
    tone: SOCIAL_DEFAULTS.tone,
    size: SOCIAL_DEFAULTS.size,
    spacing: SOCIAL_DEFAULTS.spacing,
    align: SOCIAL_DEFAULTS.align,
    padding: { top: 4, right: 0, bottom: 4, left: 0 },
  }),
  Renderer,
  PropertiesPanel: SocialIconsProperties,
  compile: compileSocialIcons,
  wrap_in_section: false,
};

registerBlock(definition);
export { definition as socialIconsDefinition };
