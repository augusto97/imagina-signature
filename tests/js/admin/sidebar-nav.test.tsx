import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarNav } from '@admin/components/SidebarNav';

function config(extra: Record<string, unknown>): void {
  (globalThis as unknown as { IMGSIG_ADMIN_CONFIG: unknown }).IMGSIG_ADMIN_CONFIG = {
    page: 'signatures',
    userId: 1,
    capabilities: { use: true, manage_templates: true, manage_storage: true, manage_team: true },
    apiBase: 'http://localhost/wp-json/imagina-signatures/v1',
    restNonce: 'n',
    locale: 'en_US',
    wpAdminUrl: 'http://localhost/wp-admin/',
    urls: {
      signatures: '/sig',
      templates: '/tpl',
      settings: '/set',
      editor: '/ed?id=__ID__',
      profile: '/profile',
      groups: '/groups',
    },
    ...extra,
  };
}

afterEach(() => {
  delete (globalThis as unknown as { IMGSIG_ADMIN_CONFIG?: unknown }).IMGSIG_ADMIN_CONFIG;
});

const labels = (): string[] => screen.getAllByRole('link').map((a) => a.textContent ?? '');

describe('SidebarNav', () => {
  it('shows My profile to everyone and Groups to team managers', () => {
    config({});
    render(<SidebarNav page="groups" />);
    expect(labels()).toEqual([
      'My Signatures',
      'My profile',
      'Templates',
      'Groups',
      'Settings',
      'Back to WP Admin',
    ]);
    expect(screen.getByRole('link', { name: 'Groups' })).toHaveAttribute('href', '/groups');
  });

  it('hides Groups without manage_team and items a host does not route', () => {
    config({
      capabilities: { use: true, manage_templates: false, manage_storage: false },
      urls: { signatures: '/sig', templates: '/tpl', settings: '/set', editor: '/ed' },
    });
    render(<SidebarNav page="signatures" />);
    expect(labels()).toEqual(['My Signatures', 'Back to WP Admin']);
  });

  it('keeps only My Signatures and My profile on the public route', () => {
    config({ frontendContext: 'public' });
    render(<SidebarNav page="profile" />);
    expect(labels()).toEqual(['My Signatures', 'My profile', 'Back to home']);
  });
});
