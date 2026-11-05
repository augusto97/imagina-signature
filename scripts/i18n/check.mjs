#!/usr/bin/env node
/**
 * `npm run i18n:check` — exits 1 when translations are incomplete or
 * out of sync:
 *
 *   1. the committed .pot differs from a fresh extraction
 *      (→ `npm run i18n:pot`);
 *   2. a .po lacks a msgid of the fresh extraction, or has it empty /
 *      fuzzy (→ `npm run i18n:update`, then translate);
 *   3. a translation drops or adds a placeholder (`%s`, `%1$s`, `%d`),
 *      a `{{variable}}` or an HTML tag of its msgid;
 *   4. the committed .mo / .json differ from what the .po compiles to
 *      (→ `npm run i18n:build`).
 */

import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import {
  POT_PATH,
  ROOT,
  buildTemplateEntries,
  compileCatalogue,
  entryKey,
  isTranslated,
  jsonPath,
  listPoFiles,
  moPath,
  readCatalogue,
  renderPot,
} from './lib/catalog.mjs';

let problems = 0;
const fail = (msg) => {
  problems++;
  console.log(msg);
};

const { entries } = buildTemplateEntries();
if (!existsSync(POT_PATH) || readFileSync(POT_PATH, 'utf8') !== renderPot(entries)) {
  fail('✗ languages/imagina-signatures.pot is stale — run `npm run i18n:pot`.');
}

/** Placeholders / variables / tags that must survive translation, as a sorted multiset. */
function tokens(text) {
  return [
    ...(text.match(/%(\d+\$)?[sd]/g) ?? []),
    ...(text.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? []),
    ...(text.match(/<\/?[a-z][a-z0-9]*/gi) ?? []).map((t) => t.toLowerCase()),
  ]
    .sort()
    .join(' ');
}

const files = listPoFiles();
if (files.length === 0) fail('✗ No languages/*.po files found.');

for (const { locale, path } of files) {
  const rel = relative(ROOT, path);
  const po = readCatalogue(path);
  const byKey = new Map(po.entries.filter((e) => !e.obsolete).map((e) => [entryKey(e), e]));
  const missing = [];
  const broken = [];

  for (const tpl of entries) {
    const e = byKey.get(entryKey(tpl));
    if (!e || !isTranslated(e)) {
      missing.push(tpl);
      continue;
    }
    const allowed = new Set([tokens(tpl.msgid), tpl.msgidPlural !== null ? tokens(tpl.msgidPlural) : null]);
    for (const form of e.msgstr) {
      if (!allowed.has(tokens(form))) broken.push({ msgid: tpl.msgid, msgstr: form });
    }
  }

  if (missing.length === 0 && broken.length === 0) {
    console.log(`✓ ${rel}: all ${entries.length} msgids translated.`);
  }
  if (missing.length > 0) {
    fail(`✗ ${rel}: ${missing.length} msgid(s) missing a translation:`);
    for (const m of missing) {
      console.log(`    ${JSON.stringify(m.msgid)}  (${m.references[0] ?? 'no reference'})`);
    }
  }
  if (broken.length > 0) {
    fail(`✗ ${rel}: ${broken.length} translation(s) change placeholders / variables / tags:`);
    for (const b of broken) {
      console.log(`    ${JSON.stringify(b.msgid)}\n      → ${JSON.stringify(b.msgstr)}`);
    }
  }

  const built = compileCatalogue(po);
  const moStale = !existsSync(moPath(locale)) || !readFileSync(moPath(locale)).equals(built.mo);
  const jsonStale =
    !existsSync(jsonPath(locale)) || readFileSync(jsonPath(locale), 'utf8') !== built.json;
  if (moStale || jsonStale) {
    const which = [moStale ? '.mo' : null, jsonStale ? '.json' : null].filter(Boolean).join(' / ');
    fail(`✗ ${rel}: compiled ${which} out of date — run \`npm run i18n:build\`.`);
  }
}

if (problems > 0) {
  console.log(
    `\n${problems} i18n problem(s). Refresh with: npm run i18n:pot && npm run i18n:update,` +
      ' translate the new msgids in languages/*.po, then npm run i18n:build.',
  );
  process.exit(1);
}
console.log('\ni18n OK.');
