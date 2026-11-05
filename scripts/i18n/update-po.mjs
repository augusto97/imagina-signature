#!/usr/bin/env node
/**
 * `npm run i18n:update [-- <locale>…]` — merges the .pot into every
 * languages/imagina-signatures-<locale>.po (a dependency-free
 * `msgmerge`):
 *
 *   - existing translations are kept;
 *   - references / extracted comments / flags are refreshed from the .pot;
 *   - new msgids are added with an empty msgstr;
 *   - msgids no longer in the .pot are kept as `#~` obsolete entries
 *     (ignored by the build) so a reworded string's old translation
 *     is still at hand.
 *
 * Passing locales creates their .po when missing (e.g. `-- es_MX`).
 */

import { existsSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  DOMAIN,
  LANG_DIR,
  POT_PATH,
  ROOT,
  entryKey,
  listPoFiles,
  parseHeader,
  readCatalogue,
  renderHeader,
  serializePo,
} from './lib/catalog.mjs';

if (!existsSync(POT_PATH)) {
  console.error('languages/imagina-signatures.pot is missing — run `npm run i18n:pot` first.');
  process.exit(1);
}

const pot = readCatalogue(POT_PATH);
const potHeader = parseHeader(pot.header);

const requested = process.argv.slice(2).filter((a) => /^[a-z]{2,3}(_[A-Za-z0-9]+)*$/.test(a));
const targets = listPoFiles();
for (const locale of requested) {
  if (!targets.some((t) => t.locale === locale)) {
    targets.push({ locale, path: join(LANG_DIR, `${DOMAIN}-${locale}.po`), fresh: true });
  }
}

const PLURAL_FORMS = {
  es: 'nplurals=2; plural=(n != 1);',
  en: 'nplurals=2; plural=(n != 1);',
  pt: 'nplurals=2; plural=(n != 1);',
  fr: 'nplurals=2; plural=(n > 1);',
};

for (const { locale, path, fresh } of targets) {
  const po = fresh ? { header: '', headerComments: [], entries: [] } : readCatalogue(path);
  const existing = new Map();
  for (const e of po.entries) {
    // Live entries win over obsolete duplicates.
    if (!existing.has(entryKey(e)) || !e.obsolete) existing.set(entryKey(e), e);
  }

  let added = 0;
  const merged = pot.entries.map((tpl) => {
    const old = existing.get(entryKey(tpl));
    existing.delete(entryKey(tpl));
    if (!old) added++;
    let msgstr = tpl.msgidPlural !== null ? ['', ''] : [''];
    if (old) msgstr = old.msgstr;
    const keepFuzzy = old && old.flags.includes('fuzzy') ? ['fuzzy'] : [];
    return {
      ...tpl,
      msgstr,
      translator: old ? old.translator : [],
      flags: [...keepFuzzy, ...tpl.flags],
      obsolete: false,
    };
  });

  const obsolete = [...existing.values()]
    .filter((e) => e.msgstr.some((s) => s !== ''))
    .map((e) => ({ ...e, obsolete: true, references: [] }));

  const header = parseHeader(po.header);
  const lang = locale.split('_')[0];
  header.set('Project-Id-Version', potHeader.get('Project-Id-Version') ?? 'Imagina Signatures');
  header.set('Report-Msgid-Bugs-To', potHeader.get('Report-Msgid-Bugs-To') ?? '');
  if (!header.has('Last-Translator')) header.set('Last-Translator', '');
  if (!header.has('Language-Team')) header.set('Language-Team', '');
  header.set('Language', locale);
  header.set('MIME-Version', '1.0');
  header.set('Content-Type', 'text/plain; charset=UTF-8');
  header.set('Content-Transfer-Encoding', '8bit');
  if (!header.has('Plural-Forms') || /INTEGER/.test(header.get('Plural-Forms'))) {
    header.set('Plural-Forms', PLURAL_FORMS[lang] ?? 'nplurals=2; plural=(n != 1);');
  }
  header.set('X-Generator', 'scripts/i18n/update-po.mjs');
  header.set('X-Domain', DOMAIN);

  const headerComments =
    po.headerComments.length > 0
      ? po.headerComments
      : [
          `${locale} translation of Imagina Signatures.`,
          'This file is distributed under the GPL-2.0-or-later license.',
        ];

  writeFileSync(
    path,
    serializePo({
      header: renderHeader(header),
      headerComments,
      entries: [...merged, ...obsolete],
    }),
  );
  console.log(
    `${relative(ROOT, path)}: ${merged.length} msgids, ${added} new, ${obsolete.length} obsolete.`,
  );
}

if (targets.length === 0) {
  console.log('No .po files found. Create one with `npm run i18n:update -- es_ES`.');
}
