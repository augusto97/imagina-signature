import { useEffect, type FC } from 'react';
import { EditorShell } from '@/editor/EditorShell';
import { PostMessageBridge } from '@/bridge/postMessageBridge';

/**
 * App root.
 *
 * Owns the lifetime of the postMessage bridge (one per app instance)
 * and signals "ready" to the host so wp-admin can drop its loading
 * placeholder.
 */
export const App: FC = () => {
  useEffect(() => {
    const bridge = new PostMessageBridge();
    bridge.send({ type: 'ready' });
    return () => bridge.destroy();
  }, []);

  return <EditorShell />;
};
