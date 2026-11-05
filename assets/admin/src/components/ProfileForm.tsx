import { useEffect, useRef, useState, type FC } from 'react';
import { ImageUp, Lock, Save, UserRound } from 'lucide-react';
import { Button } from '@admin/components/Button';
import { Spinner } from '@admin/components/Spinner';
import { apiCall, ApiError } from '@admin/api';
import { __ } from '@admin/i18n';
import { AdminUploadError, isUploadEnabled, uploadImage } from '@admin/services/uploads';
import { Banner, type Flash } from '@admin/pages/settings/_shared';
import type { ProfilePayload } from '@admin/directoryTypes';

interface Props {
  /** REST path: `/me/profile` or `/admin/users/{id}/profile`. */
  endpoint: string;
  /** Called with the fresh payload after a successful save. */
  onSaved?: (payload: ProfilePayload) => void;
}

type Field = ProfilePayload['fields'][number];

/** Placeholders for the canonical fields (lazy so they translate at render time). */
const PLACEHOLDERS: Record<string, () => string> = {
  job_title: () => __('e.g. Sales Director'),
  department: () => __('e.g. Sales'),
  phone: () => __('e.g. +34 910 000 000'),
  mobile: () => __('e.g. +34 600 000 000'),
  photo_url: () => 'https://',
  linkedin_url: () => 'https://www.linkedin.com/in/…',
  calendar_url: () => 'https://',
  website_url: () => 'https://',
  address_line: () => __('e.g. Gran Vía 1, Madrid'),
  pronouns: () => __('e.g. she/her'),
};

/**
 * Profile editor shared by "My profile" (`/me/profile`) and any admin
 * surface editing someone else (`/admin/users/{id}/profile`).
 *
 * Fields the administrator mapped to another user meta key arrive with
 * `readonly: true` — they are shown disabled with their source and are
 * never sent back. Only fields whose draft differs from the stored value
 * enable Save; the server sanitises every value per type and answers
 * with the resolved profile, which replaces the draft.
 */
export const ProfileForm: FC<Props> = ({ endpoint, onSaved }) => {
  const [payload, setPayload] = useState<ProfilePayload | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'idle' | 'saving' | 'uploading'>('idle');
  const [flash, setFlash] = useState<Flash | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    setPayload(null);
    setLoadError(null);
    apiCall<ProfilePayload>(endpoint)
      .then((p) => {
        if (!alive) return;
        setPayload(p);
        setDraft(p.values);
      })
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, [endpoint]);

  if (loadError) {
    return <Banner type="error" message={loadError} onDismiss={() => setLoadError(null)} />;
  }
  if (!payload) {
    return (
      <div className="flex justify-center p-10">
        <Spinner size={20} />
      </div>
    );
  }

  const editable = payload.fields.filter((f) => !f.readonly);
  const changes: Record<string, string> = {};
  for (const field of editable) {
    const next = draft[field.key] ?? '';
    if (next !== (payload.values[field.key] ?? '')) changes[field.key] = next;
  }
  const dirty = Object.keys(changes).length > 0;

  const setValue = (key: string, value: string): void =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const onSave = async (): Promise<void> => {
    if (!dirty) return;
    setBusy('saving');
    setFlash(null);
    try {
      const next = await apiCall<ProfilePayload>(endpoint, {
        method: 'PATCH',
        body: { values: changes },
      });
      setPayload(next);
      setDraft(next.values);
      setFlash({ type: 'success', message: __('Profile saved.') });
      onSaved?.(next);
    } catch (e) {
      setFlash({
        type: 'error',
        message: e instanceof ApiError ? e.message : (e as Error).message,
      });
    } finally {
      setBusy('idle');
    }
  };

  const onPhoto = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setBusy('uploading');
    setFlash(null);
    try {
      const asset = await uploadImage(file, file.name || 'profile-photo');
      setValue('photo_url', asset.url);
    } catch (e) {
      setFlash({
        type: 'error',
        message: e instanceof AdminUploadError ? e.message : __('Upload failed.'),
      });
    } finally {
      setBusy('idle');
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const photoField = payload.fields.find((f) => f.key === 'photo_url');
  const photo = draft.photo_url || payload.values.photo_url || '';

  return (
    <div className="space-y-4">
      {flash && (
        <Banner type={flash.type} message={flash.message} onDismiss={() => setFlash(null)} />
      )}

      <div className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-[var(--shadow-xs)]">
        <header className="flex items-center gap-4 border-b border-[var(--border-default)] px-5 py-4">
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--bg-hover)] text-[var(--text-muted)]">
            {photo || payload.user.avatar ? (
              <img
                src={photo || payload.user.avatar}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <UserRound size={22} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-[var(--text-primary)]">
              {payload.user.display_name}
            </p>
            <p className="truncate text-[12px] text-[var(--text-secondary)]">
              {payload.user.email}
            </p>
            {payload.groups.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {payload.groups.map((g) => (
                  <span
                    key={g.id}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--text-secondary)]"
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full"
                      style={{ background: g.color }}
                    />
                    {g.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          {photoField && !photoField.readonly && isUploadEnabled() && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                data-testid="profile-photo-input"
                onChange={(e) => void onPhoto(e.target.files?.[0])}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== 'idle'}
                icon={busy === 'uploading' ? <Spinner size={12} /> : <ImageUp size={14} />}
                onClick={() => fileInput.current?.click()}
              >
                {__('Upload photo')}
              </Button>
            </>
          )}
        </header>

        <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2">
          {payload.fields.map((field) => (
            <ProfileInput
              key={field.key}
              field={field}
              value={draft[field.key] ?? ''}
              onChange={(v) => setValue(field.key, v)}
            />
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border-default)] bg-[var(--bg-panel-soft)] px-5 py-4">
          {dirty && (
            <Button
              variant="ghost"
              onClick={() => setDraft(payload.values)}
              disabled={busy !== 'idle'}
            >
              {__('Discard changes')}
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => void onSave()}
            disabled={!dirty || busy !== 'idle'}
            icon={busy === 'saving' ? <Spinner size={12} /> : <Save size={14} />}
          >
            {__('Save profile')}
          </Button>
        </div>
      </div>
    </div>
  );
};

const ProfileInput: FC<{ field: Field; value: string; onChange: (value: string) => void }> = ({
  field,
  value,
  onChange,
}) => {
  const id = `imgsig-profile-${field.key}`;
  const type = field.type === 'url' ? 'url' : field.type === 'email' ? 'email' : 'text';

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 flex items-center gap-1 text-[12px] font-medium text-[var(--text-secondary)]"
      >
        {field.readonly && <Lock size={11} className="shrink-0 text-[var(--text-muted)]" />}
        {field.label}
        <code className="ml-auto font-mono text-[10.5px] font-normal text-[var(--text-muted)]">
          {`{{${field.key}}}`}
        </code>
      </label>
      <input
        id={id}
        type={type}
        inputMode={field.type === 'phone' ? 'tel' : undefined}
        value={value}
        disabled={field.readonly}
        placeholder={PLACEHOLDERS[field.key]?.() ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={field.readonly ? 'cursor-not-allowed opacity-70' : undefined}
      />
      {field.readonly && (
        <span className="mt-1 block text-[11px] text-[var(--text-muted)]">
          {__('Synced from “%s” — edit it where that data is managed.', field.meta_key)}
        </span>
      )}
    </div>
  );
};
