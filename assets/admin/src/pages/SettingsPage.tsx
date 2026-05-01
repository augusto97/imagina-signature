import { useState, type FC } from 'react';
import { Cloud, Palette, FileText } from 'lucide-react';
import { Topbar } from '@admin/components/Topbar';
import { __ } from '@admin/i18n';
import { cn } from '@admin/utils/cn';
import { StorageTab } from './settings/StorageTab';
import { BrandingTab } from './settings/BrandingTab';
import { ComplianceTab } from './settings/ComplianceTab';

type Tab = 'storage' | 'branding' | 'compliance';

const TABS: Array<{ id: Tab; label: string; icon: typeof Cloud; description: string }> = [
  {
    id: 'storage',
    label: 'Storage',
    icon: Cloud,
    description: 'Pick where uploaded images live: WordPress Media Library or any S3-compatible bucket.',
  },
  {
    id: 'branding',
    label: 'Branding',
    icon: Palette,
    description: 'Site-wide brand palette shown as quick-pick swatches in every editor ColorInput.',
  },
  {
    id: 'compliance',
    label: 'Compliance',
    icon: FileText,
    description: 'Optional HTML footer appended to every signature on export (GDPR / CAN-SPAM).',
  },
];

/**
 * Settings host — three tabs: Storage, Branding, Compliance. Each
 * tab is its own component owning its own data fetch / save flow,
 * so a slow storage round-trip never blocks the branding tab.
 */
export const SettingsPage: FC = () => {
  const [tab, setTab] = useState<Tab>('storage');
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="flex h-full flex-col">
      <Topbar title={__('Settings')} description={__(active.description)} />

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
                  {__(label)}
                </button>
              );
            })}
          </div>

          {tab === 'storage' && <StorageTab />}
          {tab === 'branding' && <BrandingTab />}
          {tab === 'compliance' && <ComplianceTab />}
        </div>
      </div>
    </div>
  );
};
