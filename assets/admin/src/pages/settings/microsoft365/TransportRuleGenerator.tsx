import { useEffect, useMemo, useState, type FC } from 'react';
import { AlertTriangle, Copy, Download, Terminal } from 'lucide-react';
import { Button } from '@admin/components/Button';
import { Spinner } from '@admin/components/Spinner';
import { apiCall } from '@admin/api';
import { __ } from '@admin/i18n';
import { normalizeBrandKit, type BrandKit } from '@shared/brandKit';
import type { SiteSettings, TemplateRow } from '@admin/types';
import { Field, Section } from '../_shared';
import { copyText, downloadText } from './browser';
import { compileForExchange, type ExchangeCompileResult } from './compileForExchange';
import {
  EXCHANGE_TOKENS,
  buildTransportRuleScript,
  randomGuardWord,
  sanitizeGuardWord,
  type RuleMode,
} from './transportRule';

interface Generated {
  script: string;
  result: ExchangeCompileResult;
}

/**
 * "Mail flow rule" generator: for organisations that can't deploy the
 * Outlook add-in. Compiles a template in this browser with Exchange
 * attribute tokens in place of our variables and produces an Exchange
 * Online PowerShell script (New-TransportRule / Set-TransportRule).
 */
export const TransportRuleGenerator: FC = () => {
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<number>(0);
  const [ruleName, setRuleName] = useState('');
  const [guard, setGuard] = useState(() => randomGuardWord());
  const [mode, setMode] = useState<RuleMode>('Enforce');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      apiCall<TemplateRow[]>('/templates?per_page=100'),
      apiCall<SiteSettings>('/admin/site-settings').catch(() => null),
    ])
      .then(([rows, site]) => {
        if (!alive) return;
        setTemplates(rows);
        setBrandKit(site?.brand_kit ? normalizeBrandKit(site.brand_kit) : null);
        if (rows.length > 0) setTemplateId(rows[0]!.id);
      })
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const template = useMemo(
    () => templates?.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  // Inputs changed: the script on screen no longer matches them.
  useEffect(() => {
    setGenerated(null);
    setCopied(false);
  }, [templateId, ruleName, guard, mode]);

  const effectiveName = ruleName.trim() || `Imagina Signatures - ${template?.name ?? ''}`.trim();

  const onGenerate = async (): Promise<void> => {
    if (!template) return;
    setBusy(true);
    setError(null);
    try {
      const result = await compileForExchange(template.json_content, { brandKit, guard });
      const script = buildTransportRuleScript({
        ruleName: effectiveName,
        html: result.html,
        guard,
        mode,
        templateName: template.name,
        generatedOn: new Date().toISOString().slice(0, 10),
      });
      setGenerated({ script, result });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async (): Promise<void> => {
    if (!generated) return;
    setCopied(await copyText(generated.script));
  };

  const onDownload = (): void => {
    if (!generated) return;
    const slug = (template?.slug ?? 'signature').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
    downloadText(`imagina-signatures-rule-${slug}.ps1`, generated.script, 'text/plain', true);
  };

  return (
    <Section
      title={__('Mail flow rule (no add-in)')}
      description={__(
        "For organisations that cannot deploy add-ins: Exchange Online appends the signature on the server to every message your people send, filling in each sender's details from Microsoft Entra ID / Active Directory.",
      )}
    >
      <ul className="list-disc space-y-1 pl-5 text-[12px] text-[var(--text-secondary)]">
        <li>
          {__(
            "Added on the server: senders don't see it while writing and it isn't saved in Sent Items. Only recipients see it.",
          )}
        </li>
        <li>
          {__(
            'Same design for everyone; per-person photos or images are not possible. Text comes from the directory, so keep job titles and phone numbers up to date there.',
          )}
        </li>
        <li>{__('Exchange limits the signature to 5,000 characters, HTML included.')}</li>
        <li>
          {__(
            "Replies and forwards that already contain the guard word are skipped, so signatures don't pile up in a thread.",
          )}
        </li>
        <li>
          {__(
            "Don't combine it with the Outlook add-in for the same people, or messages will carry two signatures.",
          )}
        </li>
      </ul>

      {loadError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">
          {loadError}
        </p>
      )}
      {templates === null && !loadError && (
        <div className="flex justify-center p-4">
          <Spinner size={18} />
        </div>
      )}
      {templates !== null && templates.length === 0 && (
        <p className="text-[12.5px] text-[var(--text-secondary)]">
          {__('There are no templates yet. Create one in Templates first.')}
        </p>
      )}

      {templates !== null && templates.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={__('Template')}>
              <select value={templateId} onChange={(e) => setTemplateId(Number(e.target.value))}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={__('Rule name')}
              hint={__('Re-running the script updates the rule with this name.')}
            >
              <input
                type="text"
                value={ruleName}
                placeholder={effectiveName}
                maxLength={64}
                onChange={(e) => setRuleName(e.target.value)}
              />
            </Field>
            <Field
              label={__('Guard word')}
              hint={__(
                'Hidden in the signature; messages that already contain it are not signed again.',
              )}
            >
              <input
                type="text"
                className="font-mono"
                value={guard}
                maxLength={40}
                onChange={(e) => setGuard(sanitizeGuardWord(e.target.value))}
              />
            </Field>
            <Field label={__('Mode')}>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value === 'Audit' ? 'Audit' : 'Enforce')}
              >
                <option value="Enforce">{__('Enforce (add the signature)')}</option>
                <option value="Audit">{__('Test (log only, change nothing)')}</option>
              </select>
            </Field>
          </div>

          <details className="rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] px-3 py-2 text-[12px]">
            <summary className="cursor-pointer font-medium text-[var(--text-primary)]">
              {__('How variables are filled in')}
            </summary>
            <table className="mt-2 w-full text-left">
              <tbody>
                {Object.entries(EXCHANGE_TOKENS).map(([name, token]) => (
                  <tr key={name} className="border-t border-[var(--border-default)]">
                    <td className="py-1 pr-3 font-mono text-[11.5px]">{`{{${name}}}`}</td>
                    <td className="py-1 font-mono text-[11.5px] text-[var(--text-secondary)]">
                      {token}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[var(--text-secondary)]">
              {__('Other company_* variables use the brand kit; anything else is left empty.')}
            </p>
          </details>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => void onGenerate()}
              disabled={busy || !template || !guard}
              icon={busy ? <Spinner size={12} /> : <Terminal size={14} />}
            >
              {__('Generate PowerShell script')}
            </Button>
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">
              {error}
            </p>
          )}

          {generated && (
            <GeneratedScript
              generated={generated}
              copied={copied}
              onCopy={() => void onCopy()}
              onDownload={onDownload}
            />
          )}
        </>
      )}
    </Section>
  );
};

const GeneratedScript: FC<{
  generated: Generated;
  copied: boolean;
  onCopy: () => void;
  onDownload: () => void;
}> = ({ generated, copied, onCopy, onDownload }) => {
  const { result, script } = generated;
  const warnings: string[] = [];
  if (result.size.tooLong) {
    warnings.push(
      __(
        'The signature is %1$s characters; Exchange accepts at most %2$s and will reject the rule. Remove blocks or pick a simpler template.',
        result.size.length.toLocaleString(),
        result.size.max.toLocaleString(),
      ),
    );
  }
  if (result.mapped.length === 0) {
    warnings.push(
      __('This template uses no personal variables, so every sender gets exactly the same text.'),
    );
  }
  if (result.emptied.length > 0) {
    warnings.push(
      __(
        'No directory equivalent, left empty: %s',
        result.emptied.map((n) => `{{${n}}}`).join(', '),
      ),
    );
  }
  warnings.push(...result.errors);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span
          className={
            result.size.tooLong
              ? 'rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700 ring-1 ring-red-200'
              : 'rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-emerald-200'
          }
        >
          {__(
            '%1$s / %2$s characters',
            result.size.length.toLocaleString(),
            result.size.max.toLocaleString(),
          )}
        </span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" onClick={onCopy} icon={<Copy size={13} />}>
            {copied ? __('Copied') : __('Copy')}
          </Button>
          <Button size="sm" onClick={onDownload} icon={<Download size={13} />}>
            {__('Download .ps1')}
          </Button>
        </div>
      </div>

      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900">
          {warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      <textarea
        readOnly
        value={script}
        rows={14}
        spellCheck={false}
        aria-label={__('PowerShell script')}
        className="w-full font-mono text-[11.5px]"
        onFocus={(e) => e.currentTarget.select()}
      />
      <p className="text-[11.5px] text-[var(--text-muted)]">
        {__(
          'Run it in PowerShell with the ExchangeOnlineManagement module, signed in as an Exchange administrator. Allow a few minutes before the rule applies.',
        )}
      </p>
    </div>
  );
};
