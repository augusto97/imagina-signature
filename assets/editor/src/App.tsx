import type { FC } from 'react';
import { EditorShell } from '@/editor/EditorShell';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { Toaster } from '@/components/shared/Toaster';
import { useAutosave } from '@/hooks/useAutosave';
import { useLoadSignature } from '@/hooks/useLoadSignature';

/**
 * App root.
 *
 * Loads the signature identified in IMGSIG_EDITOR_CONFIG (or skips
 * if signatureId === 0), then runs the autosave loop. Both hooks are
 * gated on `persistenceStore.isLoaded` so the load doesn't trigger a
 * redundant save round-trip.
 */
export const App: FC = () => {
  useLoadSignature();
  useAutosave();

  return (
    <ErrorBoundary>
      <EditorShell />
      <Toaster />
    </ErrorBoundary>
  );
};
