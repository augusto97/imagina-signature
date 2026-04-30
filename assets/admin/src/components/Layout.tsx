import type { FC, ReactNode } from 'react';
import { SidebarNav } from './SidebarNav';
import { getConfig } from '@admin/api';

interface Props {
  children: ReactNode;
}

/**
 * Top-level admin layout: sidebar + main column.
 *
 * The current page key comes from the bootstrap config (which
 * mirrors the wp-admin URL the user clicked) so the sidebar can
 * highlight the active item.
 */
export const Layout: FC<Props> = ({ children }) => {
  const { page } = getConfig();

  return (
    <div className="flex h-full w-full overflow-hidden">
      <SidebarNav page={page} />
      <main className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-primary)]">
        {children}
      </main>
    </div>
  );
};
