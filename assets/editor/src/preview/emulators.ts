// Email-client emulators wrap the compiled HTML in client-specific
// chrome and CSS quirks. They produce the HTML string for an iframe
// — the editor injects it via srcdoc.

import { __ } from '../i18n/helpers';

export type EmulatorId = 'gmail' | 'outlook' | 'apple_mail';

export interface EmulatorDescriptor {
  id: EmulatorId;
  label: string;
  width: number;
  background: string;
  /**
   * Wraps the signature HTML inside the client's reading-pane chrome.
   */
  render: (signatureHtml: string, options: { darkMode: boolean }) => string;
}

const baseStyles = (background: string, darkMode: boolean): string => `
<style>
  body { margin: 0; padding: 16px; background: ${background}; color: ${darkMode ? '#e5e7eb' : '#111827'}; font-family: -apple-system, Segoe UI, Roboto, sans-serif; }
  .is-message { background: ${darkMode ? '#1f2937' : '#ffffff'}; border-radius: 8px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
  .is-from { font-weight: 600; margin-bottom: 4px; }
  .is-divider { border: 0; border-top: 1px solid ${darkMode ? '#374151' : '#e5e7eb'}; margin: 12px 0; }
</style>
`;

export const EMULATORS: EmulatorDescriptor[] = [
  {
    id: 'gmail',
    label: 'Gmail',
    width: 760,
    background: '#f6f8fc',
    render: (html, { darkMode }) => `<!doctype html><html><head><meta charset="utf-8">${baseStyles('#f6f8fc', darkMode)}</head><body>
      <div class="is-message">
        <div class="is-from">${__('Jane Doe')} &lt;jane@example.com&gt;</div>
        <div>${__('Hi team — just sharing the latest update.')}</div>
        <hr class="is-divider" />
        ${html}
      </div></body></html>`,
  },
  {
    id: 'outlook',
    label: 'Outlook',
    width: 720,
    background: '#faf9f8',
    render: (html, { darkMode }) => `<!doctype html><html><head><meta charset="utf-8">${baseStyles('#faf9f8', darkMode)}</head><body>
      <!--[if mso]><table role="presentation" width="100%"><tr><td><![endif]-->
      <div class="is-message">
        <div class="is-from">${__('Jane Doe')}</div>
        <div>${__('Quick note before the meeting.')}</div>
        <hr class="is-divider" />
        ${html}
      </div>
      <!--[if mso]></td></tr></table><![endif]-->
    </body></html>`,
  },
  {
    id: 'apple_mail',
    label: 'Apple Mail',
    width: 700,
    background: '#ffffff',
    render: (html, { darkMode }) => `<!doctype html><html><head><meta charset="utf-8">${baseStyles('#ffffff', darkMode)}</head><body>
      <div class="is-message">
        <div class="is-from">${__('Jane Doe')}</div>
        <div>${__('Sent from my Mac.')}</div>
        <hr class="is-divider" />
        ${html}
      </div>
    </body></html>`,
  },
];

export function findEmulator(id: EmulatorId): EmulatorDescriptor | undefined {
  return EMULATORS.find((e) => e.id === id);
}
