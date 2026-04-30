import type { FC } from 'react';
import { EditorShell } from '@/editor/EditorShell';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { Toaster } from '@/components/shared/Toaster';
import { useAutosave } from '@/hooks/useAutosave';

/**
 * App root.
 *
 * Wraps the editor in an ErrorBoundary, mounts the toast layer, and
 * runs the autosave hook.
 */
export const App: FC = () => {
  useAutosave();

  return (
    <ErrorBoundary>
      <EditorShell />
      <Toaster />
    </ErrorBoundary>
  );
};
