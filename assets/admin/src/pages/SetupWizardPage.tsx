import { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Button } from '../../../editor/src/components/ui/Button';
import { __ } from '../../../editor/src/i18n/helpers';
import { pushToast } from '../../../editor/src/components/ui/Toaster';
import { setupApi } from '../api';

type Mode = 'single' | 'multi';
type Driver = 'media_library' | 's3';

export function SetupWizardPage(): JSX.Element {
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<Mode>('single');
  const [driver, setDriver] = useState<Driver>('media_library');
  const [saving, setSaving] = useState(false);

  const finish = async (): Promise<void> => {
    setSaving(true);
    try {
      await setupApi.save({ mode, storage_driver: driver });
      pushToast(__('Setup complete!'), 'success');
      // Redirect to the dashboard after a short pause.
      window.setTimeout(() => {
        window.location.href = window.location.pathname.replace(
          'page=imagina-signatures-setup',
          'page=imagina-signatures',
        );
      }, 600);
    } catch (error) {
      const detail = formatApiError(error);
      pushToast(__('Could not save setup: ') + detail, 'error', { duration: 8000 });
      setSaving(false);
    }
  };

  const formatApiError = (error: unknown): string => {
    // @wordpress/api-fetch rejects with the parsed response body itself
    // (e.g. { code: 'rest_forbidden', message: '…', data: { status: 403 } })
    // and the legacy fetch wrapper rejects with { status, body }.
    if (error && typeof error === 'object') {
      const e = error as {
        message?: string;
        code?: string;
        status?: number;
        data?: { status?: number };
        body?: { code?: string; message?: string };
      };
      const status = e.status ?? e.data?.status;
      if (e.message) return e.message + (status ? ` (HTTP ${status})` : '');
      if (e.code) return e.code + (status ? ` (HTTP ${status})` : '');
      if (e.body?.message) return e.body.message + (status ? ` (HTTP ${status})` : '');
      if (e.body?.code) return e.body.code + (status ? ` (HTTP ${status})` : '');
      if (status) return `HTTP ${status}`;
    }
    return String(error);
  };

  return (
    <div className="is-max-w-2xl is-mx-auto is-px-4 is-py-10">
      <header className="is-mb-6">
        <h1 className="is-text-2xl is-font-bold">{__('Welcome to Imagina Signatures')}</h1>
        <p className="is-mt-2 is-text-slate-600">
          {__('Three quick questions to set up the plugin.')}
        </p>
        <Steps current={step} total={3} />
      </header>

      <div className="is-bg-white is-rounded is-shadow-sm is-border is-border-slate-200 is-p-6">
        {step === 1 && (
          <section>
            <h2 className="is-text-lg is-font-semibold">{__('Welcome')}</h2>
            <p className="is-mt-2 is-text-slate-600">
              {__('You will create email signatures with a drag-and-drop editor. Signatures are compiled to inline-styled HTML compatible with Gmail, Outlook, and Apple Mail.')}
            </p>
            <div className="is-mt-6 is-flex is-justify-end">
              <Button onClick={() => setStep(2)}>{__('Continue')}</Button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <h2 className="is-text-lg is-font-semibold">{__('How will you use it?')}</h2>
            <div className="is-mt-3 is-flex is-flex-col is-gap-2">
              <Choice
                label={__('Just for me (Single user)')}
                description={__('You alone will create signatures, with no quotas.')}
                checked={mode === 'single'}
                onSelect={() => setMode('single')}
              />
              <Choice
                label={__('For multiple users (Multi user)')}
                description={__('You will create users and assign them plans with quotas.')}
                checked={mode === 'multi'}
                onSelect={() => setMode('multi')}
              />
            </div>
            <div className="is-mt-6 is-flex is-justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                {__('Back')}
              </Button>
              <Button onClick={() => setStep(3)}>{__('Continue')}</Button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <h2 className="is-text-lg is-font-semibold">{__('Where to store images')}</h2>
            <div className="is-mt-3 is-flex is-flex-col is-gap-2">
              <Choice
                label={__('WordPress Media Library (recommended)')}
                description={__('Images stored under wp-content/uploads. No setup required.')}
                checked={driver === 'media_library'}
                onSelect={() => setDriver('media_library')}
              />
              <Choice
                label={__('S3-compatible bucket (advanced)')}
                description={__('Cloudflare R2, Bunny, Amazon S3, Backblaze B2, DigitalOcean Spaces, Wasabi, MinIO.')}
                checked={driver === 's3'}
                onSelect={() => setDriver('s3')}
              />
            </div>
            <p className="is-mt-3 is-text-xs is-text-slate-500">
              {__('You can change this later from Storage Settings.')}
            </p>
            <div className="is-mt-6 is-flex is-justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>
                {__('Back')}
              </Button>
              <Button onClick={finish} loading={saving}>
                {__('Finish setup')}
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Steps({ current, total }: { current: number; total: number }): JSX.Element {
  return (
    <ol className="is-mt-4 is-flex is-gap-2">
      {Array.from({ length: total }, (_, index) => index + 1).map((index) => (
        <li
          key={index}
          className={`is-flex-1 is-h-1 is-rounded ${index <= current ? 'is-bg-brand-600' : 'is-bg-slate-200'}`}
          aria-label={`Step ${index}`}
        />
      ))}
    </ol>
  );
}

interface ChoiceProps {
  label: string;
  description: string;
  checked: boolean;
  onSelect: () => void;
}

function Choice({ label, description, checked, onSelect }: ChoiceProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`is-w-full is-text-left is-px-4 is-py-3 is-rounded is-border-2 ${
        checked ? 'is-border-brand-600 is-bg-brand-50' : 'is-border-slate-200 hover:is-border-slate-300'
      } is-flex is-gap-3 is-items-start is-bg-white`}
    >
      <span
        className={`is-mt-1 is-w-4 is-h-4 is-rounded-full is-border-2 is-flex is-items-center is-justify-center is-shrink-0 ${
          checked ? 'is-border-brand-600' : 'is-border-slate-300'
        }`}
      >
        {checked && <span className="is-w-2 is-h-2 is-rounded-full is-bg-brand-600" />}
      </span>
      <span className="is-flex-1">
        <span className="is-block is-font-medium is-text-slate-900">{label}</span>
        <span className="is-block is-text-sm is-text-slate-600">{description}</span>
      </span>
    </button>
  );
}
