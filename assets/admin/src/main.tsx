// Admin pages entry point (settings, plans, users, storage, setup).
//
// Sprint 4 ships only the routing scaffold; the per-page UIs land in
// upcoming sprints.

import { __ } from '../../editor/src/i18n/helpers';
import { meApi } from '../../editor/src/api/me';

interface RouteHandler {
  (root: HTMLDivElement): Promise<void> | void;
}

const routes: Record<string, RouteHandler> = {
  dashboard: async (root) => {
    const me = await meApi.get().catch(() => null);
    root.innerHTML = `<h1>${__('Dashboard')}</h1>${
      me ? `<p>${__('Welcome,')} ${me.user.display_name}</p>` : ''
    }`;
  },
  templates: (root) => {
    root.innerHTML = `<h1>${__('Templates')}</h1>`;
  },
  plans: (root) => {
    root.innerHTML = `<h1>${__('Plans')}</h1>`;
  },
  users: (root) => {
    root.innerHTML = `<h1>${__('Users')}</h1>`;
  },
  storage: (root) => {
    root.innerHTML = `<h1>${__('Storage')}</h1>`;
  },
  settings: (root) => {
    root.innerHTML = `<h1>${__('Settings')}</h1>`;
  },
  setup: (root) => {
    root.innerHTML = `<h1>${__('Setup wizard')}</h1>`;
  },
};

async function init(): Promise<void> {
  const root = document.querySelector<HTMLDivElement>('.imagina-signatures-app');
  if (!root) return;
  const route = root.dataset.route ?? 'dashboard';
  const handler = routes[route];
  if (handler) {
    await handler(root);
  } else {
    root.innerHTML = `<p>${__('Unknown route')} : ${route}</p>`;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
