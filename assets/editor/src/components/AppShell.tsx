import { ComponentChildren, JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { meApi } from '../api/me';
import { useUserStore } from '../stores/userStore';
import { __ } from '../i18n/helpers';
import { Toaster, pushToast } from './ui/Toaster';

interface Props {
  children: ComponentChildren;
}

export function AppShell({ children }: Props): JSX.Element {
  const setMe = useUserStore((state) => state.setMe);

  useEffect(() => {
    meApi
      .get()
      .then((me) => setMe(me))
      .catch(() => pushToast(__('Could not load your account info.'), 'error'));
  }, [setMe]);

  return (
    <div className="imagina-signatures-app is-min-h-screen is-bg-slate-50 is-text-slate-900">
      {children}
      <Toaster />
    </div>
  );
}
