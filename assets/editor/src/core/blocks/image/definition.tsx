import { Image as ImageIcon } from 'lucide-react';
import type { ImageBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { registerBlock, type BlockDefinition } from '../registry';
import { compileImage } from './compileImage';
import { ImageProperties } from './ImageProperties';
import { ImageRenderer } from './ImageRenderer';

// Re-exported for the Avatar / Banner blocks and older imports.
export { ImageUploadButton } from './ImageUploadButton';
export { isAnimatedGif } from './model';
export { withOutlookFallback } from './markup';

/**
 * Image block (1.2): source from a URL, the asset library, an upload
 * or a crop; size with aspect lock; alignment; radius; border; link
 * and alt text. See `compileImage.ts` for the email output and
 * `model.ts` for how pre-1.2 rows are read.
 */
const definition: BlockDefinition<ImageBlock> = {
  type: 'image',
  label: 'Image',
  description: 'A single image with optional link.',
  icon: ImageIcon,
  category: 'content',

  create: (): ImageBlock => ({
    id: generateId('img'),
    type: 'image',
    src: '',
    alt: '',
    width: 120,
    border_radius: 0,
    align: 'left',
    lock_aspect: true,
    padding: { top: 4, right: 0, bottom: 4, left: 0 },
  }),

  Renderer: ImageRenderer,
  PropertiesPanel: ImageProperties,
  compile: compileImage,
  wrap_in_section: false,
};

registerBlock(definition);

export { definition as imageDefinition };
