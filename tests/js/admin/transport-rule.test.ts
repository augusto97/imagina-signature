import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { emptyBrandKit } from '@shared/brandKit';
import {
  EXCHANGE_DISCLAIMER_MAX,
  EXCHANGE_TOKENS,
  buildTransportRuleScript,
  checkDisclaimerSize,
  collectVariableNames,
  escapePowerShellSingleQuoted,
  exchangeVariables,
  powerShellLiteral,
  randomGuardWord,
  sanitizeGuardWord,
  toAsciiHtml,
  withGuard,
} from '@admin/pages/settings/microsoft365/transportRule';
import { compileForExchange } from '@admin/pages/settings/microsoft365/compileForExchange';

/**
 * Minimal reader for one PowerShell single-quoted literal starting at
 * `text[start]` (a quote): `''` is one quote, a lone quote ends it.
 */
function readPsLiteral(text: string, start: number): { value: string; end: number } {
  expect(text[start]).toBe("'");
  let value = '';
  let i = start + 1;
  for (;;) {
    const ch = text[i];
    if (ch === undefined) throw new Error('Unterminated literal');
    if (ch === "'" || ch === '\u2018' || ch === '\u2019' || ch === '\u201a' || ch === '\u201b') {
      if (text[i + 1] === "'") {
        value += "'";
        i += 2;
        continue;
      }
      return { value, end: i };
    }
    value += ch;
    i++;
  }
}

function assignment(script: string, variable: string): string {
  const marker = `${variable} = `;
  const at = script.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  const { value, end } = readPsLiteral(script, at + marker.length);
  expect(script[end + 1]).toBe('\n');
  return value;
}

describe('Exchange variable mapping', () => {
  it('maps our variables to Exchange disclaimer tokens', () => {
    expect(EXCHANGE_TOKENS).toMatchObject({
      wp_display_name: '%%DisplayName%%',
      job_title: '%%Title%%',
      department: '%%Department%%',
      phone: '%%Phone%%',
      mobile: '%%MobilePhone%%',
      wp_email: '%%WindowsEmailAddress%%',
      company_name: '%%Company%%',
      address_line: '%%StreetAddress%%',
      city: '%%City%%',
    });
    for (const token of Object.values(EXCHANGE_TOKENS)) {
      expect(token).toMatch(/^%%[A-Za-z]+%%$/);
    }
  });

  it('collects every referenced variable once', () => {
    const schema = {
      blocks: [
        { type: 'text', content: 'Hi {{ wp_display_name }} – {{job_title}}' },
        { type: 'contact_row', rows: [{ href: 'tel:{{phone}}', label: '{{phone}}' }] },
      ],
      variables: { pronouns: 'she/her' },
    };
    expect(collectVariableNames(schema)).toEqual(['job_title', 'phone', 'wp_display_name']);
    expect(collectVariableNames(null)).toEqual([]);
  });

  it('uses tokens, then the brand kit, then the template value, else empty', () => {
    const kit = emptyBrandKit();
    kit.company.website = 'https://acme.example';
    kit.company.name = 'ACME';
    const { values, mapped, emptied } = exchangeVariables(
      ['wp_display_name', 'company_name', 'company_website', 'company_logo', 'tagline', 'pronouns'],
      { brandKit: kit, templateVariables: { tagline: 'We build things' } },
    );

    expect(values).toEqual({
      wp_display_name: '%%DisplayName%%',
      company_name: '%%Company%%',
      company_website: 'https://acme.example',
      company_logo: '',
      tagline: 'We build things',
      pronouns: '',
    });
    expect(mapped).toEqual(['wp_display_name', 'company_name']);
    expect(emptied).toEqual(['company_logo', 'pronouns']);
  });
});

describe('PowerShell quoting', () => {
  it('doubles single quotes, including the curly ones PowerShell also treats as quotes', () => {
    expect(escapePowerShellSingleQuoted("O'Brien")).toBe("O''Brien");
    expect(escapePowerShellSingleQuoted('it\u2019s \u2018quoted\u2019')).toBe("it''s ''quoted''");
    expect(escapePowerShellSingleQuoted('a\u0000b\u001bc\td\ne')).toBe('abc\td\ne');
  });

  it('keeps line breaks only in multi-line literals', () => {
    expect(powerShellLiteral('one\r\ntwo')).toBe("'one two'");
    expect(powerShellLiteral('one\ntwo', true)).toBe("'one\ntwo'");
  });

  it('rewrites non-ASCII as numeric entities and leaves tokens alone', () => {
    expect(toAsciiHtml('<td>Pérez \u2019 😀 %%Title%%</td>')).toBe(
      '<td>P&#233;rez &#8217; &#128512; %%Title%%</td>',
    );
  });

  it('round-trips hostile HTML through the generated script', () => {
    const html = toAsciiHtml(
      "<td style=\"font-family:'Trebuchet MS'\">O'Brien ‘x’ $(Remove-Item C:\\) `n @' '@</td>",
    );
    const script = buildTransportRuleScript({
      ruleName: "Sales' rule",
      html,
      guard: 'ISIGABC123',
      mode: 'Enforce',
      templateName: 'Evil\nRemove-Item C:\\ -Recurse',
      generatedOn: '2026-11-05',
    });

    expect(assignment(script, '$Html')).toBe(html);
    expect(assignment(script, '$RuleName')).toBe("Sales' rule");
    // The template name stays inside its comment line.
    expect(script).toContain('# Template: Evil Remove-Item C:\\ -Recurse - generated 2026-11-05\n');
    expect(script.split('\n').filter((l) => l.startsWith('Remove-Item'))).toEqual([]);
  });
});

describe('Transport rule script', () => {
  const script = buildTransportRuleScript({
    ruleName: 'Imagina Signatures - Corporate',
    html: '<table><tr><td>%%DisplayName%%</td></tr></table>',
    guard: 'ISIG7F3A2C',
    mode: 'Enforce',
    templateName: 'Corporate',
    generatedOn: '2026-11-05',
  });

  it('connects, then creates or updates the rule with the disclaimer parameters', () => {
    expect(script).toContain('Connect-ExchangeOnline');
    expect(script).toContain("FromScope                          = 'InOrganization'");
    expect(script).toContain("ApplyHtmlDisclaimerLocation        = 'Append'");
    expect(script).toContain('ApplyHtmlDisclaimerText            = $Html');
    expect(script).toContain("ApplyHtmlDisclaimerFallbackAction  = 'Wrap'");
    expect(script).toContain("ExceptIfSubjectOrBodyContainsWords = 'ISIG7F3A2C'");
    expect(script).toContain("Mode                               = 'Enforce'");
    expect(script).toContain('New-TransportRule -Name $RuleName @Params');
    expect(script).toContain('Set-TransportRule -Identity $RuleName @Params');
    expect(assignment(script, '$RuleName')).toBe('Imagina Signatures - Corporate');
  });

  it('supports a log-only test mode and no guard', () => {
    const audit = buildTransportRuleScript({
      ruleName: '',
      html: '<p>x</p>',
      guard: '',
      mode: 'Audit',
      templateName: 'T',
      generatedOn: '2026-11-05',
    });
    expect(audit).toContain("= 'Audit'");
    expect(audit).not.toContain('ExceptIfSubjectOrBodyContainsWords');
    expect(assignment(audit, '$RuleName')).toBe('Imagina Signatures');
  });

  it('warns above the 5,000 character disclaimer limit', () => {
    expect(EXCHANGE_DISCLAIMER_MAX).toBe(5000);
    expect(checkDisclaimerSize('x'.repeat(5000))).toEqual({
      length: 5000,
      max: 5000,
      tooLong: false,
    });
    expect(checkDisclaimerSize('x'.repeat(5001)).tooLong).toBe(true);
  });

  it('hides the guard word in the signature', () => {
    const html = withGuard('<table></table>', 'ISIG1');
    expect(html.startsWith('<table></table>')).toBe(true);
    expect(html).toContain('display:none');
    expect(html).toContain('mso-hide:all');
    expect(html).toContain('>ISIG1</div>');
    expect(withGuard('<p></p>', '')).toBe('<p></p>');
    expect(sanitizeGuardWord('isig-7f 3a"<b>')).toBe('isig7f3ab');
    expect(randomGuardWord()).toMatch(/^ISIG[0-9A-F]{6}$/);
  });
});

describe('compileForExchange', () => {
  function templateWithVariables(): unknown {
    // The shipped template already uses the profile / WordPress / brand
    // variables; add one Exchange has no token for.
    const raw = readFileSync(resolve(process.cwd(), 'templates/corporate-classic.json'), 'utf8');
    expect(raw).toContain('{{job_title}}');
    return JSON.parse(raw.replace('{{job_title}}', '{{job_title}} · {{pronouns}}'));
  }

  it('compiles a template with Exchange tokens in place of our variables', async () => {
    const result = await compileForExchange(templateWithVariables(), { guard: 'ISIGTEST01' });

    expect(result.html).toContain('%%DisplayName%%');
    expect(result.html).toContain('%%Title%%');
    expect(result.html).toContain('%%Company%%');
    expect(result.html).toContain('mailto:%%WindowsEmailAddress%%');
    expect(result.html).toContain('%%Phone%%');
    expect(result.html).toContain('&#183;'); // "·" as an entity: the script stays ASCII.
    expect(result.html).not.toContain('{{');
    expect(result.html).toContain('ISIGTEST01');
    expect(result.html).not.toMatch(/<!DOCTYPE|<body|<head/i);
    expect([...result.html].every((c) => c.charCodeAt(0) < 0x7f)).toBe(true);
    expect(result.html).toContain('%%Department%%');
    expect(result.mapped.sort()).toEqual([
      'company_name',
      'department',
      'job_title',
      'phone',
      'wp_display_name',
      'wp_email',
    ]);
    // No brand kit passed: its logo / website have no value either.
    expect(result.emptied.sort()).toEqual(['company_logo', 'company_website', 'pronouns']);
    expect(result.size.length).toBe(result.html.length);
    expect(result.size.tooLong).toBe(result.html.length > 5000);
  });

  it('rejects content that is not a signature schema', async () => {
    await expect(compileForExchange([], { guard: 'X' })).rejects.toThrow();
  });
});
