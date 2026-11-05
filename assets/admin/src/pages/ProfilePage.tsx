import type { FC } from 'react';
import { Topbar } from '@admin/components/Topbar';
import { ProfileForm } from '@admin/components/ProfileForm';
import { __ } from '@admin/i18n';

/**
 * "My profile" — the signed-in user's employee data (job title, phones,
 * links, photo…). Served in wp-admin and on the public `/<slug>/` route
 * (`?view=profile`); every signature resolves these as `{{job_title}}`,
 * `{{phone}}`, …
 */
export const ProfilePage: FC = () => (
  <div className="flex h-full flex-col">
    <Topbar
      title={__('My profile')}
      description={__(
        'These details fill the matching fields of your signatures ({{job_title}}, {{phone}}, …). Open a signature again to see the new values.',
      )}
    />
    <div className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-3xl">
        <ProfileForm endpoint="/me/profile" />
      </div>
    </div>
  </div>
);
