// Registers every CLAUDE.md §12.2 custom block on a GrapesJS editor.

import type { Editor } from 'grapesjs';
import { registerAvatarBlock } from './avatar';
import { registerTextStackBlock } from './text-stack';
import { registerSocialRowBlock } from './social-row';
import { registerContactRowBlock } from './contact-row';
import { registerDividerBlock } from './divider';
import { registerSpacerBlock } from './spacer';
import { registerButtonCtaBlock } from './button-cta';
import { registerDisclaimerBlock } from './disclaimer';
import { registerImageBlock } from './image-block';

export function registerCustomBlocks(editor: Editor): void {
  registerAvatarBlock(editor);
  registerTextStackBlock(editor);
  registerSocialRowBlock(editor);
  registerContactRowBlock(editor);
  registerDividerBlock(editor);
  registerSpacerBlock(editor);
  registerButtonCtaBlock(editor);
  registerDisclaimerBlock(editor);
  registerImageBlock(editor);
}

export {
  AVATAR_TYPE,
} from './avatar';
export {
  TEXT_STACK_TYPE,
} from './text-stack';
export {
  SOCIAL_ROW_TYPE,
} from './social-row';
export {
  CONTACT_ROW_TYPE,
} from './contact-row';
export {
  DIVIDER_TYPE,
} from './divider';
export {
  SPACER_TYPE,
} from './spacer';
export {
  BUTTON_CTA_TYPE,
} from './button-cta';
export {
  DISCLAIMER_TYPE,
} from './disclaimer';
export {
  IMAGE_BLOCK_TYPE,
} from './image-block';
