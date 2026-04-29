import { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Button } from '../../../editor/src/components/ui/Button';
import { Select } from '../../../editor/src/components/ui/Select';
import { __ } from '../../../editor/src/i18n/helpers';
import { pushToast } from '../../../editor/src/components/ui/Toaster';
import { setupApi } from '../api';

export function SettingsPage(): JSX.Element {
  const [mode, setMode] = useState<'single' | 'multi'>(window.ImaginaSignaturesData?.mode ?? 'single');
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await setupApi.save({
        mode,
        storage_driver: (window.ImaginaSignaturesData?.storage.driver as 'media_library' | 's3') ?? 'media_library',
      });
      pushToast(__('Settings saved.'), 'success');
    } catch {
      pushToast(__('Could not save settings.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="is-max-w-2xl is-mx-auto is-px-4 is-py-6">
      <header className="is-mb-6">
        <h1 className="is-text-2xl is-font-bold">{__('Settings')}</h1>
      </header>

      <div className="is-bg-white is-rounded is-shadow-sm is-border is-border-slate-200 is-p-5 is-flex is-flex-col is-gap-4">
        <Select
          label={__('Operating mode')}
          value={mode}
          onValueChange={(value) => setMode(value as 'single' | 'multi')}
          options={[
            { value: 'single', label: __('Single user (just me)') },
            { value: 'multi', label: __('Multi user (with plans and quotas)') },
          ]}
        />
        <div className="is-flex is-justify-end">
          <Button onClick={save} loading={saving}>
            {__('Save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
