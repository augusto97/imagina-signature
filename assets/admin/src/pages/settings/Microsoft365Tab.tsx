import { useEffect, useState, type FC } from 'react';
import { AlertTriangle, Copy, Download, ExternalLink, KeyRound, Save } from 'lucide-react';
import { Button } from '@admin/components/Button';
import { Spinner } from '@admin/components/Spinner';
import { apiCall, ApiError, getConfig } from '@admin/api';
import { __ } from '@admin/i18n';
import { Banner, Section, type Flash } from './_shared';
import { copyText } from './microsoft365/browser';
import { TransportRuleGenerator } from './microsoft365/TransportRuleGenerator';

/** REST: GET / POST /admin/outlook. */
export interface OutlookState {
  enabled: boolean;
  replace_client_signature: boolean;
  add_in_id: string;
  version: string;
  display_name: string;
  key_preview: string;
  /** Contains the deployment key — team managers only. */
  manifest_url: string;
  manifest_download_url: string;
  signature_endpoint: string;
  https: boolean;
  well_known_url: string;
  well_known_served: boolean;
  well_known_payload: { allowed: string[] };
}

function canManageTeam(): boolean {
  try {
    return getConfig().capabilities.manage_team !== false;
  } catch {
    return false;
  }
}

/**
 * Settings → Microsoft 365.
 *
 * 1. Outlook add-in: enable, "replace the user's own signature", download
 *    the manifest, regenerate the deployment key, and the centralized
 *    deployment guide for the Microsoft 365 admin center.
 * 2. Mail flow rule generator for tenants that can't deploy add-ins.
 */
export const Microsoft365Tab: FC = () => {
  const [state, setState] = useState<OutlookState | null>(null);
  const [draft, setDraft] = useState<{ enabled: boolean; replace: boolean }>({
    enabled: false,
    replace: false,
  });
  const [busy, setBusy] = useState<'idle' | 'saving' | 'regenerating'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const allowed = canManageTeam();

  useEffect(() => {
    if (!allowed) return;
    void apiCall<OutlookState>('/admin/outlook')
      .then((s) => {
        setState(s);
        setDraft({ enabled: s.enabled, replace: s.replace_client_signature });
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [allowed]);

  if (!allowed) {
    return (
      <p className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] p-5 text-[13px] text-[var(--text-secondary)]">
        {__('Only team managers can configure the Microsoft 365 deployment.')}
      </p>
    );
  }

  if (state === null) {
    return loadError ? (
      <Banner type="error" message={loadError} onDismiss={() => setLoadError(null)} />
    ) : (
      <div className="flex justify-center p-10">
        <Spinner size={20} />
      </div>
    );
  }

  const dirty = draft.enabled !== state.enabled || draft.replace !== state.replace_client_signature;

  const fail = (e: unknown): void => {
    setFlash({ type: 'error', message: e instanceof ApiError ? e.message : (e as Error).message });
  };

  const onSave = async (): Promise<void> => {
    setBusy('saving');
    setFlash(null);
    try {
      const next = await apiCall<OutlookState>('/admin/outlook', {
        method: 'POST',
        body: { enabled: draft.enabled, replace_client_signature: draft.replace },
      });
      setState(next);
      setDraft({ enabled: next.enabled, replace: next.replace_client_signature });
      setFlash({ type: 'success', message: __('Microsoft 365 settings saved.') });
    } catch (e) {
      fail(e);
    } finally {
      setBusy('idle');
    }
  };

  const onRegenerate = async (): Promise<void> => {
    if (
      !window.confirm(
        __(
          'Generate a new deployment key? The manifest you uploaded to Microsoft 365 stops working until you upload the new one.',
        ),
      )
    ) {
      return;
    }
    setBusy('regenerating');
    setFlash(null);
    try {
      const next = await apiCall<OutlookState>('/admin/outlook/regenerate-key', { method: 'POST' });
      setState(next);
      setFlash({
        type: 'success',
        message: __(
          'New key generated. Download the manifest again and update the add-in in Microsoft 365.',
        ),
      });
    } catch (e) {
      fail(e);
    } finally {
      setBusy('idle');
    }
  };

  const onCopyUrl = async (): Promise<void> => {
    const ok = await copyText(state.manifest_url);
    setFlash(
      ok
        ? {
            type: 'success',
            message: __('Manifest URL copied. Keep it private: it contains the deployment key.'),
          }
        : { type: 'error', message: __('Could not copy to the clipboard.') },
    );
  };

  return (
    <div className="space-y-4">
      {flash && (
        <Banner type={flash.type} message={flash.message} onDismiss={() => setFlash(null)} />
      )}

      <div className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-[var(--shadow-xs)]">
        <Section
          title={__('Outlook add-in')}
          description={__(
            "Your Microsoft 365 administrator deploys the add-in once and Outlook inserts each employee's signature automatically in new messages and meetings: Outlook on the web, the new Outlook for Windows, Outlook for Mac, classic Outlook for Windows and, where supported, Outlook mobile.",
          )}
        >
          {!state.https && (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-900">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                {__(
                  'This site does not use HTTPS. Microsoft 365 only loads add-ins served over HTTPS, so Outlook will refuse this one. Switch the WordPress and site addresses (Settings → General) to https:// first.',
                )}
              </span>
            </div>
          )}

          <Toggle
            checked={draft.enabled}
            onChange={(enabled) => setDraft((d) => ({ ...d, enabled }))}
            label={__('Enable the Outlook add-in')}
            hint={__(
              'When off, the add-in finds no signatures and inserts nothing, and the manifest cannot be downloaded.',
            )}
          />
          <Toggle
            checked={draft.replace}
            onChange={(replace) => setDraft((d) => ({ ...d, replace }))}
            label={__("Replace the user's own Outlook signature")}
            hint={__(
              'Turns off the signature each person set up in Outlook (it becomes "(none)") so it doesn\'t appear under the company one. Users can turn theirs back on in Outlook settings.',
            )}
          />

          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={() => void onSave()}
              disabled={busy !== 'idle' || !dirty}
              icon={busy === 'saving' ? <Spinner size={12} /> : <Save size={14} />}
            >
              {__('Save')}
            </Button>
          </div>
        </Section>

        <Section
          title={__('Deploy to Microsoft 365')}
          description={__(
            'The manifest describes the add-in to Microsoft 365. It includes a private deployment key: share it only with your Microsoft 365 administrators.',
          )}
        >
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[12px]">
            <dt className="text-[var(--text-muted)]">{__('Add-in name')}</dt>
            <dd className="text-[var(--text-primary)]">{state.display_name}</dd>
            <dt className="text-[var(--text-muted)]">{__('Version')}</dt>
            <dd className="font-mono text-[var(--text-primary)]">{state.version}</dd>
            <dt className="text-[var(--text-muted)]">{__('Deployment key')}</dt>
            <dd className="font-mono text-[var(--text-primary)]">{state.key_preview}</dd>
          </dl>

          <div className="flex flex-wrap gap-2">
            {state.enabled ? (
              <a
                href={state.manifest_download_url}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-transparent bg-[var(--accent)] px-4 text-[13.5px] font-medium text-white shadow-[var(--shadow-xs)] hover:bg-[var(--accent-hover)]"
              >
                <Download size={14} />
                {__('Download manifest')}
              </a>
            ) : (
              <Button
                variant="primary"
                disabled
                icon={<Download size={14} />}
                title={__('Enable and save the add-in first.')}
              >
                {__('Download manifest')}
              </Button>
            )}
            <Button
              onClick={() => void onCopyUrl()}
              disabled={!state.enabled}
              icon={<Copy size={14} />}
            >
              {__('Copy manifest URL')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => void onRegenerate()}
              disabled={busy !== 'idle'}
              icon={busy === 'regenerating' ? <Spinner size={12} /> : <KeyRound size={14} />}
            >
              {__('Regenerate key')}
            </Button>
          </div>

          <ol className="list-decimal space-y-1.5 pl-5 text-[12.5px] text-[var(--text-primary)]">
            <li>{__('Enable the add-in above, save, and download the manifest.')}</li>
            <li>
              {__('Open the Microsoft 365 admin center and go to Settings → Integrated apps.')}{' '}
              <a
                href="https://admin.microsoft.com/#/Settings/IntegratedApps"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-[var(--accent)] hover:underline"
              >
                admin.microsoft.com <ExternalLink size={11} />
              </a>
            </li>
            <li>
              {__(
                'Choose "Upload custom apps", select "Office Add-in" as the app type and upload the manifest file (or paste the manifest URL).',
              )}
            </li>
            <li>
              {__(
                'Assign the add-in to the users or groups who should get the company signature, then finish the wizard.',
              )}
            </li>
            <li>
              {__(
                'Wait for it to propagate: it can take up to 24 hours to reach every mailbox. People may need to restart Outlook.',
              )}
            </li>
            <li>
              {__(
                'From then on, each person sees their signature in new messages, replies and meeting invitations. It is the primary signature they keep up to date here.',
              )}
            </li>
          </ol>
          <p className="text-[11.5px] text-[var(--text-muted)]">
            {__(
              'Each person needs a WordPress account with the same email address as their mailbox. After regenerating the key, upload the new manifest to update the add-in.',
            )}
          </p>

          {state.well_known_served ? (
            <p className="text-[11.5px] text-[var(--text-muted)]">
              {__('Classic Outlook for Windows also reads')}{' '}
              <a
                href={state.well_known_url}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[var(--accent)] hover:underline"
              >
                {state.well_known_url}
              </a>
              {', '}
              {__('which WordPress serves automatically while the add-in is enabled.')}
            </p>
          ) : (
            <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900">
              <p>
                {__(
                  'Classic Outlook for Windows needs this file at the root of your domain, which WordPress cannot serve from a sub-directory. Publish it yourself at:',
                )}{' '}
                <code className="font-mono">{state.well_known_url}</code>
              </p>
              <pre className="overflow-x-auto rounded bg-white/70 p-2 font-mono text-[11px]">
                {JSON.stringify(state.well_known_payload, null, 2)}
              </pre>
            </div>
          )}
        </Section>

        <TransportRuleGenerator />
      </div>
    </div>
  );
};

const Toggle: FC<{
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}> = ({ checked, onChange, label, hint }) => (
  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-3">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-0.5"
    />
    <div className="flex-1">
      <div className="text-[13px] font-medium text-[var(--text-primary)]">{label}</div>
      <div className="mt-0.5 text-[12px] text-[var(--text-secondary)]">{hint}</div>
    </div>
  </label>
);
