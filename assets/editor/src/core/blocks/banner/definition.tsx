import { Megaphone } from 'lucide-react';
import type { BannerBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { registerBlock, type BlockDefinition } from '../registry';
import { compileBanner } from './compileBanner';
import { BannerProperties } from './BannerProperties';
import { BannerRenderer } from './BannerRenderer';

/**
 * Banner block — promotional / campaign image with a link.
 *
 * Like an Image, but it fills the available width by default (new
 * banners) or keeps a fixed width (pre-1.2 rows), is centred, and
 * surfaces banner-specific affordances. See `model.ts` and
 * `compileBanner.ts`.
 */
const definition: BlockDefinition<BannerBlock> = {
  type: 'banner',
  label: 'Banner',
  description: 'Promotional banner image with a click-through link.',
  icon: Megaphone,
  category: 'content',
  create: (): BannerBlock => ({
    id: generateId('banner'),
    type: 'banner',
    src: '',
    alt: '',
    link: '',
    width: 600,
    full_width: true,
    align: 'center',
    border_radius: 0,
    padding: { top: 8, right: 0, bottom: 8, left: 0 },
  }),
  Renderer: BannerRenderer,
  PropertiesPanel: BannerProperties,
  compile: compileBanner,
  wrap_in_section: false,
};

registerBlock(definition);

export { definition as bannerDefinition };
