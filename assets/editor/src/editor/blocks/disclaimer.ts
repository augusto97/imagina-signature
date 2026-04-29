// Disclaimer block (CLAUDE.md §12.2). Small legal text, normally at the bottom.

import type { Editor } from 'grapesjs';
import { __ } from '../../i18n/helpers';

export const DISCLAIMER_TYPE = 'is-disclaimer';
export const DISCLAIMER_SCHEMA_TYPE = 'disclaimer';

export function registerDisclaimerBlock(editor: Editor): void {
  editor.DomComponents.addType(DISCLAIMER_TYPE, {
    isComponent: (el) => el?.getAttribute?.('data-imgsig-type') === DISCLAIMER_TYPE,
    model: {
      defaults: {
        tagName: 'p',
        attributes: {
          'data-imgsig-type': DISCLAIMER_TYPE,
          style: 'font-size: 10px; color: #94a3b8; line-height: 1.4; margin: 8px 0 0;',
        },
        content: __('This email is intended only for the addressee.'),
        editable: true,
        droppable: false,
      },
    },
  });

  editor.BlockManager.add(DISCLAIMER_TYPE, {
    label: __('Disclaimer'),
    category: __('Imagina Signatures'),
    media: '<svg viewBox="0 0 24 24" width="32" height="32"><rect x="3" y="6" width="18" height="2" fill="#cbd5e1"/><rect x="3" y="10" width="14" height="2" fill="#cbd5e1"/><rect x="3" y="14" width="16" height="2" fill="#cbd5e1"/></svg>',
    content: { type: DISCLAIMER_TYPE },
  });
}
