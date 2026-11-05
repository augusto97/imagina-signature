import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SettingsPage } from '@admin/pages/SettingsPage';

const API = 'http://localhost/wp-json/imagina-signatures/v1';
let urls: string[] = [];

function setConfig(manageTeam: boolean): void {
  (globalThis as unknown as { IMGSIG_ADMIN_CONFIG: unknown }).IMGSIG_ADMIN_CONFIG = {
    page: 'settings',
    userId: 1,
    capabilities: {
      use: true,
      manage_templates: true,
      manage_storage: true,
      manage_team: manageTeam,
    },
    apiBase: API,
    restNonce: 'n',
    locale: 'en_US',
    wpAdminUrl: 'http://localhost/wp-admin/',
    urls: { signatures: '', templates: '', settings: '', editor: '' },
  };
}

beforeEach(() => {
  urls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(String(url));
      return new Response(
        JSON.stringify({
          driver: 'media_library',
          available: ['media_library'],
          config: {},
          has_access_key: false,
          has_secret_key: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (globalThis as unknown as { IMGSIG_ADMIN_CONFIG?: unknown }).IMGSIG_ADMIN_CONFIG;
});

const TEAM_TABS = ['Google Workspace', 'Microsoft 365', 'Profile fields', 'Invitations'];

describe('Settings — team-only tabs', () => {
  it('hides the deployment and directory tabs from a storage admin who does not manage the team', () => {
    setConfig(false);
    render(<SettingsPage />);

    for (const label of TEAM_TABS) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Storage' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Campaigns' })).toBeInTheDocument();
    expect(urls.some((u) => /\/admin\/(deploy|outlook|profile-fields|groups)/.test(u))).toBe(false);
  });

  it('shows them to team managers', () => {
    setConfig(true);
    render(<SettingsPage />);

    for (const label of TEAM_TABS) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });
});
