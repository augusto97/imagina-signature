import { useEffect, useState, type FC } from 'react';
import { Globe, Save, ExternalLink } from 'lucide-react';
import { Button } from '@admin/components/Button';
import { Spinner } from '@admin/components/Spinner';
import { apiCall, ApiError } from '@admin/api';
import { __ } from '@admin/i18n';
import type { FrontendAccess } from '@admin/types';
import { Banner, Field, Section, type Flash } from './_shared';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Frontend access tab — controls the public-facing /<slug>/ route
 * that lets non-admin users (e.g. subscribers) edit their own
 * signatures without entering wp-admin.
 *
 * The form is just three controls:
 *   - Enabled toggle (master switch).
 *   - URL slug (text input + permalink preview).
 *   - Role checkboxes (which WP roles receive imgsig_use_signatures).
 *
 * Save round-trips via PATCH /admin/frontend-access. The backend
 * applies cap sync + rewrite flush automatically; the React side
 * just renders whatever the server returns.
 */
export const FrontendTab: FC = () => {
  const [state, setState] = useState<FrontendAccess | null>(null);
  const [slugDraft, setSlugDraft] = useState('');
  const [busy, setBusy] = useState<'idle' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    void apiCall<FrontendAccess>('/admin/frontend-access')
      .then((s) => {
        setState(s);
        setSlugDraft(s.slug);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (state === null && !error) {
    return (
      <div className="flex justify-center p-10">
        <Spinner size={20} />
      </div>
    );
  }

  if (state === null) {
    return error ? <Banner type="error" message={error} onDismiss={() => setError(null)} /> : null;
  }

  const toggleRole = (slug: string): void => {
    setState((prev) =>
      prev === null
        ? prev
        : {
            ...prev,
            roles: prev.roles.includes(slug)
              ? prev.roles.filter((r) => r !== slug)
              : [...prev.roles, slug],
          },
    );
  };

  const setEnabled = (enabled: boolean): void => {
    setState((prev) => (prev === null ? prev : { ...prev, enabled }));
  };

  const onSave = async (): Promise<void> => {
    if (state === null) return;
    const slug = slugDraft.trim().toLowerCase();
    if (!SLUG_REGEX.test(slug)) {
      setFlash({
        type: 'error',
        message: __('Slug must be lowercase letters, numbers, and dashes only.'),
      });
      return;
    }

    setBusy('saving');
    setFlash(null);
    try {
      const next = await apiCall<FrontendAccess>('/admin/frontend-access', {
        method: 'PATCH',
        body: {
          enabled: state.enabled,
          slug,
          roles: state.roles,
        },
      });
      setState(next);
      setSlugDraft(next.slug);
      setFlash({ type: 'success', message: __('Frontend access saved.') });
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

      <div className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-[var(--shadow-xs)]">
        <Section
          title={__('Public access')}
          description={__(
            'Expose the editor on a public-facing URL so users without wp-admin access (e.g. subscribers) can manage their own signatures. Each user only sees the signatures they own.',
          )}
        >
          <label className="flex items-start gap-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={state.enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="text-[13px] font-medium text-[var(--text-primary)]">
                {__('Enable frontend access')}
              </div>
              <div className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
                {__(
                  'When off the URL returns a 404. Capabilities granted below stay on the assigned roles even when off, so logged-in users with the cap can still access the wp-admin path.',
                )}
              </div>
            </div>
          </label>
        </Section>

        <Section
          title={__('URL slug')}
          description={__(
            'First path segment under the site root. The editor will be reachable at the URL shown below.',
          )}
        >
          <Field label={__('Slug')} hint={__('Lowercase letters, numbers, and dashes only.')}>
            <input
              type="text"
              value={slugDraft}
              onChange={(e) => setSlugDraft(e.target.value)}
              placeholder="signatures"
              className="font-mono"
            />
          </Field>
          <div className="flex items-center gap-2 rounded-md border border-dashed border-[var(--border-default)] bg-[var(--bg-panel-soft)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
            <Globe size={14} className="text-[var(--text-muted)]" />
            <code className="font-mono text-[var(--text-primary)]">{state.dashboard_url}</code>
            {state.enabled && (
              <a
                href={state.dashboard_url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
              >
                {__('Open')} <ExternalLink size={11} />
              </a>
            )}
          </div>
        </Section>

        <Section
          title={__('Roles with access')}
          description={__(
            'Roles selected here receive the imgsig_use_signatures capability. Administrators always have access; deselecting them here has no effect.',
          )}
        >
          <ul className="space-y-1.5">
            {state.available_roles.map((role) => {
              const checked = state.roles.includes(role.slug) || role.slug === 'administrator';
              const disabled = role.slug === 'administrator';
              return (
                <li key={role.slug}>
                  <label
                    className={`flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition-colors ${
                      disabled ? 'opacity-50' : 'cursor-pointer hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleRole(role.slug)}
                    />
                    <span className="text-[13px] text-[var(--text-primary)]">{role.label}</span>
                    <code className="ml-auto font-mono text-[11px] text-[var(--text-muted)]">
                      {role.slug}
                    </code>
                  </label>
                </li>
              );
            })}
          </ul>
        </Section>

        <div className="flex justify-end gap-2 border-t border-[var(--border-default)] bg-[var(--bg-panel-soft)] px-5 py-4">
          <Button
            variant="primary"
            onClick={() => void onSave()}
            disabled={busy !== 'idle'}
            icon={busy === 'saving' ? <Spinner size={12} /> : <Save size={14} />}
          >
            {__('Save')}
          </Button>
        </div>
      </div>
    </div>
  );
};
