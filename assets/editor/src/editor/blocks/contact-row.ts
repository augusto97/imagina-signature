// Contact row block (CLAUDE.md §12.2): email + phone + website + address.

import type { Editor } from 'grapesjs';
import { __ } from '../../i18n/helpers';

export const CONTACT_ROW_TYPE = 'is-contact-row';
export const CONTACT_ROW_SCHEMA_TYPE = 'contact_row';

export function registerContactRowBlock(editor: Editor): void {
  editor.DomComponents.addType(CONTACT_ROW_TYPE, {
    isComponent: (el) => el?.getAttribute?.('data-imgsig-type') === CONTACT_ROW_TYPE,
    model: {
      defaults: {
        tagName: 'div',
        attributes: {
          'data-imgsig-type': CONTACT_ROW_TYPE,
          'data-imgsig-layout': 'stacked',
        },
        components: [
          { tagName: 'div', content: '✉ <a href="mailto:jane@example.com" data-kind="email">jane@example.com</a>', attributes: { style: 'font-size:13px; color:#0f172a; line-height:1.6;' } },
          { tagName: 'div', content: '☎ <a href="tel:+15550100" data-kind="phone">+1 555 0100</a>', attributes: { style: 'font-size:13px; color:#0f172a; line-height:1.6;' } },
          { tagName: 'div', content: '🌐 <a href="https://example.com" data-kind="website">example.com</a>', attributes: { style: 'font-size:13px; color:#0f172a; line-height:1.6;' } },
        ],
        traits: [
          {
            type: 'select',
            name: 'data-imgsig-layout',
            label: __('Layout'),
            options: [
              { id: 'stacked', value: 'stacked', name: __('Stacked') },
              { id: 'inline', value: 'inline', name: __('Inline') },
            ],
          },
        ],
      },
    },
  });

  editor.BlockManager.add(CONTACT_ROW_TYPE, {
    label: __('Contact row'),
    category: __('Imagina Signatures'),
    media: '<svg viewBox="0 0 24 24" width="32" height="32"><path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h12v2H3z" fill="#475569"/></svg>',
    content: { type: CONTACT_ROW_TYPE },
  });
}
