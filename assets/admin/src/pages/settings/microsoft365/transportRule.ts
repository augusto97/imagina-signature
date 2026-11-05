import type { BrandKit } from '@shared/brandKit';

/**
 * Exchange Online mail flow rule ("transport rule") generator — the
 * alternative to the Outlook add-in for organisations that can't deploy
 * add-ins. Exchange appends one HTML disclaimer to every message sent by
 * the organisation and fills `%%Token%%` placeholders from each sender's
 * Entra ID / Active Directory attributes.
 *
 * Pure helpers only (no compiler, no DOM): variable mapping, PowerShell
 * quoting, size checks and the script itself. The compile step lives in
 * `compileForExchange.ts`.
 */

/**
 * Our signature variables → Exchange disclaimer tokens.
 *
 * Token names follow the current Exchange Online documentation
 * ("Organization-wide message disclaimers, signatures, footers, or
 * headers"): `%%Phone%%`, `%%MobilePhone%%`, `%%WindowsEmailAddress%%`…
 * (the Exchange 2010-era `%%PhoneNumber%%` / `%%MobileNumber%%` /
 * `%%Email%%` names aren't in that list).
 */
export const EXCHANGE_TOKENS: Readonly<Record<string, string>> = {
  wp_display_name: '%%DisplayName%%',
  wp_first_name: '%%FirstName%%',
  wp_last_name: '%%LastName%%',
  wp_email: '%%WindowsEmailAddress%%',
  job_title: '%%Title%%',
  department: '%%Department%%',
  phone: '%%Phone%%',
  mobile: '%%MobilePhone%%',
  fax: '%%Fax%%',
  office: '%%Office%%',
  company_name: '%%Company%%',
  address_line: '%%StreetAddress%%',
  city: '%%City%%',
  state: '%%StateOrProvince%%',
  postal_code: '%%PostalCode%%',
  country: '%%CountryOrRegion%%',
};

/** Exchange rejects disclaimer text longer than this (characters, HTML included). */
export const EXCHANGE_DISCLAIMER_MAX = 5000;

const VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/** Every `{{name}}` referenced anywhere in a schema (sorted, unique). */
export function collectVariableNames(schema: unknown): string[] {
  const names = new Set<string>();
  const json = JSON.stringify(schema ?? null) ?? '';
  for (const match of json.matchAll(VARIABLE_REGEX)) {
    names.add(match[1]!);
  }
  return Array.from(names).sort();
}

/**
 * The `company_*` values from the brand kit (mirrors
 * `BrandKit::company_variables()` in PHP). Company-wide constants, so a
 * rule can carry them as-is.
 */
export function brandKitVariables(kit: BrandKit | null | undefined): Record<string, string> {
  if (!kit) return {};
  const out: Record<string, string> = {
    company_name: kit.company.name,
    company_tagline: kit.company.tagline,
    company_website: kit.company.website,
    company_phone: kit.company.phone,
    company_email: kit.company.email,
    company_address: kit.company.address,
    company_logo: kit.company.logo_url,
  };
  for (const [network, url] of Object.entries(kit.social)) {
    out[`company_${network}`] = url;
  }
  return out;
}

export interface ExchangeVariableMap {
  /** Value for every referenced variable. */
  values: Record<string, string>;
  /** Variables mapped to an Exchange token. */
  mapped: string[];
  /** Variables with no per-sender equivalent, rendered empty. */
  emptied: string[];
}

/**
 * Resolves each referenced variable for a server-side rule:
 *  1. a per-sender attribute → its Exchange token;
 *  2. a `company_*` brand-kit field → the kit's value (same for everyone);
 *  3. a value the template itself defines → kept;
 *  4. anything else → '' (reported in `emptied`).
 */
export function exchangeVariables(
  names: string[],
  options: { brandKit?: BrandKit | null; templateVariables?: Record<string, unknown> } = {},
): ExchangeVariableMap {
  const kit = brandKitVariables(options.brandKit);
  const own = options.templateVariables ?? {};
  const values: Record<string, string> = {};
  const mapped: string[] = [];
  const emptied: string[] = [];

  for (const name of names) {
    const token = EXCHANGE_TOKENS[name];
    if (token) {
      values[name] = token;
      mapped.push(name);
    } else if (Object.prototype.hasOwnProperty.call(kit, name) && kit[name] !== '') {
      values[name] = kit[name]!;
    } else if (typeof own[name] === 'string' && own[name] !== '') {
      values[name] = own[name] as string;
    } else {
      values[name] = '';
      emptied.push(name);
    }
  }
  return { values, mapped, emptied };
}

/**
 * Rewrites every non-ASCII character as a numeric HTML entity, so the
 * script is pure ASCII: Windows PowerShell 5.1 reads a BOM-less .ps1 as
 * ANSI and would mangle "é" or "ñ", and the curly single quotes
 * (U+2018–U+201B) — which PowerShell treats as quote characters — can't
 * break the quoting.
 */
export function toAsciiHtml(html: string): string {
  let out = '';
  for (const char of html) {
    const code = char.codePointAt(0)!;
    out += code > 0x7e ? `&#${code};` : char;
  }
  return out;
}

/** Whether `code` is a C0 control, DEL or a Unicode line / paragraph separator. */
function isControl(code: number): boolean {
  return code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029;
}

/**
 * Body for a single-quoted PowerShell string literal: quotes doubled.
 * Curly single quotes count as quotes in PowerShell, so they are folded
 * to `'` first; control characters other than tab and line feed are
 * dropped.
 */
export function escapePowerShellSingleQuoted(value: string): string {
  let clean = '';
  for (const char of value.replace(/[\u2018\u2019\u201a\u201b]/g, "'")) {
    const code = char.charCodeAt(0);
    if (!isControl(code) || code === 0x09 || code === 0x0a) clean += char;
  }
  return clean.replace(/'/g, "''");
}

/** `'…'` PowerShell literal. Newlines are kept only when `multiline` (the HTML). */
export function powerShellLiteral(value: string, multiline = false): string {
  const body = multiline ? value : value.replace(/[\r\n]+/g, ' ');
  return `'${escapePowerShellSingleQuoted(body)}'`;
}

/** Text safe to place after a `#` comment marker (single line, ASCII-ish). */
function commentText(value: string): string {
  let out = '';
  for (const char of value) out += isControl(char.charCodeAt(0)) ? ' ' : char;
  return out.replace(/ {2,}/g, ' ').trim();
}

/** A random guard word, e.g. `ISIG7F3A2C`. */
export function randomGuardWord(): string {
  const bytes = new Uint8Array(3);
  globalThis.crypto.getRandomValues(bytes);
  return `ISIG${Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/** Letters and digits only — the guard must survive Exchange's word matching. */
export function sanitizeGuardWord(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
}

/**
 * Appends the guard word as hidden text: replies and forwards quote the
 * original message, so they contain the word and the rule's
 * `-ExceptIfSubjectOrBodyContainsWords` skips them (no stacked copies).
 */
export function withGuard(fragment: string, guard: string): string {
  if (!guard) return fragment;
  return `${fragment}<div style="display:none;font-size:0;line-height:0;max-height:0;overflow:hidden;mso-hide:all;">${guard}</div>`;
}

export type RuleMode = 'Enforce' | 'Audit';

export interface TransportRuleOptions {
  ruleName: string;
  /** Final disclaimer HTML (already ASCII + guarded). */
  html: string;
  guard: string;
  mode: RuleMode;
  templateName: string;
  /** ISO date shown in the header comment. */
  generatedOn: string;
}

/** The ready-to-run Exchange Online PowerShell script. */
export function buildTransportRuleScript(options: TransportRuleOptions): string {
  const name = options.ruleName.trim() || 'Imagina Signatures';
  const guardLine = options.guard
    ? `    ExceptIfSubjectOrBodyContainsWords = ${powerShellLiteral(options.guard)}\n`
    : '';

  return [
    '# Imagina Signatures - Exchange Online mail flow rule (server-side signature)',
    `# Template: ${commentText(options.templateName)} - generated ${commentText(options.generatedOn)}`,
    '#',
    '# Exchange appends this HTML to every message sent by people in your',
    "# organisation and fills %%DisplayName%%, %%Title%%... from each sender's",
    '# Entra ID / Active Directory attributes. Re-running the script updates the rule.',
    '#',
    '# Caveats: applied on the server, so senders never see it while composing',
    '# and it is not in Sent Items; recipients only. No per-user photos.',
    '# Messages Exchange cannot modify (signed / encrypted) are wrapped as an',
    '# attachment (fallback action Wrap).',
    '#',
    '# Requires the ExchangeOnlineManagement module',
    '#   Install-Module ExchangeOnlineManagement -Scope CurrentUser',
    '# and an account allowed to manage mail flow rules.',
    '',
    'Connect-ExchangeOnline',
    '',
    `$RuleName = ${powerShellLiteral(name)}`,
    `$Html = ${powerShellLiteral(options.html, true)}`,
    '',
    '$Params = @{',
    "    FromScope                          = 'InOrganization'",
    "    ApplyHtmlDisclaimerLocation        = 'Append'",
    '    ApplyHtmlDisclaimerText            = $Html',
    "    ApplyHtmlDisclaimerFallbackAction  = 'Wrap'",
    `${guardLine}    Mode                               = '${options.mode === 'Audit' ? 'Audit' : 'Enforce'}'`,
    '}',
    '',
    'if (Get-TransportRule -Identity $RuleName -ErrorAction SilentlyContinue) {',
    '    Set-TransportRule -Identity $RuleName @Params',
    '    Write-Host "Updated mail flow rule: $RuleName"',
    '} else {',
    '    New-TransportRule -Name $RuleName @Params',
    '    Write-Host "Created mail flow rule: $RuleName"',
    '}',
    '',
  ].join('\n');
}

export interface SizeCheck {
  length: number;
  max: number;
  tooLong: boolean;
}

/** Disclaimer length as Exchange counts it (the HTML handed to the cmdlet). */
export function checkDisclaimerSize(html: string): SizeCheck {
  return {
    length: html.length,
    max: EXCHANGE_DISCLAIMER_MAX,
    tooLong: html.length > EXCHANGE_DISCLAIMER_MAX,
  };
}
