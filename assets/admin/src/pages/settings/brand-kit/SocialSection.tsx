import type { FC } from 'react';
import {
  BRAND_KIT_SOCIAL_NAMES,
  BRAND_KIT_SOCIAL_NETWORKS,
  type BrandKit,
  type BrandKitSocialNetwork,
} from '@shared/brandKit';
import { __ } from '@admin/i18n';
import { Field, Section } from '../_shared';

/** Example URL per network, shown as the placeholder. */
const EXAMPLES: Record<BrandKitSocialNetwork, string> = {
  linkedin: 'https://www.linkedin.com/company/…',
  x: 'https://x.com/…',
  facebook: 'https://www.facebook.com/…',
  instagram: 'https://www.instagram.com/…',
  youtube: 'https://www.youtube.com/@…',
  tiktok: 'https://www.tiktok.com/@…',
  github: 'https://github.com/…',
  whatsapp: 'https://wa.me/…',
};

interface Props {
  social: BrandKit['social'];
  onChange: (patch: Partial<BrandKit['social']>) => void;
}

/**
 * Brand kit → Social profiles: the company's own profile URLs,
 * available in every signature as `{{company_linkedin}}` etc.
 */
export const SocialSection: FC<Props> = ({ social, onChange }) => (
  <Section
    title={__('Social profiles')}
    description={__(
      "The company's profile links, available in every signature as {{company_linkedin}}, {{company_x}} and so on. Only http:// and https:// links are saved.",
    )}
  >
    <div className="grid gap-3 sm:grid-cols-2">
      {BRAND_KIT_SOCIAL_NETWORKS.map((network) => (
        <Field
          key={network}
          label={BRAND_KIT_SOCIAL_NAMES[network]}
          hint={`{{company_${network}}}`}
        >
          <input
            type="url"
            value={social[network]}
            placeholder={EXAMPLES[network]}
            onChange={(e) => onChange({ [network]: e.target.value })}
          />
        </Field>
      ))}
    </div>
  </Section>
);
