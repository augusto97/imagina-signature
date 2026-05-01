import { useEffect, useState, type FC } from 'react';
import { Save, Eye } from 'lucide-react';
import { Button } from '@admin/components/Button';
import { Spinner } from '@admin/components/Spinner';
import { apiCall, ApiError } from '@admin/api';
import { __ } from '@admin/i18n';
import type { SiteSettings } from '@admin/types';
import { Banner, Field, Section, type Flash } from './_shared';

const TEMPLATE_GDPR = `<p>This email and any attachments are confidential and may be privileged. If you received this in error, please notify the sender and delete it. We process personal data per our <a href="https://example.com/privacy">Privacy Policy</a>.</p>`;

const TEMPLATE_CAN_SPAM = `<p>You're receiving this because you have an existing relationship with us. To stop business communications, reply with "Unsubscribe".</p>`;

/**
 * Compliance footer tab — toggles a site-wide HTML disclaimer that
 * the compiler appends to every signature. Useful for GDPR /
 * CAN-SPAM messages an admin wants enforced without trusting every
 * end user to add their own Disclaimer block.
 *
 * The HTML is admin-only (capability `imgsig_manage_storage`) and
 * goes through `wp_kses_post` server-side, so the field allows the
 * standard post-content allowlist (block / paragraph / inline / link
 * — no scripts).
 */
export const ComplianceTab: FC = () => {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [html, setHtml] = useState('');
  const [busy, setBusy] = useState<'idle' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    void apiCall<SiteSettings>('/admin/site-settings')
      .then((s) => {
        setEnabled(s.compliance_footer.enabled);
        setHtml(s.compliance_footer.html);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const onSave = async (): Promise<void> => {
    if (enabled === null) return;
    setBusy('saving');
    setFlash(null);
    try {
      const next = await apiCall<SiteSettings>('/admin/site-settings', {
        method: 'PATCH',
        body: { compliance_footer: { enabled, html } },
      });
      setEnabled(next.compliance_footer.enabled);
      setHtml(next.compliance_footer.html);
      setFlash({ type: 'success', message: __('Compliance footer saved.') });
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

      {enabled === null && !error && (
        <div className="flex justify-center p-10">
          <Spinner size={20} />
        </div>
      )}

      {enabled !== null && (
        <div className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-[var(--shadow-xs)]">
          <Section
            title={__('Compliance footer')}
            description={__(
              'Optional HTML appended to every signature on export. Useful for GDPR / CAN-SPAM disclaimers an admin wants enforced site-wide.',
            )}
          >
            <Field label={__('Enable footer')}>
              <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="!h-4 !w-4 !p-0"
                />
                <span className="text-[var(--text-secondary)]">
                  {enabled
                    ? __('Footer is appended to every signature.')
                    : __('Footer is currently disabled — signatures ship without it.')}
                </span>
              </label>
            </Field>

            <Field
              label={__('Footer HTML')}
              hint={__(
                'Allowed tags: standard post-content set (paragraph, link, strong, em, br, etc.). Scripts and styles are stripped server-side.',
              )}
            >
              <textarea
                rows={6}
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                disabled={!enabled}
                className="font-mono text-[12px]"
                placeholder={__('Paste or write the HTML disclaimer here…')}
              />
            </Field>

            <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
              <span className="text-[var(--text-secondary)]">
                {__('Quick templates:')}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setHtml(TEMPLATE_GDPR)}>
                {__('GDPR-style')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setHtml(TEMPLATE_CAN_SPAM)}>
                {__('CAN-SPAM-style')}
              </Button>
            </div>

            {enabled && html && (
              <Field label={__('Preview')}>
                <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-3 text-[11.5px] text-[var(--text-secondary)]">
                  <div className="mb-2 inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wide text-[var(--text-muted)]">
                    <Eye size={11} />
                    {__('Rendered')}
                  </div>
                  <div
                    // eslint-disable-next-line react/no-danger -- admin-authored, kses-sanitized server-side
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                </div>
              </Field>
            )}
          </Section>

          <div className="flex justify-end gap-2 border-t border-[var(--border-default)] bg-[var(--bg-panel-soft)] px-5 py-4">
            <Button
              variant="primary"
              onClick={() => void onSave()}
              disabled={busy !== 'idle'}
              icon={busy === 'saving' ? <Spinner size={12} /> : <Save size={14} />}
            >
              {__('Save footer')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
