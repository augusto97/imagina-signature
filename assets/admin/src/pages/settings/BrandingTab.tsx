import { useEffect, useState, type FC } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@admin/components/Button';
import { Spinner } from '@admin/components/Spinner';
import { apiCall, ApiError } from '@admin/api';
import { __ } from '@admin/i18n';
import type { SiteSettings } from '@admin/types';
import { Banner, Field, Section, type Flash } from './_shared';

const HEX_REGEX = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/;
const MAX_PALETTE = 12;

const STARTER_PALETTE = [
  '#2563eb', // accent blue
  '#16a34a', // success green
  '#d97706', // warning orange
  '#dc2626', // danger red
  '#0f172a', // primary text
];

/**
 * Branding tab — manages the site-wide brand palette that surfaces
 * in every editor's ColorInput as quick-pick swatches.
 */
export const BrandingTab: FC = () => {
  const [palette, setPalette] = useState<string[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'idle' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    void apiCall<SiteSettings>('/admin/site-settings')
      .then((s) => setPalette(s.brand_palette))
      .catch((e: Error) => setError(e.message));
  }, []);

  const addColor = (value: string): void => {
    const v = value.trim().toLowerCase();
    if (!HEX_REGEX.test(v)) {
      setFlash({ type: 'error', message: __('Use a valid hex colour (e.g. #2563eb).') });
      return;
    }
    if ((palette ?? []).includes(v)) {
      setFlash({ type: 'error', message: __('That colour is already in the palette.') });
      return;
    }
    if ((palette ?? []).length >= MAX_PALETTE) {
      setFlash({
        type: 'error',
        message: __('Palette is full (max %s colours).', String(MAX_PALETTE)),
      });
      return;
    }
    setPalette((prev) => [...(prev ?? []), v]);
    setDraft('');
    setFlash(null);
  };

  const removeColor = (color: string): void => {
    setPalette((prev) => (prev ?? []).filter((c) => c !== color));
  };

  const onSave = async (): Promise<void> => {
    if (palette === null) return;
    setBusy('saving');
    setFlash(null);
    try {
      const next = await apiCall<SiteSettings>('/admin/site-settings', {
        method: 'PATCH',
        body: { brand_palette: palette },
      });
      setPalette(next.brand_palette);
      setFlash({ type: 'success', message: __('Brand palette saved.') });
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

      {palette === null && !error && (
        <div className="flex justify-center p-10">
          <Spinner size={20} />
        </div>
      )}

      {palette !== null && (
        <div className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-[var(--shadow-xs)]">
          <Section
            title={__('Brand palette')}
            description={__(
              'Up to %s colours that appear as quick-pick swatches under every ColorInput in the editor. Stored site-wide.',
              String(MAX_PALETTE),
            )}
          >
            {palette.length === 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-3">
                <p className="flex-1 text-[12px] text-[var(--text-muted)]">
                  {__('No swatches yet. Use a starter set or add your own below.')}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPalette(STARTER_PALETTE)}
                >
                  {__('Use starter palette')}
                </Button>
              </div>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {palette.map((color) => (
                  <li
                    key={color}
                    className="group flex items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] py-1 pl-1 pr-2 transition-colors hover:border-[var(--border-strong)]"
                  >
                    <span
                      className="h-7 w-7 rounded ring-1 ring-inset ring-black/10"
                      style={{ backgroundColor: color }}
                    />
                    <code className="font-mono text-[11.5px] uppercase text-[var(--text-secondary)]">
                      {color}
                    </code>
                    <button
                      type="button"
                      onClick={() => removeColor(color)}
                      title={__('Remove')}
                      className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] opacity-0 hover:bg-red-50 hover:text-[var(--danger)] group-hover:opacity-100"
                    >
                      <Trash2 size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Field
              label={__('Add a colour')}
              hint={__('Hex format: #abc, #aabbcc, or #aabbccdd. Press Enter to add.')}
            >
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={HEX_REGEX.test(draft) ? draft : '#2563eb'}
                  onChange={(e) => setDraft(e.target.value)}
                  className="!h-9 !w-12 !p-1"
                />
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addColor(draft);
                    }
                  }}
                  placeholder="#2563eb"
                  className="flex-1 font-mono"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus size={12} />}
                  onClick={() => addColor(draft)}
                  disabled={!draft.trim()}
                >
                  {__('Add')}
                </Button>
              </div>
            </Field>
          </Section>

          <div className="flex justify-end gap-2 border-t border-[var(--border-default)] bg-[var(--bg-panel-soft)] px-5 py-4">
            <Button
              variant="primary"
              onClick={() => void onSave()}
              disabled={busy !== 'idle'}
              icon={busy === 'saving' ? <Spinner size={12} /> : <Save size={14} />}
            >
              {__('Save palette')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
