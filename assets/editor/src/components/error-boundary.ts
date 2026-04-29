// Global error capture + fallback render. Hooks `window.onerror` and
// `unhandledrejection` so any uncaught failure inside the SPA shows a
// friendly message instead of a blank screen.

import { __ } from '../i18n/helpers';
import { toast } from './toast';

export function installErrorBoundary(root: HTMLElement): void {
  const handler = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[imagina-signatures]', error);
    toast(__('Something went wrong: ') + message, 'error', { duration: 6000 });
    if (root.childElementCount === 0) {
      const wrap = document.createElement('div');
      wrap.setAttribute('role', 'alert');
      wrap.style.padding = '32px';
      wrap.style.textAlign = 'center';
      wrap.style.color = '#991b1b';
      wrap.innerHTML = `<h2>${__('Editor failed to load')}</h2><p>${__('Reload the page or contact support.')}</p>`;
      root.appendChild(wrap);
    }
  };

  window.addEventListener('error', (event) => handler(event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => handler(event.reason));
}
