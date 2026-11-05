/**
 * Team console row model (1.3.0): how each state of a `GET /admin/team`
 * row is shown, which filters exist and what the actions can target.
 * Pure — the page component only renders what these return.
 */

import { __ } from '@admin/i18n';
import type { TeamChannels, TeamPrimary, TeamRow, TeamStateFilter, TeamSummary } from './types';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted';

/** What a status cell shows. */
export interface Pill {
  tone: Tone;
  label: string;
  /** Tooltip / second line: when, and why for failures. */
  detail: string;
}

/** "Y-m-d H:i:s" UTC from the server → the viewer's local date and time ('' when empty). */
export function formatUtc(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function when(label: string, value: string | null | undefined): string {
  const formatted = formatUtc(value);
  return formatted ? `${label} ${formatted}` : '';
}

/** "Linked to Corporate" / "Copy of Corporate" / "Own design". */
export function linkLabel(primary: TeamPrimary): string {
  const template = primary.template_name || __('a template');
  if (primary.link === 'linked') return __('Linked to %s', template);
  if (primary.link === 'copy') return __('Copy of %s', template);
  return __('Own design');
}

/** The HTML the server holds for the primary signature. */
export function htmlPill(row: TeamRow): Pill {
  if (!row.primary) return { tone: 'muted', label: '—', detail: '' };
  switch (row.html.state) {
    case 'fresh':
      return {
        tone: 'success',
        label: __('Up to date'),
        detail: when(__('Compiled'), row.html.compiled_at),
      };
    case 'outdated':
      return {
        tone: 'warning',
        label: __('Outdated'),
        detail: __(
          'The design, the person’s details or the company settings changed after it was compiled.',
        ),
      };
    default:
      return {
        tone: 'danger',
        label: __('Not compiled'),
        detail: __('Never saved from the editor — recompile it or open and save it.'),
      };
  }
}

export function gmailPill(row: TeamRow): Pill {
  if (row.gmail.state === 'not_configured') {
    return { tone: 'muted', label: __('Not connected'), detail: '' };
  }
  if (!row.primary) return { tone: 'muted', label: '—', detail: '' };
  switch (row.gmail.state) {
    case 'pushed':
      return { tone: 'success', label: __('Pushed'), detail: when(__('Pushed'), row.gmail.at) };
    case 'outdated':
      return {
        tone: 'warning',
        label: __('Outdated'),
        detail: row.gmail.message || when(__('Last pushed'), row.gmail.at),
      };
    case 'failed':
      return { tone: 'danger', label: __('Failed'), detail: row.gmail.message };
    case 'skipped':
      return { tone: 'info', label: __('Skipped'), detail: row.gmail.message };
    default:
      return { tone: 'muted', label: __('Never pushed'), detail: '' };
  }
}

export function outlookPill(row: TeamRow): Pill {
  if (row.outlook.state === 'not_configured') {
    return { tone: 'muted', label: __('Add-in off'), detail: '' };
  }
  if (!row.primary) return { tone: 'muted', label: '—', detail: '' };
  switch (row.outlook.state) {
    case 'delivered':
      return {
        tone: 'success',
        label: __('In use'),
        detail: when(__('Last fetched'), row.outlook.at),
      };
    case 'outdated':
      return {
        tone: 'warning',
        label: __('Outdated'),
        detail: when(__('Last fetched'), row.outlook.at),
      };
    default:
      return { tone: 'muted', label: __('Not seen yet'), detail: '' };
  }
}

export function installPill(row: TeamRow): Pill {
  if (!row.primary) return { tone: 'muted', label: '—', detail: '' };
  const install = row.install;
  switch (install.state) {
    case 'installed':
      return {
        tone: 'success',
        label: __('Installed'),
        detail: when(__('Installed'), install.installed_at),
      };
    case 'outdated':
      return {
        tone: 'warning',
        label: __('Outdated'),
        detail: __('Installed before the latest change — invite them again.'),
      };
    case 'opened':
      return { tone: 'info', label: __('Opened'), detail: when(__('Opened'), install.opened_at) };
    case 'invited':
      return {
        tone: 'info',
        label: __('Invited'),
        detail:
          install.reminders > 0
            ? __(
                '%1$s · %2$s reminder(s)',
                formatUtc(install.invited_at),
                String(install.reminders),
              )
            : when(__('Invited'), install.invited_at),
      };
    default:
      return { tone: 'muted', label: __('Not invited'), detail: '' };
  }
}

/** The `state` filter options, labels translated at render time. */
export function stateFilters(): Array<{ value: TeamStateFilter; label: string }> {
  return [
    { value: 'all', label: __('Everyone') },
    { value: 'no_signature', label: __('Without a signature') },
    { value: 'outdated', label: __('Outdated HTML') },
    { value: 'up_to_date', label: __('HTML up to date') },
    { value: 'gmail_failed', label: __('Gmail push failed') },
    { value: 'not_installed', label: __('Not installed yet') },
    { value: 'install_outdated', label: __('Installed, but outdated') },
  ];
}

/** One counter card. */
export interface Counter {
  key: string;
  label: string;
  value: string;
  /** Filter the card applies when clicked (null = none). */
  filter: TeamStateFilter | null;
  tone: Tone;
}

/** The counter cards above the table. */
export function counters(summary: TeamSummary, channels: TeamChannels): Counter[] {
  const outOf = (value: number): string =>
    __('%1$s of %2$s', String(value), String(summary.with_signature));
  return [
    {
      key: 'users',
      label: __('People'),
      value: String(summary.users),
      filter: 'all',
      tone: 'info',
    },
    {
      key: 'without',
      label: __('Without a signature'),
      value: String(summary.without_signature),
      filter: 'no_signature',
      tone: summary.without_signature > 0 ? 'warning' : 'success',
    },
    {
      key: 'outdated',
      label: __('Outdated HTML'),
      value: String(summary.outdated_html),
      filter: 'outdated',
      tone: summary.outdated_html > 0 ? 'warning' : 'success',
    },
    {
      key: 'gmail',
      label: __('In Gmail'),
      value: channels.gmail.configured ? outOf(summary.gmail_pushed) : __('Not connected'),
      filter: channels.gmail.configured && summary.gmail_failed > 0 ? 'gmail_failed' : null,
      tone: !channels.gmail.configured ? 'muted' : summary.gmail_failed > 0 ? 'danger' : 'success',
    },
    {
      key: 'outlook',
      label: __('Outlook add-in'),
      value: channels.outlook.enabled ? outOf(summary.outlook_delivered) : __('Off'),
      filter: null,
      tone: channels.outlook.enabled ? 'success' : 'muted',
    },
    {
      key: 'installed',
      label: __('Installed by hand'),
      value: outOf(summary.installed),
      filter: 'not_installed',
      tone: summary.install_outdated > 0 ? 'warning' : 'success',
    },
  ];
}

/** Users the "Push to Gmail" action can send: they have a signature. */
export function gmailTargets(rows: TeamRow[], selected: ReadonlySet<number>): number[] {
  return rows.filter((r) => selected.has(r.id) && r.primary !== null).map((r) => r.id);
}

/** Users an invitation makes sense for: they have a signature with compiled HTML. */
export function invitationTargets(rows: TeamRow[], selected: ReadonlySet<number>): number[] {
  return rows
    .filter((r) => selected.has(r.id) && r.primary !== null && r.html.state !== 'none')
    .map((r) => r.id);
}

/** Editor URL of the user's primary signature, or null. */
export function editorUrl(pattern: string, row: TeamRow): string | null {
  if (!row.primary || !pattern) return null;
  return pattern.replace('__ID__', String(row.primary.id));
}
