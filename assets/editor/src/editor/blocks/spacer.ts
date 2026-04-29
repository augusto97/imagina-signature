// Spacer block (CLAUDE.md §12.2). A vertical empty space (height-only div).

import type { Editor } from 'grapesjs';
import { __ } from '../../i18n/helpers';

export const SPACER_TYPE = 'is-spacer';
export const SPACER_SCHEMA_TYPE = 'spacer';

export function registerSpacerBlock(editor: Editor): void {
  editor.DomComponents.addType(SPACER_TYPE, {
    isComponent: (el) => el?.getAttribute?.('data-imgsig-type') === SPACER_TYPE,
    model: {
      defaults: {
        tagName: 'div',
        attributes: {
          'data-imgsig-type': SPACER_TYPE,
          'data-imgsig-height': '12',
          style: 'height: 12px; line-height: 12px; font-size: 1px;',
        },
        droppable: false,
        traits: [
          { type: 'number', name: 'data-imgsig-height', label: __('Height (px)'), min: 2, max: 120 },
        ],
      },
      init() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        self.on('change:attributes:data-imgsig-height', () => {
          const h = (self.getAttributes() as Record<string, string>)['data-imgsig-height'] ?? '12';
          self.addAttributes({ style: `height: ${h}px; line-height: ${h}px; font-size: 1px;` });
        });
      },
    },
  });

  editor.BlockManager.add(SPACER_TYPE, {
    label: __('Spacer'),
    category: __('Imagina Signatures'),
    media: '<svg viewBox="0 0 24 24" width="32" height="32"><rect x="3" y="11" width="18" height="2" fill="#cbd5e1"/></svg>',
    content: { type: SPACER_TYPE },
  });
}
