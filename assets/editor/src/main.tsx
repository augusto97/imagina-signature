// Editor SPA entry point.
//
// Sprint 8 wires the polish primitives (loading, empty-state, toasts,
// error boundary) around the placeholder until the GrapesJS-based
// editor lands in a follow-up release.

import { meApi } from './api/me';
import { setMe } from './stores/userStore';
import { __ } from './i18n/helpers';
import { createSpinner } from './components/loading';
import { createEmptyState } from './components/empty-state';
import { installErrorBoundary } from './components/error-boundary';
import { toast } from './components/toast';

async function init(): Promise<void> {
  const root = document.querySelector<HTMLDivElement>('.imagina-signatures-app');
  if (!root) return;

  installErrorBoundary(root);
  root.replaceChildren(createSpinner(__('Loading editor…')));

  try {
    const me = await meApi.get();
    setMe(me);
    root.replaceChildren(
      createEmptyState({
        title: __('No signatures yet'),
        description: __(
          'The drag-and-drop editor lands in the next release. Use the Templates page in the meantime.',
        ),
        ctaLabel: __('Browse templates'),
        onCta: () => {
          const path = '../../wp-admin/admin.php?page=imagina-signatures-templates';
          window.location.href = path;
        },
      }),
    );
  } catch (error) {
    toast(__('Could not load user info.'), 'error');
    throw error;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
