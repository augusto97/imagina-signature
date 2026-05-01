import { useEffect, useState, type FC } from 'react';
import { Plus, Save, Trash2, Calendar, ExternalLink } from 'lucide-react';
import { Button } from '@admin/components/Button';
import { Spinner } from '@admin/components/Spinner';
import { apiCall, ApiError } from '@admin/api';
import { __ } from '@admin/i18n';
import { cn } from '@admin/utils/cn';
import type { BannerCampaign, SiteSettings } from '@admin/types';
import { Banner, Field, Section, type Flash } from './_shared';

const MAX_CAMPAIGNS = 50;

/**
 * Campaigns tab — list + add / edit / delete banner campaigns. Each
 * campaign stores: name, image URL, link URL, alt text, width,
 * enabled flag, and an optional date window (start_date / end_date).
 *
 * The compile pipeline picks one currently-active campaign at random
 * each export, so re-running the export rotates between active
 * banners without any per-recipient infrastructure.
 *
 * Edits are local until "Save campaigns" — that lets admins reorder /
 * tune multiple entries without one PATCH per keystroke.
 */
export const CampaignsTab: FC = () => {
  const [campaigns, setCampaigns] = useState<BannerCampaign[] | null>(null);
  const [busy, setBusy] = useState<'idle' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    void apiCall<SiteSettings>('/admin/site-settings')
      .then((s) => setCampaigns(s.banner_campaigns))
      .catch((e: Error) => setError(e.message));
  }, []);

  const updateCampaign = (id: string, patch: Partial<BannerCampaign>): void => {
    setCampaigns((prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, ...patch } : c)) : prev,
    );
  };

  const removeCampaign = (id: string): void => {
    setCampaigns((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
  };

  const addCampaign = (): void => {
    const fresh: BannerCampaign = {
      id: `camp_${Math.random().toString(36).slice(2, 14)}`,
      name: '',
      enabled: true,
      image_url: '',
      link_url: '',
      alt: '',
      width: 600,
      start_date: '',
      end_date: '',
    };
    setCampaigns((prev) => (prev ? [...prev, fresh] : [fresh]));
  };

  const onSave = async (): Promise<void> => {
    if (campaigns === null) return;
    setBusy('saving');
    setFlash(null);
    try {
      const next = await apiCall<SiteSettings>('/admin/site-settings', {
        method: 'PATCH',
        body: { banner_campaigns: campaigns },
      });
      setCampaigns(next.banner_campaigns);
      setFlash({ type: 'success', message: __('Campaigns saved.') });
    } catch (e) {
      const message = e instanceof ApiError ? e.message : (e as Error).message;
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

      {campaigns === null && !error && (
        <div className="flex justify-center p-10">
          <Spinner size={20} />
        </div>
      )}

      {campaigns !== null && (
        <div className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-[var(--shadow-xs)]">
          <Section
            title={__('Banner campaigns')}
            description={__(
              'Promotional banners auto-injected at the bottom of every signature on export. Multiple active campaigns rotate randomly per export.',
            )}
          >
            {campaigns.length === 0 ? (
              <div className="rounded-md border border-dashed border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-6 text-center">
                <p className="text-[12.5px] text-[var(--text-secondary)]">
                  {__('No campaigns yet.')}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus size={12} />}
                  onClick={addCampaign}
                  className="mt-3"
                >
                  {__('Add first campaign')}
                </Button>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {campaigns.map((c) => (
                  <CampaignRow
                    key={c.id}
                    campaign={c}
                    status={statusFor(c)}
                    onChange={(patch) => updateCampaign(c.id, patch)}
                    onRemove={() => removeCampaign(c.id)}
                  />
                ))}
              </ul>
            )}

            {campaigns.length > 0 && campaigns.length < MAX_CAMPAIGNS && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus size={12} />}
                onClick={addCampaign}
              >
                {__('Add another campaign')}
              </Button>
            )}
          </Section>

          <div className="flex justify-end gap-2 border-t border-[var(--border-default)] bg-[var(--bg-panel-soft)] px-5 py-4">
            <Button
              variant="primary"
              onClick={() => void onSave()}
              disabled={busy !== 'idle'}
              icon={busy === 'saving' ? <Spinner size={12} /> : <Save size={14} />}
            >
              {__('Save campaigns')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

type Status = 'active' | 'scheduled' | 'expired' | 'disabled';

function statusFor(c: BannerCampaign): Status {
  if (!c.enabled) return 'disabled';
  const today = new Date().toISOString().slice(0, 10);
  if (c.start_date && c.start_date > today) return 'scheduled';
  if (c.end_date && c.end_date < today) return 'expired';
  return 'active';
}

const STATUS_STYLES: Record<Status, { label: string; cls: string }> = {
  active: {
    label: 'Active',
    cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
  scheduled: {
    label: 'Scheduled',
    cls: 'bg-amber-50 text-amber-700 ring-amber-200',
  },
  expired: {
    label: 'Expired',
    cls: 'bg-slate-100 text-slate-600 ring-slate-200',
  },
  disabled: {
    label: 'Disabled',
    cls: 'bg-slate-100 text-slate-500 ring-slate-200',
  },
};

interface CampaignRowProps {
  campaign: BannerCampaign;
  status: Status;
  onChange: (patch: Partial<BannerCampaign>) => void;
  onRemove: () => void;
}

const CampaignRow: FC<CampaignRowProps> = ({ campaign, status, onChange, onRemove }) => {
  const statusStyle = STATUS_STYLES[status];

  return (
    <li className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel-soft)]">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border-default)] bg-[var(--bg-panel)] px-4 py-2.5">
        <div className="flex items-center gap-2 truncate">
          <input
            type="text"
            value={campaign.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={__('Campaign name')}
            className="!h-7 max-w-[220px] flex-1 !px-2 text-[12.5px] font-medium"
          />
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset',
              statusStyle.cls,
            )}
          >
            {__(statusStyle.label)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12px]">
            <input
              type="checkbox"
              checked={campaign.enabled}
              onChange={(e) => onChange({ enabled: e.target.checked })}
              className="!h-4 !w-4 !p-0"
            />
            <span className="text-[var(--text-secondary)]">{__('Enabled')}</span>
          </label>

          <button
            type="button"
            onClick={onRemove}
            title={__('Remove campaign')}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] hover:bg-red-50 hover:text-[var(--danger)]"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <Field label={__('Image URL')}>
          <input
            type="url"
            value={campaign.image_url}
            onChange={(e) => onChange({ image_url: e.target.value })}
            placeholder="https://example.com/banner.png"
          />
        </Field>

        <Field label={__('Link URL')}>
          <input
            type="url"
            value={campaign.link_url}
            onChange={(e) => onChange({ link_url: e.target.value })}
            placeholder="https://example.com/landing"
          />
        </Field>

        <Field label={__('Alt text')}>
          <input
            type="text"
            value={campaign.alt}
            onChange={(e) => onChange({ alt: e.target.value })}
            placeholder={__('Describe the banner for screen readers')}
          />
        </Field>

        <Field label={__('Width (px)')}>
          <input
            type="number"
            min={100}
            max={800}
            value={campaign.width}
            onChange={(e) => onChange({ width: Number(e.target.value) || 600 })}
          />
        </Field>

        <Field label={__('Start date (optional)')}>
          <input
            type="date"
            value={campaign.start_date}
            onChange={(e) => onChange({ start_date: e.target.value })}
          />
        </Field>

        <Field label={__('End date (optional)')}>
          <input
            type="date"
            value={campaign.end_date}
            onChange={(e) => onChange({ end_date: e.target.value })}
          />
        </Field>

        {campaign.image_url && (
          <div className="sm:col-span-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="is-section-label">{__('Preview')}</span>
              {campaign.link_url && (
                <a
                  href={campaign.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10.5px] text-[var(--accent)] hover:underline"
                >
                  {__('Open link')}
                  <ExternalLink size={10} />
                </a>
              )}
            </div>
            <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] p-3">
              <img
                src={campaign.image_url}
                alt={campaign.alt}
                style={{
                  display: 'block',
                  maxWidth: '100%',
                  width: campaign.width,
                  height: 'auto',
                  margin: '0 auto',
                }}
              />
            </div>
          </div>
        )}

        {(campaign.start_date || campaign.end_date) && (
          <p className="sm:col-span-2 inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <Calendar size={11} />
            {__('Active window:')}{' '}
            {campaign.start_date || __('any time')} → {campaign.end_date || __('forever')}
          </p>
        )}
      </div>
    </li>
  );
};
