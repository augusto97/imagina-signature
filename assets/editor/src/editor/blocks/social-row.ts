// Social icons row (CLAUDE.md §12.2). Renders a strip of square icon buttons.

import type { Editor } from 'grapesjs';
import { __ } from '../../i18n/helpers';

export const SOCIAL_ROW_TYPE = 'is-social-row';
export const SOCIAL_ROW_SCHEMA_TYPE = 'social_icons';

const ICONS: Record<string, string> = {
  linkedin:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cGF0aCBmaWxsPSIjMGE2NmMyIiBkPSJNMjAuNSAydjIwSDMuNVYySDIwLjVNNi42IDcuNUg5VjE4SDYuNlY3LjVNNy44IDYuMUM3IDYuMSA2LjQgNS41IDYuNCA0LjdjMC0uOC42LTEuNSAxLjUtMS41UzkuMyAzLjkgOS4zIDQuN2MwIC44LS43IDEuNC0xLjUgMS40Wk0xOCAxOGgtMi40di01LjJjMC0xLjMtLjUtMi4yLTEuNy0yLjJjLTEgMC0xLjUuNi0xLjcgMS4yYy0uMS4yLS4xLjUtLjEuOFYxOEgxMC44VjcuNUgxMy4yVjlhMy4yIDMuMiAwIDAxMi45LTEuNkMxOCA3LjQgMTggMTAgMTggMTIuM1YxOFoiLz48L3N2Zz4=',
  twitter:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cGF0aCBmaWxsPSIjMGYxNDFlIiBkPSJNMTguMjQgM0gyMS41bC03LjE5IDguMjJMMjIuNzUgMjFoLTYuNTNsLTUuMTEtNi42OUw1LjI1IDIxSDJsNy42OS04LjgyTDEuNSAzaDYuNjlsNC42MiA2LjEzTDE4LjI0IDNaTTE3LjEgMTkuMWgxLjgxTDcuMDIgNC44SDUuMDhsMTIuMDIgMTQuM1oiLz48L3N2Zz4=',
  facebook:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cGF0aCBmaWxsPSIjMTg3N2YyIiBkPSJNMjIgMTJjMC01LjUyLTQuNDgtMTAtMTAtMTBTMiA2LjQ4IDIgMTJjMCA0Ljk5IDMuNjYgOS4xMyA4LjQ0IDkuODh2LTYuOTlIN3Ytdjkuc25hcC4tdjItMy44N2gtMi41NHYtMi45aDIuNTRWOS43OWMwLTIuNSAxLjQ5LTMuODkgMy43Ny0zLjg5YzEuMDkgMCAyLjI0LjE5IDIuMjQuMTl2Mi40N0gxNS44Yy0xLjI0IDAtMS42My43Ny0xLjYzIDEuNTZWMTJoMi43OGwtLjQ0IDIuOWgtMi4zNHY2Ljk5QTEwIDEwIDAgMDAyMiAxMnoiLz48L3N2Zz4=',
  instagram:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cGF0aCBmaWxsPSIjZTQ0MDVmIiBkPSJNMTIgMmM2IDAgMTAgNCAxMCAxMHMtNCAxMC0xMCAxMFMyIDE4IDIgMTJTNiAyIDEyIDJabTAgMmMtNC40MSAwLTggMy41OS04IDhzMy41OSA4IDggOHM4LTMuNTkgOC04cy0zLjU5LTgtOC04Wm00LjUgMy41YS43NS43NSAwIDAxLjc1Ljc1Yy0uNzUuMjUtMS4yNSAxLS43NS43NXMtMSAxLjI1LS43NS43NWMtLjI1LjI1LS43NS43NS0uNzUuNzVjMCAuNzUuNzUuNzUuNzUuNzVjLjI1LS41Ljc1LS43NS43NS0uNzVTMTYuNSA3LjUgMTYuNSA3LjVabS00LjUgMmEzLjUgMy41IDAgMTEzLjUgMy41QTMuNSAzLjUgMCAwMTEyIDkuNVoiLz48L3N2Zz4=',
  youtube:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cGF0aCBmaWxsPSIjZmYwMDAwIiBkPSJNMjMuNSA2LjVxLS41LTIuNS0yLjUtMy03Ljctby05LTEtNyAuMy05IDFRMSA0IC41IDYuNVQwIDEycy41IDQgLjUgNS41cTUuNSAyLjUgMy41IDcgMSAxLjMgOSAxdC0gOS0xcS0yLjItLjUtMi41LTcgLjUtMy41Ljk1LS41LTUuNVptLTE0IDEwLjV2LTcuNUwxNiAxMmwtNi41IDdaIi8+PC9zdmc+',
  github:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cGF0aCBmaWxsPSIjMTgxNzE3IiBkPSJNMTIgLjVDNS43My41LjUgNS4yNC41IDExLjVjMCA0Ljg2IDMuMTUgOC45OCA3LjUyIDEwLjQ0Yy41NS4xMi43NS0uMjcuNzUtLjU2di0xLjk3Yy0zLjAxLjY2LTMuNjQtMS4yOS0zLjY0LTEuMjlxLS40OS0xLjI1LTEuMi0xLjU3Yy0uOTktLjY3LjA4LS42Ni4wOC0uNjZjMS4xLjA4IDEuNjcgMS4xMyAxLjY3IDEuMTNjLjk3IDEuNjcgMi41NyAxLjE5IDMuMi45MWMuMS0uNzEuMzgtMS4xOS42OS0xLjQ2Yy0yLjQtLjI3LTQuOTItMS4yLTQuOTItNS4zNGMwLTEuMTguNDItMi4xNCAxLjEyLTIuOWMtLjExLS4yOC0uNDgtMS40MS4xLTIuOTRjMCAwIC45MS0uMjkgMyAxLjFjLjg2LS4yNCAxLjgtLjM2IDIuNzMtLjM2YzkzIDAgMS44Ny4xMiAyLjczLjM2YzIuMS0xLjQgMy0xLjEgMy0xLjFjLjU5IDEuNTMuMjEgMi42Ni4xIDIuOTRjLjY5Ljc2IDEuMTIgMS43MyAxLjEyIDIuOWMwIDQuMTYtMi41NCA1LjA3LTQuOTUgNS4zM2MuMzkuMzMuNzMuOTguNzMgMS45OHYyLjkzYzAgLjI4LjIuNjEuNzYuNTRDMjAuMzUgMjAuNzMgMjMuNSAxNi42MyAyMy41IDExLjVTMTguMjcuNSAxMiAuNVoiLz48L3N2Zz4=',
};

export function getSocialIconUrl(name: string): string | null {
  return ICONS[name] ?? null;
}

export function listSocialNetworks(): string[] {
  return Object.keys(ICONS);
}

export function registerSocialRowBlock(editor: Editor): void {
  editor.DomComponents.addType(SOCIAL_ROW_TYPE, {
    isComponent: (el) => el?.getAttribute?.('data-imgsig-type') === SOCIAL_ROW_TYPE,
    model: {
      defaults: {
        tagName: 'table',
        attributes: {
          'data-imgsig-type': SOCIAL_ROW_TYPE,
          role: 'presentation',
          cellpadding: '0',
          cellspacing: '0',
          border: '0',
          'data-imgsig-networks': 'linkedin,twitter,github',
          'data-imgsig-size': '24',
          'data-imgsig-gap': '6',
        },
        components: renderRow(['linkedin', 'twitter', 'github'], 24, 6),
        traits: [
          { type: 'text', name: 'data-imgsig-networks', label: __('Networks (comma)') },
          { type: 'number', name: 'data-imgsig-size', label: __('Icon size (px)'), min: 12, max: 48 },
          { type: 'number', name: 'data-imgsig-gap', label: __('Gap (px)'), min: 0, max: 24 },
        ],
      },
      init() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const repaint = () => {
          const attrs = self.getAttributes() as Record<string, string>;
          const names = (attrs['data-imgsig-networks'] ?? '').split(',').map((n: string) => n.trim()).filter(Boolean);
          const size = Number(attrs['data-imgsig-size'] ?? 24);
          const gap = Number(attrs['data-imgsig-gap'] ?? 6);
          self.components(renderRow(names, size, gap));
        };
        self.on('change:attributes:data-imgsig-networks', repaint);
        self.on('change:attributes:data-imgsig-size', repaint);
        self.on('change:attributes:data-imgsig-gap', repaint);
      },
    },
  });

  editor.BlockManager.add(SOCIAL_ROW_TYPE, {
    label: __('Social icons'),
    category: __('Imagina Signatures'),
    media: '<svg viewBox="0 0 24 24" width="32" height="32"><circle cx="6" cy="12" r="3" fill="#0a66c2"/><circle cx="14" cy="12" r="3" fill="#1877f2"/><circle cx="22" cy="12" r="3" fill="#e4405f"/></svg>',
    content: { type: SOCIAL_ROW_TYPE },
  });
}

interface RowComponent {
  tagName: string;
  attributes?: Record<string, string>;
  content?: string;
  components?: RowComponent[];
  [key: string]: unknown;
}

function renderRow(networks: string[], size: number, gap: number): RowComponent[] {
  const cells: RowComponent[] = [];
  networks.forEach((name, index) => {
    if (index > 0) {
      cells.push({
        tagName: 'td',
        attributes: { style: `width:${gap}px; font-size:1px; line-height:1px;` },
        content: '&nbsp;',
      });
    }
    const url = getSocialIconUrl(name);
    if (!url) return;
    cells.push({
      tagName: 'td',
      attributes: { style: 'vertical-align: middle;' },
      components: [
        {
          tagName: 'a',
          attributes: {
            href: '#',
            'data-imgsig-network': name,
            style: 'display: inline-block; line-height: 0;',
          },
          components: [
            {
              tagName: 'img',
              attributes: {
                src: url,
                alt: name,
                width: String(size),
                height: String(size),
                style: 'display: block; border: 0;',
              },
            },
          ],
        },
      ],
    });
  });
  return [
    {
      tagName: 'tbody',
      components: [
        {
          tagName: 'tr',
          components: cells,
        },
      ],
    },
  ];
}
