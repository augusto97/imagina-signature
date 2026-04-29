import { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Button } from '../../../editor/src/components/ui/Button';
import { Input } from '../../../editor/src/components/ui/Input';
import { Select } from '../../../editor/src/components/ui/Select';
import { __ } from '../../../editor/src/i18n/helpers';
import { pushToast } from '../../../editor/src/components/ui/Toaster';
import { storageApi, type StorageConfig, type StoragePreset } from '../api';

const PROVIDERS = [
  { value: 'media_library', label: 'Media Library' },
  { value: 'cloudflare_r2', label: 'Cloudflare R2' },
  { value: 'bunny', label: 'Bunny Storage' },
  { value: 's3', label: 'Amazon S3' },
  { value: 'b2', label: 'Backblaze B2' },
  { value: 'do_spaces', label: 'DigitalOcean Spaces' },
  { value: 'wasabi', label: 'Wasabi' },
  { value: 'minio', label: 'MinIO (self-hosted)' },
  { value: 'custom', label: 'Custom S3-compatible' },
];

interface ProviderState extends StorageConfig {
  provider: string;
}

export function StoragePage(): JSX.Element {
  const [presets, setPresets] = useState<Record<string, StoragePreset>>({});
  const [state, setState] = useState<ProviderState>({ provider: 'media_library' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    Promise.all([storageApi.get(), storageApi.presets()])
      .then(([storage, presetsRes]) => {
        setPresets(presetsRes.items);
        if (storage.driver === 'media_library') {
          setState({ provider: 'media_library' });
        } else {
          // Try to match the saved config to a known preset by endpoint host.
          const provider = guessProvider(storage.config, presetsRes.items);
          setState({ provider, ...storage.config });
        }
      })
      .catch(() => pushToast(__('Could not load storage settings.'), 'error'))
      .finally(() => setLoading(false));
  }, []);

  const isS3Family = state.provider !== 'media_library';
  const preset = presets[state.provider];
  const regionOptions = preset?.region_options ?? [];

  const buildEndpoint = (): string => {
    if (!preset || !preset.endpoint_template) return state.endpoint ?? '';
    let endpoint = preset.endpoint_template;
    if (state.region) endpoint = endpoint.replace('{region}', state.region);
    if ((state as { account_id?: string }).account_id) {
      endpoint = endpoint.replace('{account_id}', (state as { account_id?: string }).account_id ?? '');
    }
    if (preset.endpoint_template.includes('{custom}')) {
      return state.endpoint ?? '';
    }
    return endpoint;
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setTestResult(null);
    try {
      if (state.provider === 'media_library') {
        await storageApi.update({ driver: 'media_library', config: {} });
      } else {
        const endpoint = buildEndpoint();
        await storageApi.update({
          driver: 's3',
          config: {
            endpoint,
            region: state.region ?? 'auto',
            bucket: state.bucket ?? '',
            access_key: state.access_key ?? '',
            secret_key: state.secret_key ?? '',
            path_style: preset?.path_style ?? state.path_style ?? false,
            public_base_url: state.public_base_url ?? '',
          },
        });
      }
      pushToast(__('Storage settings saved.'), 'success');
    } catch {
      pushToast(__('Could not save settings.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const onTest = async (): Promise<void> => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await storageApi.test();
      setTestResult({ ok: result.ok, message: result.message });
      pushToast(result.message, result.ok ? 'success' : 'warning');
    } catch (error) {
      const message = error instanceof Error ? error.message : __('Unknown error');
      setTestResult({ ok: false, message });
      pushToast(message, 'error');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="is-py-12 is-text-center is-text-slate-500">{__('Loading…')}</div>;
  }

  return (
    <div className="is-max-w-2xl is-mx-auto is-px-4 is-py-6">
      <header className="is-mb-6">
        <h1 className="is-text-2xl is-font-bold">{__('Storage')}</h1>
        <p className="is-mt-1 is-text-slate-600">
          {__('Choose where image uploads are stored.')}
        </p>
      </header>

      <div className="is-bg-white is-rounded is-shadow-sm is-border is-border-slate-200 is-p-5 is-flex is-flex-col is-gap-4">
        <Select
          label={__('Storage provider')}
          value={state.provider}
          onValueChange={(value) => {
            setState({ provider: value });
            setTestResult(null);
          }}
          options={PROVIDERS}
        />

        {isS3Family && (
          <>
            {regionOptions.length > 0 ? (
              <Select
                label={__('Region')}
                value={state.region ?? regionOptions[0]}
                onValueChange={(value) => setState({ ...state, region: value })}
                options={regionOptions.map((region) => ({ value: region, label: region }))}
              />
            ) : (
              <Input
                label={__('Region')}
                value={state.region ?? 'auto'}
                onInput={(event) => setState({ ...state, region: (event.target as HTMLInputElement).value })}
              />
            )}

            {preset?.extra_fields?.includes('account_id') && (
              <Input
                label={__('Account ID')}
                value={(state as { account_id?: string }).account_id ?? ''}
                onInput={(event) =>
                  setState({ ...state, account_id: (event.target as HTMLInputElement).value } as ProviderState)
                }
              />
            )}

            {preset?.endpoint_template?.includes('{custom}') && (
              <Input
                label={__('Endpoint URL')}
                placeholder="https://s3.example.com"
                value={state.endpoint ?? ''}
                onInput={(event) =>
                  setState({ ...state, endpoint: (event.target as HTMLInputElement).value })
                }
              />
            )}

            <Input
              label={__('Bucket name')}
              value={state.bucket ?? ''}
              onInput={(event) =>
                setState({ ...state, bucket: (event.target as HTMLInputElement).value })
              }
            />
            <Input
              label={__('Access key ID')}
              value={state.access_key ?? ''}
              onInput={(event) =>
                setState({ ...state, access_key: (event.target as HTMLInputElement).value })
              }
            />
            <Input
              label={__('Secret access key')}
              type="password"
              placeholder={state.secret_key_set ? __('(leave blank to keep current)') : ''}
              value={state.secret_key ?? ''}
              onInput={(event) =>
                setState({ ...state, secret_key: (event.target as HTMLInputElement).value })
              }
            />
            <Input
              label={__('Public base URL (optional CDN)')}
              placeholder="https://cdn.example.com"
              value={state.public_base_url ?? ''}
              onInput={(event) =>
                setState({ ...state, public_base_url: (event.target as HTMLInputElement).value })
              }
            />
            {preset?.docs_url && (
              <a
                href={preset.docs_url}
                target="_blank"
                rel="noreferrer"
                className="is-text-xs is-text-brand-700 hover:is-underline"
              >
                {__('Provider setup guide ↗')}
              </a>
            )}
          </>
        )}

        {testResult && (
          <div
            className={`is-px-3 is-py-2 is-rounded is-text-sm ${
              testResult.ok
                ? 'is-bg-green-50 is-text-green-800 is-border is-border-green-200'
                : 'is-bg-red-50 is-text-red-700 is-border is-border-red-200'
            }`}
          >
            {testResult.message}
          </div>
        )}

        <div className="is-flex is-gap-2 is-justify-end is-pt-2">
          <Button variant="secondary" onClick={onTest} loading={testing}>
            {__('Test connection')}
          </Button>
          <Button onClick={save} loading={saving}>
            {__('Save settings')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function guessProvider(config: StorageConfig, presets: Record<string, StoragePreset>): string {
  if (!config.endpoint) return 'custom';
  for (const [key, preset] of Object.entries(presets)) {
    if (!preset.endpoint_template) continue;
    const literal = preset.endpoint_template.replace('{region}', '').replace('{account_id}', '');
    if (literal && config.endpoint.includes(literal.replace(/\W/g, ''))) {
      return key;
    }
  }
  return 'custom';
}
