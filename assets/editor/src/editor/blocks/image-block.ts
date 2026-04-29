// Generic image block (CLAUDE.md §12.2). Distinct from `avatar` in that it
// has no shape preset and supports an optional link target.

import type { Editor } from 'grapesjs';
import { __ } from '../../i18n/helpers';

export const IMAGE_BLOCK_TYPE = 'is-image';
export const IMAGE_BLOCK_SCHEMA_TYPE = 'image';

const PLACEHOLDER =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCAxMjAgODAiPjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iODAiIGZpbGw9IiNlMmU4ZjAiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZmlsbD0iIzk0YTNiOCIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTIiPkltYWdlPC90ZXh0Pjwvc3ZnPg==';

export function registerImageBlock(editor: Editor): void {
  editor.DomComponents.addType(IMAGE_BLOCK_TYPE, {
    isComponent: (el) => el?.getAttribute?.('data-imgsig-type') === IMAGE_BLOCK_TYPE,
    model: {
      defaults: {
        tagName: 'img',
        attributes: {
          'data-imgsig-type': IMAGE_BLOCK_TYPE,
          src: PLACEHOLDER,
          alt: __('Image'),
          width: '160',
          style: 'display: block; max-width: 100%; height: auto;',
        },
        droppable: false,
        traits: [
          { type: 'text', name: 'src', label: __('Image URL') },
          { type: 'text', name: 'alt', label: __('Alt text') },
          { type: 'number', name: 'width', label: __('Width (px)'), min: 32, max: 600 },
          { type: 'text', name: 'data-imgsig-link', label: __('Link URL (optional)') },
        ],
      },
    },
  });

  editor.BlockManager.add(IMAGE_BLOCK_TYPE, {
    label: __('Image'),
    category: __('Imagina Signatures'),
    media: '<svg viewBox="0 0 24 24" width="32" height="32"><rect x="3" y="5" width="18" height="14" rx="2" fill="#cbd5e1"/><circle cx="9" cy="11" r="2" fill="#475569"/><path d="M3 17l5-5 4 4 3-3 6 6V5z" fill="#475569" fill-opacity=".4"/></svg>',
    content: { type: IMAGE_BLOCK_TYPE },
  });
}
