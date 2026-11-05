import { useEffect, useMemo, useState, type FC } from 'react';
import { Save } from 'lucide-react';
import {
  BRAND_KIT_SOCIAL_NAMES,
  BRAND_KIT_SOCIAL_NETWORKS,
  normalizeBrandKit,
  type BrandKit,
} from '@shared/brandKit';
import { Button } from '@admin/components/Button';
import { Spinner } from '@admin/components/Spinner';
import { apiCall, ApiError } from '@admin/api';
import { __ } from '@admin/i18n';
import type { SiteSettings } from '@admin/types';
import { Banner, type Flash } from './_shared';
import { CompanySection } from './brand-kit/CompanySection';
import { PaletteSection } from './brand-kit/PaletteSection';
import { SocialSection } from './brand-kit/SocialSection';
import { TypographySection } from './brand-kit/TypographySection';

/**
 * Brand kit tab — the company identity every employee's signature
 * shares, saved in one `PATCH /admin/site-settings`
 * (`{ brand_palette, brand_kit }`):
 *
 *  - Company: name, tagline, website, phone, email, address and logo
 *    (URL + width, with preview and upload) → `{{company_*}}` variables;
 *  - Social profiles → `{{company_linkedin}}`, `{{company_x}}`, …;
 *  - Typography & colours → the canvas new signatures start from;
 *  - Brand palette → quick-pick swatches under every editor ColorInput.
 *
 * The server sanitises everything and echoes what it stored; the tab
 * then shows exactly that, and names any value it had to clear
 * (non-http(s) links, invalid email) instead of failing silently.
 */
export const BrandingTab: FC = () => {
  const [palette, setPalette] = useState<string[] | null>(null);
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [busy, setBusy] = useState<'idle' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    void apiCall<SiteSettings>('/admin/site-settings')
      .then((s) => {
        // Defensive: a malformed response must not leave the spinner
        // up forever.
        const nextPalette = Array.isArray(s?.brand_palette) ? s.brand_palette : [];
        const nextKit = normalizeBrandKit(s?.brand_kit);
        setPalette(nextPalette);
        setKit(nextKit);
        setSaved(snapshot(nextPalette, nextKit));
      })
      .catch((e: Error) => {
        setError(e.message);
        setPalette([]);
        setKit(normalizeBrandKit(null));
      });
  }, []);

  const dirty = useMemo(
    () => palette !== null && kit !== null && saved !== '' && snapshot(palette, kit) !== saved,
    [palette, kit, saved],
  );

  const patchKit = <G extends keyof BrandKit>(group: G, patch: Partial<BrandKit[G]>): void => {
    setKit((prev) => (prev ? { ...prev, [group]: { ...prev[group], ...patch } } : prev));
    setFlash(null);
  };

  const onSave = async (): Promise<void> => {
    if (palette === null || kit === null) return;
    setBusy('saving');
    setFlash(null);
    const sentPalette = [...palette];
    const sentKit = kit;
    try {
      const next = await apiCall<SiteSettings>('/admin/site-settings', {
        method: 'PATCH',
        body: { brand_palette: sentPalette, brand_kit: sentKit },
      });

      if (!Array.isArray(next?.brand_palette) || !next.brand_kit) {
        setFlash({
          type: 'error',
          message: __(
            'Server response did not include the brand kit. The save may not have persisted — please reload and verify.',
          ),
        });
        return;
      }

      // Reflect exactly what's stored (the server sanitises / dedupes).
      const storedKit = normalizeBrandKit(next.brand_kit);
      setPalette(next.brand_palette);
      setKit(storedKit);
      setSaved(snapshot(next.brand_palette, storedKit));

      const problems: string[] = [];
      if (next.brand_palette.length !== sentPalette.length) {
        problems.push(
          __(
            'Saved %s of %s colours. Duplicates / invalid entries were rejected by the server.',
            String(next.brand_palette.length),
            String(sentPalette.length),
          ),
        );
      }
      const cleared = clearedFields(sentKit, storedKit);
      if (cleared.length > 0) {
        problems.push(
          __(
            'These values were not valid and were cleared: %s. Links must start with http:// or https://.',
            cleared.join(', '),
          ),
        );
      }

      setFlash(
        problems.length > 0
          ? { type: 'error', message: problems.join(' ') }
          : { type: 'success', message: __('Brand kit saved.') },
      );
    } catch (e) {
      const message =
        e instanceof ApiError ? `${e.message} [${e.code}, ${e.status}]` : (e as Error).message;
      setFlash({ type: 'error', message });
    } finally {
      setBusy('idle');
    }
  };

  return (
    <div className="space-y-4">
      {flash && (
        <Banner type={flash.type} message={flash.message} onDismiss={() => setFlash(null)} />
      )}
      {error && <Banner type="error" message={error} onDismiss={() => setError(null)} />}

      {(palette === null || kit === null) && !error && (
        <div className="flex justify-center p-10">
          <Spinner size={20} />
        </div>
      )}

      {palette !== null && kit !== null && (
        <div className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-[var(--shadow-xs)]">
          <CompanySection
            company={kit.company}
            onChange={(patch) => patchKit('company', patch)}
            onUploadError={(message) => setFlash({ type: 'error', message })}
          />
          <SocialSection social={kit.social} onChange={(patch) => patchKit('social', patch)} />
          <TypographySection
            typography={kit.typography}
            company={kit.company}
            palette={palette}
            onChange={(patch) => patchKit('typography', patch)}
          />
          <PaletteSection
            palette={palette}
            onChange={(next) => {
              setPalette(next);
              setFlash(null);
            }}
            onError={(message) => setFlash({ type: 'error', message })}
          />

          <div className="flex items-center justify-end gap-3 border-t border-[var(--border-default)] bg-[var(--bg-panel-soft)] px-5 py-4">
            {dirty && (
              <span className="text-[12px] text-[var(--text-muted)]">{__('Unsaved changes')}</span>
            )}
            <Button
              variant="primary"
              onClick={() => void onSave()}
              disabled={busy !== 'idle'}
              icon={busy === 'saving' ? <Spinner size={12} /> : <Save size={14} />}
            >
              {__('Save brand kit')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

function snapshot(palette: string[], kit: BrandKit): string {
  return JSON.stringify([palette, kit]);
}

/**
 * Labels of the fields the admin filled in but the server stored empty
 * (rejected links / email).
 */
function clearedFields(sent: BrandKit, stored: BrandKit): string[] {
  const out: string[] = [];
  const check = (label: string, before: string, after: string): void => {
    if (before.trim() !== '' && after === '') out.push(label);
  };
  check(__('Website'), sent.company.website, stored.company.website);
  check(__('Email'), sent.company.email, stored.company.email);
  check(__('Logo URL'), sent.company.logo_url, stored.company.logo_url);
  for (const network of BRAND_KIT_SOCIAL_NETWORKS) {
    check(BRAND_KIT_SOCIAL_NAMES[network], sent.social[network], stored.social[network]);
  }
  return out;
}
