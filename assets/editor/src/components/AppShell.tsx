import { ComponentChildren, JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { meApi } from '../api/me';
import { useUserStore } from '../stores/userStore';
import { Toaster } from './ui/Toaster';

interface Props {
  children: ComponentChildren;
}

export function AppShell({ children }: Props): JSX.Element {
  const setMe = useUserStore((state) => state.setMe);

  useEffect(() => {
    // Best-effort load: pages that need quota / capabilities subscribe to
    // the store and re-render when it resolves. A failure here just leaves
    // those slots empty — we don't toast since the app is still usable.
    meApi
      .get()
      .then((me) => setMe(me))
      .catch(() => {
        // Intentionally silent; the dashboard is still usable without /me.
      });
  }, [setMe]);

  return (
    <div className="imagina-signatures-app is-min-h-screen is-bg-slate-50 is-text-slate-900">
      {children}
      <Toaster />
    </div>
  );
}
