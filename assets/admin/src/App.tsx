import type { FC } from 'react';
import { Layout } from '@admin/components/Layout';
import { SignaturesPage } from '@admin/pages/SignaturesPage';
import { TemplatesPage } from '@admin/pages/TemplatesPage';
import { SettingsPage } from '@admin/pages/SettingsPage';
import { getConfig } from '@admin/api';

export const App: FC = () => {
  const { page } = getConfig();

  return (
    <Layout>
      {page === 'signatures' && <SignaturesPage />}
      {page === 'templates' && <TemplatesPage />}
      {page === 'settings' && <SettingsPage />}
    </Layout>
  );
};
