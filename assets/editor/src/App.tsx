import { useEffect, type FC } from 'react';
import { EditorShell } from '@/editor/EditorShell';
import { PostMessageBridge } from '@/bridge/postMessageBridge';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { Toaster } from '@/components/shared/Toaster';
import { useAutosave } from '@/hooks/useAutosave';

/**
 * App root.
 *
 * Wraps the editor in an ErrorBoundary, mounts the toast layer, and
 * runs the autosave hook. Owns the postMessage bridge lifetime and
 * signals `ready` to the host on mount.
 */
export const App: FC = () => {
  useEffect(() => {
    const bridge = new PostMessageBridge();
    bridge.send({ type: 'ready' });
    return () => bridge.destroy();
  }, []);

  useAutosave();

  return (
    <ErrorBoundary>
      <EditorShell />
      <Toaster />
    </ErrorBoundary>
  );
};
