// Divider block (CLAUDE.md §12.2). A horizontal rule via styled <hr>.

import type { Editor } from 'grapesjs';
import { __ } from '../../i18n/helpers';

export const DIVIDER_TYPE = 'is-divider';
export const DIVIDER_SCHEMA_TYPE = 'divider';

export function registerDividerBlock(editor: Editor): void {
  editor.DomComponents.addType(DIVIDER_TYPE, {
    isComponent: (el) => el?.getAttribute?.('data-imgsig-type') === DIVIDER_TYPE,
    model: {
      defaults: {
        tagName: 'hr',
        attributes: {
          'data-imgsig-type': DIVIDER_TYPE,
          'data-imgsig-color': '#e2e8f0',
          'data-imgsig-thickness': '1',
          'data-imgsig-style': 'solid',
          style: 'border: 0; border-top: 1px solid #e2e8f0; margin: 8px 0;',
        },
        droppable: false,
        traits: [
          { type: 'color', name: 'data-imgsig-color', label: __('Color') },
          { type: 'number', name: 'data-imgsig-thickness', label: __('Thickness (px)'), min: 1, max: 10 },
          {
            type: 'select',
            name: 'data-imgsig-style',
            label: __('Style'),
            options: [
              { id: 'solid', value: 'solid', name: __('Solid') },
              { id: 'dashed', value: 'dashed', name: __('Dashed') },
              { id: 'dotted', value: 'dotted', name: __('Dotted') },
            ],
          },
        ],
      },
      init() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const repaint = () => {
          const attrs = self.getAttributes() as Record<string, string>;
          const color = attrs['data-imgsig-color'] ?? '#e2e8f0';
          const thickness = attrs['data-imgsig-thickness'] ?? '1';
          const style = attrs['data-imgsig-style'] ?? 'solid';
          self.addAttributes({
            style: `border: 0; border-top: ${thickness}px ${style} ${color}; margin: 8px 0;`,
          });
        };
        self.on('change:attributes:data-imgsig-color', repaint);
        self.on('change:attributes:data-imgsig-thickness', repaint);
        self.on('change:attributes:data-imgsig-style', repaint);
      },
    },
  });

  editor.BlockManager.add(DIVIDER_TYPE, {
    label: __('Divider'),
    category: __('Imagina Signatures'),
    media: '<svg viewBox="0 0 24 24" width="32" height="32"><line x1="2" y1="12" x2="22" y2="12" stroke="#475569" stroke-width="2"/></svg>',
    content: { type: DIVIDER_TYPE },
  });
}
