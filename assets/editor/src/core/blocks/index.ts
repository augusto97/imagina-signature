/**
 * Side-effect registration of every shipped block.
 *
 * Importing this barrel registers each definition with the
 * registry, so the rest of the app (BlockRenderer, BlockLibrary)
 * can resolve types by name.
 */

import './text/definition';
import './image/definition';
import './divider/definition';

// Sprint 8 will append: heading, avatar, spacer, social_icons,
// contact_row, button_cta, disclaimer, container.
