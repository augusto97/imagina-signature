// Avatar block (CLAUDE.md §12.2).
//
// A circular image, typically a profile photo. Internally a `mj-image`
// component with shape and width traits.

import type { Editor } from 'grapesjs';
import { __ } from '../../i18n/helpers';

export const AVATAR_TYPE = 'is-avatar';
export const AVATAR_SCHEMA_TYPE = 'image';

const PLACEHOLDER =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj48Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2UyZThmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmaWxsPSIjOTRhM2I4IiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMiI+QXZhdGFyPC90ZXh0Pjwvc3ZnPg==';

export function registerAvatarBlock(editor: Editor): void {
  editor.DomComponents.addType(AVATAR_TYPE, {
    isComponent: (el) => el?.getAttribute?.('data-imgsig-type') === AVATAR_TYPE,
    model: {
      defaults: {
        tagName: 'img',
        attributes: {
          'data-imgsig-type': AVATAR_TYPE,
          src: PLACEHOLDER,
          alt: __('Avatar'),
          width: '80',
          style: 'border-radius: 50%; display: block;',
        },
        draggable: true,
        droppable: false,
        traits: [
          { type: 'text', name: 'src', label: __('Image URL') },
          { type: 'text', name: 'alt', label: __('Alt text') },
          { type: 'number', name: 'width', label: __('Width (px)'), min: 40, max: 240 },
          {
            type: 'select',
            name: 'data-imgsig-shape',
            label: __('Shape'),
            options: [
              { id: 'circle', value: '50%', name: __('Circle') },
              { id: 'rounded', value: '8px', name: __('Rounded') },
              { id: 'square', value: '0', name: __('Square') },
            ],
            changeProp: false,
          },
        ],
      },
      init() {
        // Map the shape trait to the inline border-radius style.
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        self.on('change:attributes:data-imgsig-shape', () => {
          const shape = (self.getAttributes() as Record<string, string>)['data-imgsig-shape'] ?? '50%';
          self.addAttributes({ style: `border-radius: ${shape}; display: block;` });
        });
      },
    },
  });

  editor.BlockManager.add(AVATAR_TYPE, {
    label: __('Avatar'),
    category: __('Imagina Signatures'),
    media: '<svg viewBox="0 0 24 24" width="32" height="32"><circle cx="12" cy="9" r="4" fill="#94a3b8"/><path d="M4 21a8 8 0 0116 0z" fill="#cbd5e1"/></svg>',
    content: { type: AVATAR_TYPE },
  });
}
