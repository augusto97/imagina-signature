import type { SignatureSchema } from '@/core/schema/signature';
import { migrateSchema, schemaNeedsMigration } from '@/core/schema/migrate';
import { walkBlocks } from '@/core/schema/tree';
import type { CompileContext } from '@/core/blocks/registry';
import { __ } from '@/i18n/helpers';
import { canvasWidth, wrapInEmailShell } from './table-builder';
import { compileBlocks } from './compile-block';
import { applyOutlookFixes } from './outlook-fixes';
import { minifyHtml } from './minify';
import { validateEmailOutput } from './validate';
import { resolvedVariables, substituteVariables } from './variables';
import { enforceSafeUrls } from './urls';
import { report, type CompileIssue } from './issues';
import { htmlToPlainText, schemaToPlainText } from './plain-text';
import { getConfig } from '@/bridge/apiClient';
import type { AppConfig } from '@/bridge/types';
import { attr, intPx } from './css';

export type { CompileIssue, CompileIssueLevel } from './issues';
export { compileBlock, compileBlocks } from './compile-block';

export interface CompileResult {
  /** Complete HTML document (doctype, head, body). Copy HTML / Download / test-send. */
  html: string;
  /**
   * The signature fragment — the outer shell table only (no doctype /
   * head / body). What "Copy visual" puts on the clipboard.
   */
  fragment: string;
  /** Clean plain-text version generated from the schema (text/plain clipboard part). */
  text: string;
  /** Warning-level messages (back-compat: existing callers keep working). */
  warnings: string[];
  /** Error-level messages: the export is broken for recipients until fixed. */
  errors: string[];
  /** Every diagnostic, leveled and (when known) attributed to a block. */
  issues: CompileIssue[];
  /** Byte size of `html`. */
  size: number;
}

/**
 * JSON → email-safe HTML compiler entry point (CLAUDE.md §9.2).
 *
 * Pipeline:
 *   1. Compile each block via its registered `compile()` and concat.
 *   2. Wrap in the email shell (DOCTYPE + mso pixels-per-inch +
 *      outer table sized to canvas.width).
 *   3. Apply Outlook-specific fixes (mso line-height, conditional
 *      reset).
 *   4. Append the campaign banner and the site-wide compliance footer
 *      (1.0.13+) inside the outer table so they share its width.
 *   5. Substitute variables. Read-only `wp_*` / `company_*` system
 *      variables (from `IMGSIG_EDITOR_CONFIG.systemVariables`) are
 *      merged (`resolvedVariables()`) with the
 *      schema's user-defined ones; user-defined variables win on
 *      key conflict so the user can override any auto-merged value.
 *   6. URL safety pass on the substituted document: unsafe hrefs →
 *      `#`, data: / javascript: / blob: images removed (errors),
 *      http / local / placeholder images flagged (warnings).
 *   7. Minify (drop non-conditional comments + structural whitespace).
 *   8. Validate the final output (size, Gmail length limit, leftovers).
 *
 * Unknown block types contribute nothing to the output but produce
 * a warning so the bug is visible.
 *
 * Accepts any supported schema version: older input (raw 1.0 template
 * JSON in the picker thumbnails, the template harness…) is cloned and
 * migrated first — the caller's object is never mutated.
 */
export function compileSignature(input: SignatureSchema): CompileResult {
  const schema = schemaNeedsMigration(input) ? migrateSchema(input) : input;
  const merged = resolvedVariables(schema.variables);
  const ctx: CompileContext = {
    variables: merged,
    warnings: [],
    issues: [],
    canvas: schema.canvas,
    availableWidth: canvasWidth(schema.canvas),
  };

  // Every block — top-level and nested — goes through compileBlock():
  // hidden blocks (Layers panel "eye") are skipped, unknown types warn,
  // `block.box` is applied. Until 1.0.24 the visible flag was honoured
  // on the canvas only, so "hidden" banners still reached recipients.
  const concatenated = compileBlocks(schema.blocks, ctx);
  const shelled = wrapInEmailShell(concatenated, schema.canvas, {
    fluid: usesStackedColumns(schema),
  });
  const withOutlookFixes = applyOutlookFixes(shelled);
  // Campaign banner first (sits visually right under the user's
  // signature content), THEN the compliance footer (which always
  // wants to be the very last thing the recipient sees).
  const withCampaign = appendBannerCampaign(withOutlookFixes, canvasWidth(schema.canvas));
  const withFooter = appendComplianceFooter(withCampaign);

  const { html: substituted, missing } = substituteVariables(withFooter, merged);
  for (const name of missing) {
    report(
      ctx,
      'warning',
      __('Variable "{{%s}}" referenced but not defined; left as literal text.', name),
      null,
      'missing-variable',
    );
  }

  const urlSafe = enforceSafeUrls(substituted, ctx);
  const minified = minifyHtml(urlSafe);
  const fragment = extractBodyFragment(minified);

  const issues: CompileIssue[] = [
    ...ctx.warnings.map((message): CompileIssue => ({ level: 'warning', message })),
    ...ctx.issues,
    ...validateEmailOutput(minified, fragment),
  ];

  return {
    html: minified,
    fragment,
    text: schemaToPlainText(schema, merged, plainTextExtras()),
    warnings: issues.filter((i) => i.level === 'warning').map((i) => i.message),
    errors: issues.filter((i) => i.level === 'error').map((i) => i.message),
    issues,
    size: new Blob([minified]).size,
  };
}

/**
 * Whether any visible container asks for stacking on narrow screens.
 * Those signatures get a fluid shell (`width:100%;max-width:Wpx`) so a
 * narrow client actually has less room than the columns need.
 */
function usesStackedColumns(schema: SignatureSchema): boolean {
  let found = false;
  walkBlocks(schema.blocks, (block) => {
    if (found || block.visible === false) return false;
    if (block.type === 'container' && block.stack_on_mobile === true) found = true;
    return !found;
  });
  return found;
}

/**
 * The pasteable signature: the outer shell table only — no doctype,
 * <head>, <title> or mso document settings. Everything between the
 * `<body …>` open tag and `</body>`.
 */
export function extractBodyFragment(html: string): string {
  const bodyOpen = html.search(/<body[\s>]/i);
  const bodyClose = html.lastIndexOf('</body>');
  if (bodyOpen === -1 || bodyClose === -1) return html;
  const contentStart = html.indexOf('>', bodyOpen) + 1;
  return html.slice(contentStart, bodyClose).trim();
}

/** Plain-text lines for the campaign banner and compliance footer. */
function plainTextExtras(): string[] {
  const lines: string[] = [];
  let config: AppConfig | null = null;
  try {
    config = getConfig();
  } catch {
    return lines;
  }
  const campaigns = config.bannerCampaigns;
  if (campaigns && campaigns.length > 0) {
    const pick = campaigns[stablePickIndex(campaigns.length)];
    if (pick?.image_url && pick.link_url) {
      lines.push('', `${pick.alt || pick.name || __('Link')}: ${pick.link_url}`);
    }
  }
  const footer = config.complianceFooter;
  if (footer?.enabled && footer.html) {
    lines.push('', htmlToPlainText(footer.html));
  }
  return lines;
}

/**
 * If the admin enabled a compliance footer in site settings, append
 * it inside the outer email-shell table so the footer inherits the
 * same width / centring as the rest of the signature.
 *
 * The shell ends with `…</td></tr></table></body></html>`. We insert
 * the footer block as a new `<tr><td>` directly before the closing
 * `</table>` — that's where the existing content's parent table
 * lives.
 */
function appendComplianceFooter(html: string): string {
  let footer: { enabled?: boolean; html?: string } | undefined;
  try {
    footer = getConfig().complianceFooter;
  } catch {
    return html;
  }
  if (!footer?.enabled || !footer.html) return html;

  const marker = '</td></tr>\n</table>';
  const idx = html.lastIndexOf(marker);
  if (idx === -1) return html;

  const footerRow = `</td></tr><tr><td style="padding-top:12px;font-size:11px;color:#64748b;line-height:1.5">${footer.html}</td></tr>\n</table>`;
  return html.slice(0, idx) + footerRow + html.slice(idx + marker.length);
}

/**
 * Pick one currently-active campaign at random and append it inside
 * the outer email-shell table as a new `<tr><td>` row. Re-running
 * `compileSignature()` re-runs the random pick, so each export rotates
 * between active banners.
 *
 * Insertion uses the same outer-table marker as the compliance footer
 * — a future change to the shell that breaks the marker silently no-
 * ops rather than corrupting the output.
 *
 * Banner is rendered as a centred `<a><img></a>` so it inherits the
 * canvas width but never overflows on narrow clients (`max-width:100%`).
 */
function appendBannerCampaign(html: string, maxWidth: number): string {
  let campaigns: AppConfig['bannerCampaigns'];
  try {
    campaigns = getConfig().bannerCampaigns;
  } catch {
    return html;
  }
  if (!campaigns || campaigns.length === 0) return html;

  // Stable pick instead of `Math.random()`: each compile of the same
  // session deterministically chooses the same banner. The previous
  // version re-rolled on every keystroke (compileSignature is invoked
  // from a useMemo keyed on schema), so the user could see one banner
  // in the Preview modal and a DIFFERENT banner the second time they
  // hit "Copy HTML". The session-stable pick still rotates between
  // editor sessions / page reloads — that's the rotation the spec
  // promises.
  const pick = campaigns[stablePickIndex(campaigns.length)];
  if (!pick || !pick.image_url) return html;

  const marker = '</td></tr>\n</table>';
  const idx = html.lastIndexOf(marker);
  if (idx === -1) return html;

  const width = intPx(pick.width || maxWidth, 100, maxWidth, maxWidth);
  // Escape EVERY interpolated attribute. Banner image_url / link_url
  // / alt come from admin input that's only loosely sanitised on the
  // server. A `"` in any field would break out of the attribute and
  // ship arbitrary HTML in the recipient's inbox. Use a strict
  // attribute-context escaper.
  const img = `<img src="${escapeAttr(pick.image_url)}" alt="${escapeAttr(pick.alt || pick.name || '')}" width="${width}" style="display:block;max-width:100%;height:auto;border:0;margin:0 auto" />`;
  const inner = pick.link_url
    ? `<a href="${escapeAttr(pick.link_url)}">${img}</a>`
    : img;

  const campaignRow = `</td></tr><tr><td style="padding-top:14px;text-align:center" data-imgsig-campaign="${escapeAttr(String(pick.id))}">${inner}</td></tr>\n</table>`;
  return html.slice(0, idx) + campaignRow + html.slice(idx + marker.length);
}

/**
 * Session-stable picker: one random index per page-load, then reused
 * for every subsequent compile in the same tab. Means "Preview" and
 * "Copy HTML" agree on which banner ships, while a fresh tab still
 * gets a different rotation. Stored on a module-level slot rather
 * than session storage — module re-runs only on page load.
 */
let bannerPickIndex: number | null = null;
function stablePickIndex(length: number): number {
  if (bannerPickIndex === null || bannerPickIndex >= length) {
    bannerPickIndex = Math.floor(Math.random() * length);
  }
  return bannerPickIndex;
}

/**
 * Strict HTML attribute-context escaper (`&`, `<`, `>`, `"`, `'`).
 *
 * Kept as a re-export for back-compat — new code should import
 * {@link attr} from `./css` (the central serializer) directly.
 */
export function escapeAttr(value: string): string {
  return attr(value);
}
