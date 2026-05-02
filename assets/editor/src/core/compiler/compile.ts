import type { SignatureSchema } from '@/core/schema/signature';
import { rendererForBlock, type CompileContext } from '@/core/blocks/registry';
import { wrapInEmailShell } from './table-builder';
import { applyOutlookFixes } from './outlook-fixes';
import { minifyHtml } from './minify';
import { validateEmailHtml } from './validate';
import { substituteVariables } from './variables';
import { getConfig } from '@/bridge/apiClient';
import type { AppConfig } from '@/bridge/types';

export interface CompileResult {
  html: string;
  warnings: string[];
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
 *   4. Append the site-wide compliance footer (1.0.13+) if the admin
 *      enabled it — injected just before `</table></td></tr>` so it
 *      sits inside the same outer table as the rest of the
 *      signature, keeping width / centring intact.
 *   5. Substitute variables. Read-only `wp_*` system variables (from
 *      `IMGSIG_EDITOR_CONFIG.systemVariables`) are merged with the
 *      schema's user-defined ones; user-defined variables win on
 *      key conflict so the user can override any auto-merged value.
 *   6. Minify (drop non-conditional comments + inter-tag whitespace).
 *   7. Run validation, returning warnings alongside the HTML so the
 *      Export modal can surface them.
 *
 * Unknown block types contribute nothing to the output but produce
 * a warning so the bug is visible.
 */
export function compileSignature(schema: SignatureSchema): CompileResult {
  const ctx: CompileContext = {
    variables: schema.variables,
    warnings: [],
  };

  const blockChunks: string[] = [];
  for (const block of schema.blocks) {
    // Hidden blocks (Layers panel "eye" toggle flips `block.visible`
    // to false) must NOT ship in the exported HTML. Until 1.0.24 the
    // visible flag was honored on the canvas only — the user thought
    // they had hidden a banner / disclaimer, hit Export, and the
    // recipient still saw it. Compile-time skip closes that gap.
    if (block.visible === false) {
      continue;
    }
    const definition = rendererForBlock(block);
    if (!definition) {
      ctx.warnings.push(`Unknown block type "${block.type}" was skipped.`);
      continue;
    }
    blockChunks.push(definition.compile(block as never, ctx));
  }

  const concatenated = blockChunks.join('\n');
  const shelled = wrapInEmailShell(concatenated, schema.canvas);
  const withOutlookFixes = applyOutlookFixes(shelled);
  // Campaign banner first (sits visually right under the user's
  // signature content), THEN the compliance footer (which always
  // wants to be the very last thing the recipient sees).
  const withCampaign = appendBannerCampaign(withOutlookFixes, schema.canvas.width);
  const withFooter = appendComplianceFooter(withCampaign);

  // Merge: read-only wp_* variables first, then user-defined override.
  // The bootstrap config is optional in tests / standalone preview —
  // fall through to schema.variables only.
  const merged = mergedVariables(schema.variables);
  const { html: substituted, missing } = substituteVariables(withFooter, merged);
  const minified = minifyHtml(substituted);
  const validationWarnings = validateEmailHtml(minified);
  const variableWarnings = missing.map(
    (name) => `Variable "{{${name}}}" referenced but not defined; left as literal text.`,
  );

  return {
    html: minified,
    warnings: [...ctx.warnings, ...variableWarnings, ...validationWarnings],
    size: new Blob([minified]).size,
  };
}

function mergedVariables(userDefined: Record<string, string>): Record<string, string> {
  let system: Record<string, string> = {};
  try {
    system = getConfig().systemVariables ?? {};
  } catch {
    // Bootstrap config unavailable (test / standalone). System vars
    // simply contribute nothing — user-defined variables work as before.
  }
  return { ...system, ...userDefined };
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
function appendBannerCampaign(html: string, canvasWidth: number): string {
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

  const width = Math.max(100, Math.min(canvasWidth, pick.width || canvasWidth));
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
 * Strict HTML attribute-context escaper. Handles the four characters
 * that can break out of a double-quoted attribute (`&`, `<`, `>`,
 * `"`). Used by every block compile function that interpolates
 * user-controlled strings (URLs, alt text, names, hrefs).
 *
 * Exported for re-use across block compilers — see image, banner,
 * social-icons, contact-row, button-cta, vcard, avatar definitions.
 */
export function escapeAttr(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
