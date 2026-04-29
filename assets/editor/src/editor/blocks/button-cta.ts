// CTA button block (CLAUDE.md §12.2).

import type { Editor } from 'grapesjs';
import { __ } from '../../i18n/helpers';

export const BUTTON_CTA_TYPE = 'is-button-cta';
export const BUTTON_CTA_SCHEMA_TYPE = 'button_cta';

export function registerButtonCtaBlock(editor: Editor): void {
  editor.DomComponents.addType(BUTTON_CTA_TYPE, {
    isComponent: (el) => el?.getAttribute?.('data-imgsig-type') === BUTTON_CTA_TYPE,
    model: {
      defaults: {
        tagName: 'a',
        attributes: {
          'data-imgsig-type': BUTTON_CTA_TYPE,
          href: '#',
          'data-imgsig-bg': '#2563eb',
          'data-imgsig-fg': '#ffffff',
          'data-imgsig-radius': '4px',
          style:
            'display: inline-block; padding: 10px 16px; background: #2563eb; color: #ffffff; ' +
            'border-radius: 4px; font-weight: 600; font-size: 14px; text-decoration: none;',
        },
        content: __('Schedule a call'),
        droppable: false,
        traits: [
          { type: 'text', name: 'href', label: __('Link URL') },
          { type: 'color', name: 'data-imgsig-bg', label: __('Background color') },
          { type: 'color', name: 'data-imgsig-fg', label: __('Text color') },
          { type: 'text', name: 'data-imgsig-radius', label: __('Border radius (e.g. 4px)') },
        ],
      },
      init() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const repaint = () => {
          const attrs = self.getAttributes() as Record<string, string>;
          const bg = attrs['data-imgsig-bg'] ?? '#2563eb';
          const fg = attrs['data-imgsig-fg'] ?? '#ffffff';
          const r = attrs['data-imgsig-radius'] ?? '4px';
          self.addAttributes({
            style:
              `display: inline-block; padding: 10px 16px; background: ${bg}; color: ${fg}; ` +
              `border-radius: ${r}; font-weight: 600; font-size: 14px; text-decoration: none;`,
          });
        };
        self.on('change:attributes:data-imgsig-bg', repaint);
        self.on('change:attributes:data-imgsig-fg', repaint);
        self.on('change:attributes:data-imgsig-radius', repaint);
      },
    },
  });

  editor.BlockManager.add(BUTTON_CTA_TYPE, {
    label: __('CTA button'),
    category: __('Imagina Signatures'),
    media: '<svg viewBox="0 0 24 24" width="32" height="32"><rect x="3" y="8" width="18" height="8" rx="2" fill="#2563eb"/></svg>',
    content: { type: BUTTON_CTA_TYPE },
  });
}
