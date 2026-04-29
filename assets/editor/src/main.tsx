// Editor SPA entry point.
//
// Sprint 4 ships only the mount infrastructure — the GrapesJS-backed
// editor UI lands in subsequent sprints. The bundle currently renders a
// placeholder so site administrators can verify enqueue + bootstrap data.

import { meApi } from './api/me';
import { setMe } from './stores/userStore';
import { __ } from './i18n/helpers';

async function init(): Promise<void> {
  const root = document.querySelector<HTMLDivElement>('.imagina-signatures-app');
  if (!root) return;

  root.innerHTML = `<div class="is-loading" role="status">${__('Loading…')}</div>`;

  try {
    const me = await meApi.get();
    setMe(me);
    root.innerHTML = `
      <section class="is-app-placeholder">
        <h1>${__('Imagina Signatures')}</h1>
        <p>${__('Editor scaffolding ready. UI lands in upcoming sprints.')}</p>
        <pre>${JSON.stringify({ user: me.user.display_name, plan: me.plan.name }, null, 2)}</pre>
      </section>
    `;
  } catch (error) {
    root.innerHTML = `<div class="is-error" role="alert">${__('Could not load user info.')}</div>`;
    console.error(error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
