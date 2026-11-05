import { CircleUserRound } from 'lucide-react';
import type { AvatarBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { registerBlock, type BlockDefinition } from '../registry';
import { compileAvatar } from './compileAvatar';
import { AvatarProperties } from './AvatarProperties';
import { AvatarRenderer } from './AvatarRenderer';

/**
 * Avatar block (1.2): profile photo with a real shape (circle, rounded,
 * square) and optional ring baked into a hosted PNG, alignment, link
 * and alt text. See `model.ts` for how pre-1.2 rows are read and
 * `compileAvatar.ts` for the email output.
 */
const definition: BlockDefinition<AvatarBlock> = {
  type: 'avatar',
  label: 'Avatar',
  description: 'Round profile image.',
  icon: CircleUserRound,
  category: 'content',
  create: (): AvatarBlock => ({
    id: generateId('av'),
    type: 'avatar',
    src: '',
    alt: '',
    size: 64,
    shape: 'circle',
    align: 'left',
    padding: { top: 0, right: 0, bottom: 8, left: 0 },
  }),
  Renderer: AvatarRenderer,
  PropertiesPanel: AvatarProperties,
  compile: compileAvatar,
  wrap_in_section: false,
};

registerBlock(definition);
export { definition as avatarDefinition };
