import type { FC } from 'react';
import { FileSignature, LayoutTemplate, Settings, ExternalLink } from 'lucide-react';
import { __ } from '@admin/i18n';
import { getConfig } from '@admin/api';
import { cn } from '@admin/utils/cn';
import type { AdminConfig } from '@admin/types';

type PageKey = AdminConfig['page'];

interface NavItem {
  key: PageKey;
  label: string;
  icon: typeof FileSignature;
  href: keyof AdminConfig['urls'];
  requiresCap?: keyof AdminConfig['capabilities'];
}

const NAV: NavItem[] = [
  { key: 'signatures', label: 'My Signatures', icon: FileSignature, href: 'signatures' },
  {
    key: 'templates',
    label: 'Templates',
    icon: LayoutTemplate,
    href: 'templates',
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: Settings,
    href: 'settings',
    requiresCap: 'manage_storage',
  },
];

interface Props {
  page: PageKey;
}

/**
 * Left navigation rail — replaces the wp-admin side menu while the
 * React app is mounted.
 *
 * Items hide when the current user lacks the corresponding plugin
 * capability so a non-admin author doesn't see (and 403 against)
 * the storage settings page.
 */
export const SidebarNav: FC<Props> = ({ page }) => {
  const config = getConfig();

  const visible = NAV.filter(
    (item) => !item.requiresCap || config.capabilities[item.requiresCap],
  );

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-sidebar)]">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--border-default)] px-4">
        <span
          aria-hidden
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)] text-white"
        >
          <FileSignature size={15} />
        </span>
        <span className="text-[14px] font-semibold tracking-tight text-[var(--text-primary)]">
          {__('Imagina Signatures')}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {visible.map((item) => {
          const Icon = item.icon;
          const active = item.key === page;
          return (
            <a
              key={item.key}
              href={config.urls[item.href]}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors',
                active
                  ? 'bg-[var(--bg-selected)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
              )}
            >
              <Icon size={16} strokeWidth={1.8} />
              <span>{__(item.label)}</span>
            </a>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-[var(--border-default)] p-2">
        <a
          href={config.wpAdminUrl}
          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[12px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
        >
          <ExternalLink size={14} strokeWidth={1.8} />
          <span>{__('Back to WP Admin')}</span>
        </a>
      </div>
    </aside>
  );
};
