/** @jsxImportSource preact */

import '../../styles/admin.css';

import { render } from 'preact';
import { JSX } from 'preact';
import { Toaster } from '../../editor/src/components/ui/Toaster';
import { __ } from '../../editor/src/i18n/helpers';
import { SetupWizardPage } from './pages/SetupWizardPage';
import { PlansPage } from './pages/PlansPage';
import { UsersPage } from './pages/UsersPage';
import { StoragePage } from './pages/StoragePage';
import { SettingsPage } from './pages/SettingsPage';

function renderRoute(route: string): JSX.Element {
  switch (route) {
    case 'setup':
      return <SetupWizardPage />;
    case 'plans':
      return <PlansPage />;
    case 'users':
      return <UsersPage />;
    case 'storage':
      return <StoragePage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return (
        <div className="is-py-24 is-text-center is-text-slate-500">
          <h2 className="is-text-xl is-font-semibold is-text-slate-700">{__('Unknown route')}</h2>
        </div>
      );
  }
}

const root = document.querySelector<HTMLDivElement>('.imagina-signatures-app');
if (root) {
  const route = root.dataset.route ?? 'dashboard';
  render(
    <div className="imagina-signatures-app is-min-h-[calc(100vh-32px)] is-bg-slate-50 is-text-slate-900">
      {renderRoute(route)}
      <Toaster />
    </div>,
    root,
  );
}
