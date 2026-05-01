/**
 * Side-effect registration of every shipped block (CLAUDE.md §10.2).
 *
 * Importing this barrel registers each definition with the
 * registry in registry.ts so the rest of the app
 * (BlockRenderer, BlockLibrary) can resolve types by name.
 */

import './text/definition';
import './heading/definition';
import './image/definition';
import './avatar/definition';
import './divider/definition';
import './spacer/definition';
import './social-icons/definition';
import './contact-row/definition';
import './button-cta/definition';
import './disclaimer/definition';
import './container/definition';
import './qr-code/definition';
import './banner/definition';
import './vcard/definition';
