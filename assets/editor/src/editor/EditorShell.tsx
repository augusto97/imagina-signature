import type { FC } from 'react';
import { Topbar } from './topbar/Topbar';
import { LeftSidebar } from './sidebar-left/LeftSidebar';
import { RightSidebar } from './sidebar-right/RightSidebar';
import { Canvas } from './canvas/Canvas';

/**
 * Top-level editor layout: 48px topbar + (left sidebar | canvas |
 * right sidebar) row. The shell is intentionally dumb — it just
 * holds the structural layout. State and data flow live in the
 * Zustand stores (Sprint 5+).
 */
export const EditorShell: FC = () => {
  return (
    <div className="flex h-full w-full flex-col">
      <Topbar />
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar />
        <Canvas />
        <RightSidebar />
      </div>
    </div>
  );
};
