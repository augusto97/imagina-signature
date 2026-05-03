import { useEffect, useState, type FC } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@admin/components/Button';
import { Spinner } from '@admin/components/Spinner';
import { apiCall, ApiError } from '@admin/api';
import { __ } from '@admin/i18n';
import type { SiteSettings } from '@admin/types';
import { Banner, Section, type Flash } from './_shared';

const HEX_REGEX = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/;
const MAX_PALETTE = 12;
const DEFAULT_NEW_COLOR = '#2563eb';

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
 *
 * 1.0.28 UX rewrite. The previous version separated the colour
 * picker from the "Add" button and required the user to type a hex
 * code or pick + click — the user reported they "couldn't add
 * colours". The new flow:
 *
 *   - "+ Add colour" button appends a default swatch (#2563eb).
 *     Click feels instant.
 *   - Every existing swatch is itself a `<input type="color">`
 *     styled to look like a colour block. Click opens the OS picker;
 *     on change the entry's hex updates in place.
 *   - Trash button still removes a swatch.
 *   - "Save palette" persists everything in one PATCH.
 *
 * The Add and Edit affordances are now visually obvious. There's no
 * hidden text input that required hex syntax.
 */
export const BrandingTab: FC = () => {
  const [palette, setPalette] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<'idle' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    void apiCall<SiteSettings>('/admin/site-settings')
      .then((s) => {
        // Defensive: if the server response doesn't include a palette
        // array (corrupted option, malformed response), default to
        // empty rather than leaving palette === null forever (which
        // would keep the spinner up indefinitely).
        setPalette(Array.isArray(s?.brand_palette) ? s.brand_palette : []);
      })
      .catch((e: Error) => {
        setError(e.message);
        setPalette([]);
      });
  }, []);

  const addBlankColor = (): void => {
    setFlash(null);
    if ((palette ?? []).length >= MAX_PALETTE) {
      setFlash({
        type: 'error',
        message: __('Palette is full (max %s colours).', String(MAX_PALETTE)),
      });
      return;
    }
    // Append a default colour. The user clicks the swatch to open
    // the native picker and customise it.
    setPalette((prev) => [...(prev ?? []), DEFAULT_NEW_COLOR]);
  };

  const updateColorAt = (index: number, hex: string): void => {
    const v = hex.trim().toLowerCase();
    if (!HEX_REGEX.test(v)) return;
    setPalette((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = v;
      return next;
    });
    setFlash(null);
  };

  const removeColorAt = (index: number): void => {
    setPalette((prev) => (prev ?? []).filter((_, i) => i !== index));
    setFlash(null);
  };

  const onSave = async (): Promise<void> => {
    if (palette === null) return;
    setBusy('saving');
    setFlash(null);
    const sent = [...palette];
    try {
      const next = await apiCall<SiteSettings>('/admin/site-settings', {
        method: 'PATCH',
        body: { brand_palette: sent },
      });

      if (!Array.isArray(next?.brand_palette)) {
        setFlash({
          type: 'error',
          message: __(
            'Server response did not include a palette. The save may not have persisted — please reload and verify.',
          ),
        });
        return;
      }

      // Server-side sanitisation may dedupe or drop entries. Reflect
      // exactly what's stored.
      setPalette(next.brand_palette);

      if (next.brand_palette.length !== sent.length) {
        setFlash({
          type: 'error',
          message: __(
            'Saved %s of %s colours. Duplicates / invalid entries were rejected by the server.',
            String(next.brand_palette.length),
            String(sent.length),
          ),
        });
        return;
      }

      setFlash({ type: 'success', message: __('Brand palette saved.') });
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
              'Up to %s colours that appear as quick-pick swatches under every ColorInput in the editor. Click a swatch to edit; click "+ Add colour" to append a new one.',
              String(MAX_PALETTE),
            )}
          >
            {palette.length === 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-3">
                <p className="flex-1 text-[12px] text-[var(--text-muted)]">
                  {__('No swatches yet. Use a starter set or add your own below.')}
                </p>
                <Button size="sm" variant="secondary" onClick={() => setPalette(STARTER_PALETTE)}>
                  {__('Use starter palette')}
                </Button>
              </div>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {palette.map((color, index) => (
                  <li
                    // Index-keyed because identical colours are valid
                    // mid-edit (a fresh swatch defaults to the same
                    // colour every time); a value-keyed list would
                    // collapse two entries into one React node.
                    key={`${index}-${color}`}
                    className="group relative flex items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] py-1 pl-1 pr-2 transition-colors hover:border-[var(--border-strong)]"
                  >
                    <label
                      className="relative inline-flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded ring-1 ring-inset ring-black/10"
                      style={{ backgroundColor: color }}
                      title={__('Click to edit colour')}
                    >
                      <input
                        type="color"
                        value={HEX_REGEX.test(color) ? color : DEFAULT_NEW_COLOR}
                        onChange={(e) => updateColorAt(index, e.target.value)}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        aria-label={__('Edit colour %s', color)}
                      />
                    </label>
                    <code className="font-mono text-[11.5px] uppercase text-[var(--text-secondary)]">
                      {color}
                    </code>
                    <button
                      type="button"
                      onClick={() => removeColorAt(index)}
                      title={__('Remove')}
                      className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] opacity-0 hover:bg-red-50 hover:text-[var(--danger)] group-hover:opacity-100"
                    >
                      <Trash2 size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus size={12} />}
                onClick={addBlankColor}
                disabled={(palette ?? []).length >= MAX_PALETTE}
              >
                {__('Add colour')}
              </Button>
              <span className="text-[11px] text-[var(--text-muted)]">
                {__('%s of %s used', String(palette.length), String(MAX_PALETTE))}
              </span>
            </div>
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
