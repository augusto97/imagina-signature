// Text Stack block (CLAUDE.md §12.2): name + role + company stacked tightly.

import type { Editor } from 'grapesjs';
import { __ } from '../../i18n/helpers';

export const TEXT_STACK_TYPE = 'is-text-stack';
export const TEXT_STACK_SCHEMA_TYPE = 'text_stack';

export function registerTextStackBlock(editor: Editor): void {
  editor.DomComponents.addType(TEXT_STACK_TYPE, {
    isComponent: (el) => el?.getAttribute?.('data-imgsig-type') === TEXT_STACK_TYPE,
    model: {
      defaults: {
        tagName: 'div',
        attributes: { 'data-imgsig-type': TEXT_STACK_TYPE },
        components: [
          { tagName: 'div', content: '<strong>Jane Doe</strong>', attributes: { 'data-line': '0', style: 'font-size:16px; font-weight:700; color:#0f172a;' } },
          { tagName: 'div', content: 'Account Executive', attributes: { 'data-line': '1', style: 'font-size:13px; color:#475569;' } },
          { tagName: 'div', content: 'Acme Inc.', attributes: { 'data-line': '2', style: 'font-size:13px; color:#475569;' } },
        ],
        traits: [
          { type: 'number', name: 'data-imgsig-spacing', label: __('Line spacing (px)'), value: 4, min: 0, max: 24 },
        ],
      },
    },
  });

  editor.BlockManager.add(TEXT_STACK_TYPE, {
    label: __('Text stack'),
    category: __('Imagina Signatures'),
    media: '<svg viewBox="0 0 24 24" width="32" height="32"><rect x="3" y="6" width="18" height="2" fill="#0f172a"/><rect x="3" y="11" width="14" height="2" fill="#94a3b8"/><rect x="3" y="16" width="10" height="2" fill="#94a3b8"/></svg>',
    content: { type: TEXT_STACK_TYPE },
  });
}
