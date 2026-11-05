import type { FC } from 'react';
import {
  FileSignature,
  LayoutTemplate,
  Settings,
  ExternalLink,
  Home,
  UserRound,
  Users,
} from 'lucide-react';
import { __ } from '@admin/i18n';
import { getConfig } from '@admin/api';
import { cn } from '@admin/utils/cn';
import type { AdminConfig } from '@admin/types';

type PageKey = AdminConfig['page'];

interface NavItem {
  key: PageKey;
  /** Lazy so the label is translated at render time (and stays a literal for the extractor). */
  label: () => string;
  icon: typeof FileSignature;
  href: keyof AdminConfig['urls'];
  requiresCap?: keyof AdminConfig['capabilities'];
}

const NAV: NavItem[] = [
  { key: 'signatures', label: () => __('My Signatures'), icon: FileSignature, href: 'signatures' },
  { key: 'profile', label: () => __('My profile'), icon: UserRound, href: 'profile' },
  {
    key: 'templates',
    label: () => __('Templates'),
    icon: LayoutTemplate,
    href: 'templates',
    requiresCap: 'manage_templates',
  },
  {
    key: 'groups',
    label: () => __('Groups'),
    icon: Users,
    href: 'groups',
    requiresCap: 'manage_team',
  },
  {
    key: 'settings',
    label: () => __('Settings'),
    icon: Settings,
    href: 'settings',
    requiresCap: 'manage_storage',
  },
];

/** Pages the public `/<slug>/` route serves. */
const PUBLIC_PAGES: PageKey[] = ['signatures', 'profile'];

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
  const isPublic = config.frontendContext === 'public';

  // Two filters compose: capability-gating (always) AND a public-route
  // gate that hides everything except "My Signatures" / "My profile". The capability
  // gate already hides Settings / Templates for users who lack the
  // caps, but on the public route we want them hidden even for admins
  // who happen to be visiting `/signatures/` — that route is intended
  // as the end-user signature workspace, not a back-door into the
  // admin surfaces (which still live in wp-admin where they belong).
  const visible = NAV.filter((item) => {
    if (isPublic && !PUBLIC_PAGES.includes(item.key)) {
      return false;
    }
    // Pages a host bootstrap doesn't route yet stay hidden.
    if (config.urls[item.href] === undefined) {
      return false;
    }
    return !item.requiresCap || config.capabilities[item.requiresCap];
  });

  const BackIcon = isPublic ? Home : ExternalLink;
  const backLabel = isPublic ? __('Back to home') : __('Back to WP Admin');

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-sidebar)]">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-[var(--border-default)] px-5">
        <span
          aria-hidden
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-white"
        >
          <FileSignature size={17} strokeWidth={2} />
        </span>
        <span className="text-[14.5px] font-semibold tracking-tight text-[var(--text-primary)]">
          {__('Imagina Signatures')}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {visible.map((item) => {
          const Icon = item.icon;
          const active = item.key === page;
          return (
            <a
              key={item.key}
              href={config.urls[item.href]}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-colors',
                active
                  ? 'bg-[var(--bg-selected)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
              )}
            >
              <Icon size={17} strokeWidth={1.9} />
              <span>{item.label()}</span>
            </a>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-[var(--border-default)] p-3">
        <a
          href={config.wpAdminUrl}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-[12.5px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
        >
          <BackIcon size={14} strokeWidth={1.9} />
          <span>{backLabel}</span>
        </a>
      </div>
    </aside>
  );
};
