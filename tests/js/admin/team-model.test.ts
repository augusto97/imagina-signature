import { describe, expect, it } from 'vitest';
import {
  counters,
  editorUrl,
  gmailPill,
  gmailTargets,
  htmlPill,
  installPill,
  invitationTargets,
  linkLabel,
  outlookPill,
  stateFilters,
} from '@admin/pages/team/model';
import type { TeamRow, TeamSummary } from '@admin/pages/team/types';

function row(overrides: Partial<TeamRow> = {}): TeamRow {
  return {
    id: 7,
    display_name: 'María López',
    email: 'maria@acme.test',
    roles: ['author'],
    groups: [],
    avatar: '',
    can_use: true,
    signature_count: 1,
    primary: {
      id: 70,
      name: 'Main',
      status: 'ready',
      template_id: 4,
      template_name: 'Corporate',
      link: 'linked',
      updated_at: '2026-11-05 10:00:00',
      compiled_at: '2026-11-05 10:00:00',
      marked: true,
    },
    html: { state: 'fresh', compiled_at: '2026-11-05 10:00:00' },
    gmail: { state: 'never', at: null, message: '' },
    outlook: { state: 'never', at: null },
    install: {
      state: 'none',
      invited_at: null,
      opened_at: null,
      installed_at: null,
      client: null,
      reminders: 0,
    },
    ...overrides,
  };
}

const summary: TeamSummary = {
  users: 10,
  with_signature: 8,
  without_signature: 2,
  outdated_html: 3,
  gmail_pushed: 5,
  gmail_failed: 1,
  outlook_delivered: 4,
  installed: 2,
  install_outdated: 1,
  not_installed: 5,
  stale_signatures: 4,
};

describe('team console row model', () => {
  it('labels the primary signature’s link to its template', () => {
    expect(linkLabel(row().primary!)).toBe('Linked to Corporate');
    expect(linkLabel({ ...row().primary!, link: 'copy' })).toBe('Copy of Corporate');
    expect(linkLabel({ ...row().primary!, link: 'none', template_id: null })).toBe('Own design');
    expect(linkLabel({ ...row().primary!, template_name: '' })).toBe('Linked to a template');
  });

  it('shows the HTML state with its compile time', () => {
    expect(htmlPill(row())).toMatchObject({ tone: 'success', label: 'Up to date' });
    expect(htmlPill(row()).detail).toMatch(/^Compiled /);
    expect(htmlPill(row({ html: { state: 'outdated', compiled_at: null } }))).toMatchObject({
      tone: 'warning',
      label: 'Outdated',
    });
    expect(htmlPill(row({ html: { state: 'none', compiled_at: null } }))).toMatchObject({
      tone: 'danger',
      label: 'Not compiled',
    });
    expect(htmlPill(row({ primary: null })).label).toBe('—');
  });

  it('shows every Gmail state, with the failure message', () => {
    expect(
      gmailPill(row({ gmail: { state: 'not_configured', at: null, message: '' } })).label,
    ).toBe('Not connected');
    expect(gmailPill(row()).label).toBe('Never pushed');
    expect(
      gmailPill(row({ gmail: { state: 'pushed', at: '2026-11-05 10:05:00', message: '' } })),
    ).toMatchObject({ tone: 'success', label: 'Pushed' });
    expect(
      gmailPill(row({ gmail: { state: 'failed', at: null, message: 'Delegation is missing.' } })),
    ).toEqual({ tone: 'danger', label: 'Failed', detail: 'Delegation is missing.' });
    expect(
      gmailPill(row({ gmail: { state: 'outdated', at: null, message: 'Needs recompile' } })).detail,
    ).toBe('Needs recompile');
    expect(
      gmailPill(row({ gmail: { state: 'skipped', at: null, message: 'Other domain' } })),
    ).toMatchObject({
      tone: 'info',
      detail: 'Other domain',
    });
  });

  it('shows the Outlook add-in and install link states', () => {
    expect(outlookPill(row({ outlook: { state: 'not_configured', at: null } })).label).toBe(
      'Add-in off',
    );
    expect(
      outlookPill(row({ outlook: { state: 'delivered', at: '2026-11-05 09:00:00' } })).tone,
    ).toBe('success');
    expect(outlookPill(row({ outlook: { state: 'outdated', at: null } })).label).toBe('Outdated');

    const install = row().install;
    expect(installPill(row()).label).toBe('Not invited');
    expect(
      installPill(
        row({ install: { ...install, state: 'invited', invited_at: '2026-11-01 08:00:00' } }),
      ).label,
    ).toBe('Invited');
    expect(
      installPill(
        row({
          install: {
            ...install,
            state: 'invited',
            invited_at: '2026-11-01 08:00:00',
            reminders: 2,
          },
        }),
      ).detail,
    ).toMatch(/2 reminder/);
    expect(installPill(row({ install: { ...install, state: 'opened' } })).label).toBe('Opened');
    expect(installPill(row({ install: { ...install, state: 'installed' } })).tone).toBe('success');
    expect(installPill(row({ install: { ...install, state: 'outdated' } })).tone).toBe('warning');
  });

  it('builds the counter cards, with filters only where they help', () => {
    const cards = counters(summary, {
      gmail: { configured: true, auto_push: false },
      outlook: { enabled: false },
    });
    const byKey = Object.fromEntries(cards.map((c) => [c.key, c]));

    expect(byKey.users).toMatchObject({ value: '10', filter: 'all' });
    expect(byKey.without).toMatchObject({ value: '2', filter: 'no_signature', tone: 'warning' });
    expect(byKey.outdated).toMatchObject({ value: '3', filter: 'outdated' });
    expect(byKey.gmail).toMatchObject({ value: '5 of 8', filter: 'gmail_failed', tone: 'danger' });
    expect(byKey.outlook).toMatchObject({ value: 'Off', filter: null, tone: 'muted' });
    expect(byKey.installed).toMatchObject({ value: '2 of 8', filter: 'not_installed' });

    const disconnected = counters(summary, {
      gmail: { configured: false, auto_push: false },
      outlook: { enabled: true },
    });
    expect(disconnected.find((c) => c.key === 'gmail')).toMatchObject({
      value: 'Not connected',
      filter: null,
    });
  });

  it('offers every state filter once', () => {
    const values = stateFilters().map((f) => f.value);
    expect(values[0]).toBe('all');
    expect(new Set(values).size).toBe(values.length);
    expect(values).toEqual(
      expect.arrayContaining([
        'no_signature',
        'outdated',
        'gmail_failed',
        'not_installed',
        'install_outdated',
      ]),
    );
  });

  it('only targets people a bulk action makes sense for', () => {
    const rows = [
      row({ id: 1 }),
      row({ id: 2, primary: null }),
      row({ id: 3, html: { state: 'none', compiled_at: null } }),
      row({ id: 4 }),
    ];
    const selected = new Set([1, 2, 3]);

    expect(gmailTargets(rows, selected)).toEqual([1, 3]);
    expect(invitationTargets(rows, selected)).toEqual([1]);
  });

  it('links to the editor for the primary signature', () => {
    expect(
      editorUrl(
        'https://x.test/wp-admin/admin.php?page=imagina-signatures-editor&id=__ID__',
        row(),
      ),
    ).toBe('https://x.test/wp-admin/admin.php?page=imagina-signatures-editor&id=70');
    expect(editorUrl('…&id=__ID__', row({ primary: null }))).toBeNull();
  });
});
