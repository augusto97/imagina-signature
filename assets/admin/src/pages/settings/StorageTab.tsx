import { useEffect, useState, type FC } from 'react';
import { CheckCircle2, AlertCircle, Settings } from 'lucide-react';
import { Button } from '@admin/components/Button';
import { Spinner } from '@admin/components/Spinner';
import { apiCall, ApiError } from '@admin/api';
import { __ } from '@admin/i18n';
import type { StorageState } from '@admin/types';
import { Banner, Field, Section, type Flash } from './_shared';

interface FormState {
  driver: string;
  provider: string;
  bucket: string;
  region: string;
  access_key: string;
  secret_key: string;
  account_id: string;
  custom_endpoint: string;
  public_url_base: string;
}

const PROVIDERS: Array<{ value: string; label: string }> = [
  { value: 'cloudflare_r2', label: 'Cloudflare R2' },
  { value: 's3', label: 'Amazon S3' },
  { value: 'b2', label: 'Backblaze B2' },
  { value: 'do_spaces', label: 'DigitalOcean Spaces' },
  { value: 'wasabi', label: 'Wasabi' },
  { value: 'custom', label: 'Custom S3-compatible' },
];

interface TestResult {
  success: boolean;
  message: string;
}

/**
 * Storage tab — port of the original SettingsPage body. Reads /
 * writes `/admin/storage` and probes a draft via `/admin/storage/test`.
 */
export const StorageTab: FC = () => {
  const [state, setState] = useState<StorageState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [busy, setBusy] = useState<'idle' | 'saving' | 'testing'>('idle');
  const [flash, setFlash] = useState<Flash | null>(null);

  const load = (): Promise<void> => {
    return apiCall<StorageState>('/admin/storage')
      .then((data) => {
        setState(data);
        setForm(asForm(data));
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    void load();
  }, []);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const onSave = async (): Promise<void> => {
    if (!form) return;
    setBusy('saving');
    setFlash(null);
    try {
      const next = await apiCall<StorageState>('/admin/storage', {
        method: 'PATCH',
        body: { driver: form.driver, config: collectConfig(form) },
      });
      setState(next);
      setForm(asForm(next));
      setFlash({ type: 'success', message: __('Settings saved.') });
    } catch (e) {
      const message = e instanceof ApiError ? e.message : (e as Error).message;
      setFlash({ type: 'error', message });
    } finally {
      setBusy('idle');
    }
  };

  const onTest = async (): Promise<void> => {
    if (!form) return;
    setBusy('testing');
    setTest(null);
    try {
      const result = await apiCall<TestResult>('/admin/storage/test', {
        method: 'POST',
        body: { driver: form.driver, config: collectConfig(form) },
      });
      setTest(result);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : (e as Error).message;
      setTest({ success: false, message });
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

      {!form && !error && (
        <div className="flex justify-center p-10">
          <Spinner size={20} />
        </div>
      )}

      {form && (
        <div className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-[var(--shadow-xs)]">
          <Section title={__('Backend')} description={__('Where uploaded files are stored.')}>
            <Field label={__('Driver')}>
              <select value={form.driver} onChange={(e) => update('driver', e.target.value)}>
                <option value="media_library">{__('WordPress Media Library (default)')}</option>
                <option value="s3">{__('S3-compatible (R2, S3, Spaces, …)')}</option>
                <option value="url_only">{__('External URLs only (no uploads)')}</option>
              </select>
            </Field>

            {form.driver === 'url_only' && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-900">
                <strong className="block font-semibold">
                  {__('URL-only mode')}
                </strong>
                <p className="mt-1">
                  {__(
                    'No files will be hosted by this site. Users can paste external image URLs (e.g. from a CDN you already run) but the editor will not show upload, crop, or media-picker buttons. Existing assets stored under previous drivers stay readable.',
                  )}
                </p>
              </div>
            )}
          </Section>

          {form.driver === 's3' && (
            <Section
              title={__('S3 configuration')}
              description={__('Credentials are encrypted at rest with AES-256 + HKDF derived from AUTH_KEY.')}
            >
              <Field label={__('Provider')}>
                <select value={form.provider} onChange={(e) => update('provider', e.target.value)}>
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={__('Bucket')}>
                <input
                  type="text"
                  value={form.bucket}
                  onChange={(e) => update('bucket', e.target.value)}
                />
              </Field>

              {form.provider !== 'cloudflare_r2' && form.provider !== 'custom' && (
                <Field
                  label={__('Region')}
                  hint={__('e.g. us-east-1 — see your provider for the exact code.')}
                >
                  <input
                    type="text"
                    value={form.region}
                    onChange={(e) => update('region', e.target.value)}
                  />
                </Field>
              )}

              {form.provider === 'cloudflare_r2' && (
                <Field
                  label={__('Cloudflare account ID')}
                  hint={__('Used to build the R2 endpoint URL.')}
                >
                  <input
                    type="text"
                    value={form.account_id}
                    onChange={(e) => update('account_id', e.target.value)}
                  />
                </Field>
              )}

              {form.provider === 'custom' && (
                <Field
                  label={__('Custom endpoint URL')}
                  hint={__('Full https:// URL for your S3-compatible endpoint.')}
                >
                  <input
                    type="url"
                    value={form.custom_endpoint}
                    onChange={(e) => update('custom_endpoint', e.target.value)}
                  />
                </Field>
              )}

              <Field label={__('Access key')}>
                <input
                  type="text"
                  value={form.access_key}
                  onChange={(e) => update('access_key', e.target.value)}
                  autoComplete="off"
                />
              </Field>

              <Field
                label={__('Secret key')}
                hint={
                  state?.has_secret_key
                    ? __('A secret is stored. Leave blank to keep it; type a new value to replace it.')
                    : undefined
                }
              >
                <input
                  type="password"
                  value={form.secret_key}
                  onChange={(e) => update('secret_key', e.target.value)}
                  autoComplete="new-password"
                />
              </Field>

              <Field
                label={__('Public URL base (optional)')}
                hint={__('CDN or custom-domain prefix. Blank uses the endpoint directly.')}
              >
                <input
                  type="url"
                  value={form.public_url_base}
                  onChange={(e) => update('public_url_base', e.target.value)}
                />
              </Field>
            </Section>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-[var(--border-default)] bg-[var(--bg-panel-soft)] px-5 py-4">
            <Button
              variant="secondary"
              onClick={() => void onTest()}
              disabled={busy !== 'idle'}
              icon={busy === 'testing' ? <Spinner size={12} /> : null}
            >
              {__('Test connection')}
            </Button>
            <Button
              variant="primary"
              onClick={() => void onSave()}
              disabled={busy !== 'idle'}
              icon={busy === 'saving' ? <Spinner size={12} /> : <Settings size={14} />}
            >
              {__('Save settings')}
            </Button>
          </div>

          {test && (
            <div
              className={`flex items-start gap-2 border-t border-[var(--border-default)] px-5 py-3 text-[13px] ${
                test.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
              }`}
            >
              {test.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{test.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function asForm(state: StorageState): FormState {
  const c = state.config ?? {};
  return {
    driver: state.driver,
    provider: c.provider ?? 'cloudflare_r2',
    bucket: c.bucket ?? '',
    region: c.region ?? '',
    access_key: c.access_key ?? '',
    secret_key: '',
    account_id: c.account_id ?? '',
    custom_endpoint: c.custom_endpoint ?? '',
    public_url_base: c.public_url_base ?? '',
  };
}

function collectConfig(form: FormState): Record<string, string> {
  const out: Record<string, string> = {};
  if (form.driver !== 's3') return out;

  const fields: Array<keyof FormState> = [
    'provider',
    'bucket',
    'region',
    'access_key',
    'secret_key',
    'account_id',
    'custom_endpoint',
    'public_url_base',
  ];
  for (const key of fields) {
    const value = form[key];
    if (value && value !== '') {
      out[key] = value;
    }
  }
  return out;
}
