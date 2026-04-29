/** @jsxImportSource preact */

import '../../styles/editor.css';

import { render } from 'preact';
import { JSX } from 'preact';
import { Suspense, lazy } from 'preact/compat';
import { useEffect } from 'preact/hooks';
import { AppShell } from './components/AppShell';
import { useRouter, navigate } from './router';
import { __ } from './i18n/helpers';

const SignaturesPage = lazy(() => import('./pages/SignaturesPage').then((m) => ({ default: m.SignaturesPage })));
const EditorPage = lazy(() => import('./pages/EditorPage').then((m) => ({ default: m.EditorPage })));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage').then((m) => ({ default: m.TemplatesPage })));

function App({ initialRoute }: { initialRoute: string }): JSX.Element {
  const route = useRouter();

  // First mount: convert WordPress page route into a hash route. Run as soon
  // as the SPA boots — do NOT wait for /me to resolve, so the user isn't
  // stuck on the loading spinner if the REST endpoint is unreachable.
  useEffect(() => {
    if (route.path !== '/') return;
    const map: Record<string, string> = {
      dashboard: '/signatures',
      editor: '/editor',
      templates: '/templates',
    };
    navigate(map[initialRoute] ?? '/signatures');
  }, [route.path, initialRoute]);

  return (
    <AppShell>
      <Suspense fallback={<Loading />}>
        {route.path === '/' && <Loading />}
        {route.path === '/signatures' && <SignaturesPage />}
        {route.path === '/editor' && <EditorPage signatureId={Number(route.query.get('id') ?? 0)} />}
        {route.path === '/templates' && <TemplatesPage />}
        {!['/', '/signatures', '/editor', '/templates'].includes(route.path) && <NotFound />}
      </Suspense>
    </AppShell>
  );
}

function Loading(): JSX.Element {
  return (
    <div className="is-flex is-items-center is-justify-center is-py-24" role="status" aria-live="polite">
      <span className="is-inline-block is-w-6 is-h-6 is-rounded-full is-border-2 is-border-brand-600 is-border-t-transparent is-animate-spin" />
      <span className="is-ml-3 is-text-slate-600">{__('Loading…')}</span>
    </div>
  );
}

function NotFound(): JSX.Element {
  return (
    <div className="is-py-24 is-text-center is-text-slate-500">
      <h2 className="is-text-xl is-font-semibold is-text-slate-700">{__('Page not found')}</h2>
      <p className="is-mt-2">{__('The route you tried to open does not exist.')}</p>
    </div>
  );
}

const root = document.querySelector<HTMLDivElement>('.imagina-signatures-app');
if (root) {
  const initialRoute = root.dataset.route ?? 'dashboard';
  render(<App initialRoute={initialRoute} />, root);
}
