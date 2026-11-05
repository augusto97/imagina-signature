import { useEffect, useState, type FC } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@admin/components/Button';
import { Spinner } from '@admin/components/Spinner';
import { apiCall, ApiError } from '@admin/api';
import { __ } from '@admin/i18n';
import {
  MAX_CUSTOM_PROFILE_FIELDS,
  PROFILE_FIELD_TYPES,
  isValidCustomFieldKey,
  type ProfileFieldAdminDefinition,
  type ProfileFieldType,
  type ProfileFieldsConfig,
} from '@shared/profileFields';
import { Banner, Section, type Flash } from './_shared';

interface FieldsResponse {
  config: ProfileFieldsConfig;
  fields: ProfileFieldAdminDefinition[];
  max_custom: number;
}

type Mapping = ProfileFieldsConfig['mapping'][string];

const DATALIST_ID = 'imgsig-profile-meta-keys';

const TYPE_LABELS: Record<ProfileFieldType, () => string> = {
  text: () => __('Text'),
  phone: () => __('Phone'),
  url: () => __('URL'),
  email: () => __('Email'),
};

/**
 * Settings → Profile fields (`imgsig_manage_team`): where each profile
 * field's value comes from — the plugin's own field (edited on the
 * profile screens) or an existing user meta key such as an ACF field or
 * WooCommerce `billing_phone` — plus up to ten custom fields.
 */
export const ProfileFieldsTab: FC = () => {
  const [fields, setFields] = useState<ProfileFieldAdminDefinition[] | null>(null);
  const [mapping, setMapping] = useState<Record<string, Mapping>>({});
  const [custom, setCustom] = useState<ProfileFieldsConfig['custom']>([]);
  const [maxCustom, setMaxCustom] = useState(MAX_CUSTOM_PROFILE_FIELDS);
  const [metaKeys, setMetaKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);

  const apply = (res: FieldsResponse): void => {
    setFields(res.fields);
    setMapping(res.config.mapping);
    setCustom(res.config.custom);
    setMaxCustom(res.max_custom);
  };

  useEffect(() => {
    void apiCall<FieldsResponse>('/admin/profile-fields')
      .then(apply)
      .catch((e: Error) => setFlash({ type: 'error', message: e.message }));
    void apiCall<{ keys: string[] }>('/admin/profile-fields/meta-keys')
      .then((r) => setMetaKeys(r.keys))
      .catch(() => setMetaKeys([]));
  }, []);

  const canonical = (fields ?? []).filter((f) => !f.custom);
  const keyErrors = custom.map((c, i) => {
    if (!isValidCustomFieldKey(c.key)) {
      return __('Use lower-case letters, digits and _ (not wp_ / company_ or a built-in key).');
    }
    return custom.findIndex((o) => o.key === c.key) !== i ? __('This key is already used.') : '';
  });
  const invalid = keyErrors.some((e) => e !== '');

  const setSource = (key: string, next: Partial<Mapping>): void =>
    setMapping((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { source: 'plugin', meta_key: '' }), ...next },
    }));

  const onSave = async (): Promise<void> => {
    if (invalid) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await apiCall<FieldsResponse>('/admin/profile-fields', {
        method: 'PUT',
        body: { mapping, custom },
      });
      apply(res);
      setFlash({ type: 'success', message: __('Profile fields saved.') });
    } catch (e) {
      setFlash({
        type: 'error',
        message: e instanceof ApiError ? e.message : (e as Error).message,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {flash && (
        <Banner type={flash.type} message={flash.message} onDismiss={() => setFlash(null)} />
      )}

      {fields === null && !flash && (
        <div className="flex justify-center p-10">
          <Spinner size={20} />
        </div>
      )}

      <datalist id={DATALIST_ID}>
        {metaKeys.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>

      {fields !== null && (
        <div className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-[var(--shadow-xs)]">
          <Section
            title={__('Field sources')}
            description={__(
              'Keep a field in the plugin (people edit it in their profile) or read it from user data another plugin already keeps, e.g. an ACF field or WooCommerce “billing_phone”. Fields read from elsewhere are read-only here.',
            )}
          >
            <div className="divide-y divide-[var(--border-default)] rounded-md border border-[var(--border-default)]">
              {canonical.map((field) => (
                <SourceRow
                  key={field.key}
                  label={field.label}
                  fieldKey={field.key}
                  mapping={mapping[field.key]}
                  onChange={(next) => setSource(field.key, next)}
                />
              ))}
            </div>
          </Section>

          <Section
            title={__('Custom fields')}
            description={__(
              'Extra fields for your organisation (employee number, licence, extension…). Each one is available in signatures as {{key}}.',
            )}
          >
            {custom.length === 0 && (
              <p className="text-[12px] text-[var(--text-muted)]">{__('No custom fields yet.')}</p>
            )}
            <ul className="space-y-2">
              {custom.map((field, i) => (
                <li
                  key={i}
                  className="space-y-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-3"
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_auto]">
                    <input
                      type="text"
                      aria-label={__('Key')}
                      value={field.key}
                      placeholder={__('key')}
                      className="font-mono text-[12px]"
                      onChange={(e) => {
                        const key = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                        setCustom((prev) => prev.map((c, j) => (j === i ? { ...c, key } : c)));
                      }}
                    />
                    <input
                      type="text"
                      aria-label={__('Label')}
                      value={field.label}
                      placeholder={__('Label')}
                      onChange={(e) =>
                        setCustom((prev) =>
                          prev.map((c, j) => (j === i ? { ...c, label: e.target.value } : c)),
                        )
                      }
                    />
                    <select
                      aria-label={__('Type')}
                      value={field.type}
                      onChange={(e) =>
                        setCustom((prev) =>
                          prev.map((c, j) =>
                            j === i ? { ...c, type: e.target.value as ProfileFieldType } : c,
                          ),
                        )
                      }
                    >
                      {PROFILE_FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABELS[t]()}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      title={__('Remove field')}
                      onClick={() => setCustom((prev) => prev.filter((_, j) => j !== i))}
                      className="inline-flex h-9 w-9 items-center justify-center rounded text-[var(--text-muted)] hover:bg-red-50 hover:text-[var(--danger)]"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {keyErrors[i] && (
                    <p className="text-[11px] text-[var(--danger)]">{keyErrors[i]}</p>
                  )}
                  {isValidCustomFieldKey(field.key) && (
                    <SourceRow
                      compact
                      label={__('Source')}
                      fieldKey={field.key}
                      mapping={mapping[field.key]}
                      onChange={(next) => setSource(field.key, next)}
                    />
                  )}
                </li>
              ))}
            </ul>
            {custom.length < maxCustom && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus size={12} />}
                onClick={() => setCustom((prev) => [...prev, { key: '', label: '', type: 'text' }])}
              >
                {__('Add custom field')}
              </Button>
            )}
          </Section>

          <div className="flex justify-end gap-2 border-t border-[var(--border-default)] bg-[var(--bg-panel-soft)] px-5 py-4">
            <Button
              variant="primary"
              onClick={() => void onSave()}
              disabled={busy || invalid}
              icon={busy ? <Spinner size={12} /> : <Save size={14} />}
            >
              {__('Save profile fields')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const SourceRow: FC<{
  label: string;
  fieldKey: string;
  mapping: Mapping | undefined;
  onChange: (next: Partial<Mapping>) => void;
  compact?: boolean;
}> = ({ label, fieldKey, mapping, onChange, compact }) => {
  const source = mapping?.source ?? 'plugin';
  return (
    <div
      className={
        compact
          ? 'grid grid-cols-1 gap-2 sm:grid-cols-[120px_180px_minmax(0,1fr)] sm:items-center'
          : 'grid grid-cols-1 gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)] sm:items-center'
      }
    >
      <span className="min-w-0 text-[12.5px]">
        <span className="block truncate font-medium text-[var(--text-primary)]">{label}</span>
        {!compact && (
          <code className="font-mono text-[10.5px] text-[var(--text-muted)]">{`{{${fieldKey}}}`}</code>
        )}
      </span>
      <select
        aria-label={__('Source of %s', fieldKey)}
        value={source}
        onChange={(e) => onChange({ source: e.target.value as Mapping['source'] })}
        className="!py-1.5 text-[12px]"
      >
        <option value="plugin">{__('Profile field (editable)')}</option>
        <option value="meta">{__('Existing user data')}</option>
      </select>
      {source === 'meta' ? (
        <input
          type="text"
          list={DATALIST_ID}
          aria-label={__('User meta key for %s', fieldKey)}
          value={mapping?.meta_key ?? ''}
          placeholder={__('Meta key, e.g. billing_phone')}
          onChange={(e) => onChange({ meta_key: e.target.value.trim() })}
          className="!py-1.5 font-mono text-[12px]"
        />
      ) : (
        <span className="text-[11.5px] text-[var(--text-muted)]">
          {__('Edited in each person’s profile.')}
        </span>
      )}
    </div>
  );
};
