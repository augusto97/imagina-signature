import { useState, type FC } from 'react';
import { Cloud, Palette, FileText, Megaphone, Globe, Mail } from 'lucide-react';
import { Topbar } from '@admin/components/Topbar';
import { __ } from '@admin/i18n';
import { cn } from '@admin/utils/cn';
import { StorageTab } from './settings/StorageTab';
import { BrandingTab } from './settings/BrandingTab';
import { ComplianceTab } from './settings/ComplianceTab';
import { CampaignsTab } from './settings/CampaignsTab';
import { FrontendTab } from './settings/FrontendTab';
import { Microsoft365Tab } from './settings/Microsoft365Tab';

type Tab = 'storage' | 'branding' | 'compliance' | 'campaigns' | 'frontend' | 'microsoft365';

/** Labels / descriptions are lazy so they translate at render time. */
const TABS: Array<{ id: Tab; label: () => string; icon: typeof Cloud; description: () => string }> = [
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
      __('Promotional banners auto-injected at the bottom of every signature, with optional date scheduling and random rotation across active entries.'),
  },
  {
    id: 'frontend',
    label: () => __('Frontend'),
    icon: Globe,
    description: () =>
      __('Expose the editor on a public-facing URL so non-admin users (e.g. subscribers) can manage their own signatures without entering wp-admin.'),
  },
  {
    id: 'microsoft365',
    label: () => __('Microsoft 365'),
    icon: Mail,
    description: () =>
      __("Deploy every employee's signature to Outlook with an add-in, or generate an Exchange Online mail flow rule."),
  },
];

/**
 * Settings host — tabs: Storage, Brand kit, Compliance, Campaigns,
 * Frontend. Each
 * tab is its own component owning its own data fetch / save flow,
 * so a slow storage round-trip never blocks the branding tab.
 */
export const SettingsPage: FC = () => {
  const [tab, setTab] = useState<Tab>('storage');
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="flex h-full flex-col">
      <Topbar title={__('Settings')} description={active.description()} />

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="flex gap-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] p-1 text-[12.5px]">
            {TABS.map(({ id, label, icon: Icon }) => {
              const isActive = id === tab;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors',
                    isActive
                      ? 'bg-[var(--bg-selected)] text-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                  )}
                >
                  <Icon size={14} />
                  {label()}
                </button>
              );
            })}
          </div>

          {tab === 'storage' && <StorageTab />}
          {tab === 'branding' && <BrandingTab />}
          {tab === 'compliance' && <ComplianceTab />}
          {tab === 'campaigns' && <CampaignsTab />}
          {tab === 'frontend' && <FrontendTab />}
          {tab === 'microsoft365' && <Microsoft365Tab />}
        </div>
      </div>
    </div>
  );
};
