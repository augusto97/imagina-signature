import { useState, type FC } from 'react';
import { Cloud, Palette, FileText, Megaphone, Globe, Mail, IdCard, Send } from 'lucide-react';
import { Topbar } from '@admin/components/Topbar';
import { getConfig } from '@admin/api';
import { __ } from '@admin/i18n';
import { cn } from '@admin/utils/cn';
import { StorageTab } from './settings/StorageTab';
import { BrandingTab } from './settings/BrandingTab';
import { ComplianceTab } from './settings/ComplianceTab';
import { CampaignsTab } from './settings/CampaignsTab';
import { FrontendTab } from './settings/FrontendTab';
import { GoogleWorkspaceTab } from './settings/GoogleWorkspaceTab';
import { Microsoft365Tab } from './settings/Microsoft365Tab';
import { ProfileFieldsTab } from './settings/ProfileFieldsTab';
import { InvitationsTab } from './settings/InvitationsTab';

type Tab =
  | 'storage'
  | 'branding'
  | 'compliance'
  | 'campaigns'
  | 'frontend'
  | 'google'
  | 'microsoft365'
  | 'profile_fields'
  | 'invitations';

/** Labels / descriptions are lazy so they translate at render time. */
const TABS: Array<{ id: Tab; label: () => string; icon: typeof Cloud; description: () => string }> =
  [
    {
      id: 'storage',
      label: () => __('Storage'),
      icon: Cloud,
      description: () =>
        __('Pick where uploaded images live: WordPress Media Library or any S3-compatible bucket.'),
    },
    {
      id: 'branding',
      label: () => __('Brand kit'),
      icon: Palette,
      description: () =>
        __(
          'Company details, social profiles, typography and colours shared by every signature, plus the brand palette shown in every editor color picker.',
        ),
    },
    {
      id: 'compliance',
      label: () => __('Compliance'),
      icon: FileText,
      description: () =>
        __('Optional HTML footer appended to every signature on export (GDPR / CAN-SPAM).'),
    },
    {
      id: 'campaigns',
      label: () => __('Campaigns'),
      icon: Megaphone,
      description: () =>
        __(
          'Promotional banners auto-injected at the bottom of every signature, with optional date scheduling and random rotation across active entries.',
        ),
    },
    {
      id: 'frontend',
      label: () => __('Frontend'),
      icon: Globe,
      description: () =>
        __(
          'Expose the editor on a public-facing URL so non-admin users (e.g. subscribers) can manage their own signatures without entering wp-admin.',
        ),
    },
    {
      id: 'profile_fields',
      label: () => __('Profile fields'),
      icon: IdCard,
      description: () =>
        __('Where each employee profile field comes from, plus your own custom fields.'),
    },
    {
      id: 'invitations',
      label: () => __('Invitations'),
      icon: Send,
      description: () =>
        __(
          'Email every employee a personal link to install their signature in a minute, follow the progress and set up reminders.',
        ),
    },
    {
      id: 'google',
      label: () => __('Google Workspace'),
      icon: Mail,
      description: () =>
        __(
          'Deploy every employee’s signature to Gmail with one click, through a service account with domain-wide delegation.',
        ),
    },
    {
      id: 'microsoft365',
      label: () => __('Microsoft 365'),
      icon: Mail,
      description: () =>
        __(
          "Deploy every employee's signature to Outlook with an add-in, or generate an Exchange Online mail flow rule.",
        ),
    },
  ];

/**
 * Tabs whose endpoints need `imgsig_manage_team` (1.3.0): hidden — not
 * rendered at all — for someone who can open Settings
 * (`imgsig_manage_storage`) but doesn't manage the team.
 */
const TEAM_TABS: Tab[] = ['google', 'microsoft365', 'profile_fields', 'invitations'];

/** The tabs this user may see. */
function visibleTabs(canManageTeam: boolean): Tab[] {
  return TABS.map((t) => t.id).filter((id) => canManageTeam || !TEAM_TABS.includes(id));
}

/**
 * Settings host — tabs: Storage, Brand kit, Compliance, Campaigns,
 * Frontend, and for team managers Google Workspace, Microsoft 365,
 * Profile fields and Invitations. Each tab is its own component owning
 * its own data fetch / save flow, so a slow storage round-trip never
 * blocks the branding tab.
 */
export const SettingsPage: FC = () => {
  const [tab, setTab] = useState<Tab>('storage');
  const caps = getConfig().capabilities;
  const allowed = visibleTabs(caps.manage_team === true);
  const tabs = TABS.filter((t) => allowed.includes(t.id));
  const active = tabs.find((t) => t.id === tab) ?? tabs[0]!;

  const groups: Array<{ key: string; title: string; tabs: typeof tabs }> = [
    {
      key: 'general',
      title: __('General'),
      tabs: tabs.filter((t) => !TEAM_TABS.includes(t.id)),
    },
    {
      key: 'team',
      title: __('Team & deployment'),
      tabs: tabs.filter((t) => TEAM_TABS.includes(t.id)),
    },
  ].filter((g) => g.tabs.length > 0);

  return (
    <div className="flex h-full flex-col">
      <Topbar title={__('Settings')} description={active.description()} />

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 lg:flex-row lg:items-start">
          {/* Grouped navigation: a column beside the content on wide
              screens, wrapping rows above it on narrow ones. Nine tabs
              in one bar overflowed (and Spanish labels are longer). */}
          <nav
            aria-label={__('Settings sections')}
            className="flex shrink-0 flex-col gap-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] p-2 lg:sticky lg:top-0 lg:w-56"
          >
            {groups.map((group) => (
              <div key={group.key} className="flex flex-col gap-1">
                <span className="px-2 pt-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {group.title}
                </span>
                <div className="flex flex-wrap gap-1 lg:flex-col">
                  {group.tabs.map(({ id, label, icon: Icon }) => {
                    const isActive = id === active.id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setTab(id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors lg:w-full',
                          isActive
                            ? 'bg-[var(--bg-selected)] text-[var(--accent)]'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                        )}
                      >
                        <Icon size={14} className="shrink-0" />
                        {label()}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="min-w-0 flex-1 space-y-4">
            {active.id === 'storage' && <StorageTab />}
            {active.id === 'branding' && <BrandingTab />}
            {active.id === 'compliance' && <ComplianceTab />}
            {active.id === 'campaigns' && <CampaignsTab />}
            {active.id === 'frontend' && <FrontendTab />}
            {active.id === 'google' && <GoogleWorkspaceTab />}
            {active.id === 'microsoft365' && <Microsoft365Tab />}
            {active.id === 'profile_fields' && <ProfileFieldsTab />}
            {active.id === 'invitations' && <InvitationsTab />}
          </div>
        </div>
      </div>
    </div>
  );
};
