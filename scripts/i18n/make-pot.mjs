#!/usr/bin/env node
/**
 * `npm run i18n:pot` — regenerates languages/imagina-signatures.pot
 * from the PHP sources (tokenizer) and the React sources (TypeScript
 * compiler API), merged and deduplicated with file:line references.
 *
 * Requires the `php` CLI (for token_get_all) and the `typescript`
 * devDependency. No WP-CLI / gettext needed.
 */

import { writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { POT_PATH, ROOT, buildTemplateEntries, renderPot, usedByJs } from './lib/catalog.mjs';

const { entries, phpDynamic, jsDynamic } = buildTemplateEntries();
writeFileSync(POT_PATH, renderPot(entries));

const php = entries.filter((e) => e.references.some((r) => !r.startsWith('assets/'))).length;
const js = entries.filter(usedByJs).length;
console.log(
  `Wrote ${relative(ROOT, POT_PATH)}: ${entries.length} msgids (${php} referenced from PHP, ${js} from JS).`,
);

const unmarkedJs = jsDynamic.filter((d) => !d.marked);
if (phpDynamic.length > 0 || unmarkedJs.length > 0) {
  console.log('\nNon-literal gettext calls (not extractable — use a literal or list the values):');
  for (const d of phpDynamic) console.log(`  ${d.file}:${d.line}  ${d.expr}`);
  for (const d of unmarkedJs) console.log(`  ${d.file}:${d.line}  ${d.expr}`);
}
