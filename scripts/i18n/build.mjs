#!/usr/bin/env node
/**
 * `npm run i18n:build` — compiles every languages/*.po into:
 *
 *   - languages/imagina-signatures-<locale>.mo   (PHP, load_textdomain)
 *   - languages/imagina-signatures-<locale>.json (React apps; injected as
 *     `translations` into the IMGSIG_*_CONFIG bootstrap objects)
 *
 * Pure Node — no msgfmt required. Output is deterministic, so
 * `npm run i18n:check` can tell when the committed artefacts are stale.
 */

import { writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import {
  ROOT,
  compileCatalogue,
  jsonPath,
  listPoFiles,
  moPath,
  readCatalogue,
} from './lib/catalog.mjs';

const files = listPoFiles();
if (files.length === 0) console.log('No .po files to compile.');

for (const { locale, path } of files) {
  const { mo, json, translated, total, jsCount } = compileCatalogue(readCatalogue(path));
  writeFileSync(moPath(locale), mo);
  writeFileSync(jsonPath(locale), json);
  console.log(
    `${relative(ROOT, path)} → .mo (${translated}/${total} translated), .json (${jsCount} JS strings)`,
  );
}
