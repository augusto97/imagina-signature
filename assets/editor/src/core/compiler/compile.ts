import type { SignatureSchema } from '@/core/schema/signature';
import { rendererForBlock, type CompileContext } from '@/core/blocks/registry';
import { wrapInEmailShell } from './table-builder';
import { applyOutlookFixes } from './outlook-fixes';
import { minifyHtml } from './minify';
import { validateEmailHtml } from './validate';
import { substituteVariables } from './variables';
import { getConfig } from '@/bridge/apiClient';

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
  const withFooter = appendComplianceFooter(withOutlookFixes);

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

  // Outer table closing tag — `wrapInEmailShell` emits exactly this
  // pattern. If a future change to the shell breaks the marker, the
  // append silently no-ops rather than corrupting the output.
  const marker = '</td></tr>\n</table>';
  const idx = html.lastIndexOf(marker);
  if (idx === -1) return html;

  const footerRow = `</td></tr><tr><td style="padding-top:12px;font-size:11px;color:#64748b;line-height:1.5">${footer.html}</td></tr>\n</table>`;
  return html.slice(0, idx) + footerRow + html.slice(idx + marker.length);
}
