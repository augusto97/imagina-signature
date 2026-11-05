#!/usr/bin/env node
/**
 * Collects every translatable `__('literal')` call from the React
 * apps (editor, admin, shared) using the TypeScript compiler API.
 *
 *   node scripts/i18n/extract-js.mjs            # summary + non-literal report
 *   node scripts/i18n/extract-js.mjs --json     # entries as JSON on stdout
 *   node scripts/i18n/extract-js.mjs --strict   # exit 1 on unexpected non-literal calls
 *
 * Only the FIRST argument of `__()` is the msgid; the rest are
 * sprintf-style substitutions. A `// translators: …` comment directly
 * above the call (or above the JSX line holding it) becomes an
 * extracted `#.` comment in the .pot.
 *
 * Non-literal calls (`__(def.label)`) can't be extracted statically.
 * They're reported so they can be fixed — either by passing a literal
 * or by listing the possible values in an explicit dynamic-strings
 * file (see assets/editor/src/i18n/dynamic-strings.ts). A non-literal
 * call that is intentionally dynamic is marked with an
 * `i18n-dynamic` comment on the same or the preceding line; `--strict`
 * only fails on unmarked ones.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCAN_DIRS = ['assets'];
const SKIP_DIRS = new Set(['node_modules', 'build', 'dist', 'vendor', 'public']);
const FUNCTION_NAMES = new Set(['__']);
/** `_n(singular, plural, count, …)`: both literal forms are msgids. */
const PLURAL_NAMES = new Set(['_n']);

/** Recursively lists .ts/.tsx sources (no tests, no declaration files). */
export function listSourceFiles(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name)) walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      if (/\.d\.ts$/.test(name) || /\.(test|spec)\.(ts|tsx)$/.test(name)) continue;
      out.push(full);
    }
  };
  for (const dir of SCAN_DIRS) walk(join(root, dir));
  return out.sort();
}

function lineOf(sf, pos) {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

/** Leading comment text for a node plus the text of the line above. */
function commentsAround(sf, node) {
  const text = sf.getFullText();
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  const comments = ranges.map((r) => text.slice(r.pos, r.end));

  // JSX: `{/* translators: … */}` or `// translators:` usually sits on
  // the line(s) just above the call — scan up to two previous lines.
  const lines = text.split('\n');
  const line = lineOf(sf, node.getStart(sf)) - 1;
  for (let i = Math.max(0, line - 2); i <= line; i++) comments.push(lines[i] ?? '');
  return comments;
}

function translatorNote(comments) {
  for (const c of comments) {
    const m = /translators:\s*(.*?)\s*(?:\*\/\s*\}?)?$/i.exec(c);
    if (m) return `translators: ${m[1]}`.trim();
  }
  return null;
}

/**
 * Extracts `__()` calls from one file.
 *
 * @returns {{ found: Array<{msgid, line, note}>, dynamic: Array<{line, expr, marked}> }}
 */
export function extractFromSource(fileName, source) {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const found = [];
  const dynamic = [];

  const isLiteral = (arg) =>
    arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg));

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      PLURAL_NAMES.has(node.expression.text)
    ) {
      const [one, other] = node.arguments;
      const line = lineOf(sf, node.getStart(sf));
      if (isLiteral(one) && isLiteral(other)) {
        const note = translatorNote(commentsAround(sf, node));
        found.push({ msgid: one.text, line, note: note ?? 'translators: singular form (count = 1)' });
        found.push({ msgid: other.text, line, note: note ?? 'translators: plural form (any other count)' });
      } else {
        const marked = commentsAround(sf, node).some((c) => /i18n-dynamic/.test(c));
        dynamic.push({ line, expr: node.getText(sf).replace(/\s+/g, ' ').slice(0, 100), marked });
      }
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      FUNCTION_NAMES.has(node.expression.text)
    ) {
      const arg = node.arguments[0];
      const line = lineOf(sf, node.getStart(sf));
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
        found.push({ msgid: arg.text, line, note: translatorNote(commentsAround(sf, node)) });
      } else {
        const marked = commentsAround(sf, node).some((c) => /i18n-dynamic/.test(c));
        dynamic.push({ line, expr: node.getText(sf).replace(/\s+/g, ' ').slice(0, 100), marked });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { found, dynamic };
}

/**
 * Scans the whole tree.
 *
 * @returns {{ entries: Map<string, {msgid, references: string[], notes: string[]}>, dynamic: object[], files: number, calls: number }}
 */
export function extractJs(root = ROOT) {
  const entries = new Map();
  const dynamic = [];
  let calls = 0;
  const files = listSourceFiles(root);

  for (const file of files) {
    const rel = relative(root, file).split('\\').join('/');
    const { found, dynamic: dyn } = extractFromSource(file, readFileSync(file, 'utf8'));
    for (const hit of found) {
      calls++;
      if (hit.msgid === '') continue;
      const entry = entries.get(hit.msgid) ?? { msgid: hit.msgid, references: [], notes: [] };
      entry.references.push(`${rel}:${hit.line}`);
      if (hit.note && !entry.notes.includes(hit.note)) entry.notes.push(hit.note);
      entries.set(hit.msgid, entry);
    }
    for (const d of dyn) dynamic.push({ file: rel, ...d });
  }
  return { entries, dynamic, files: files.length, calls };
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = new Set(process.argv.slice(2));
  const result = extractJs();

  if (args.has('--json')) {
    process.stdout.write(
      `${JSON.stringify({ entries: [...result.entries.values()], dynamic: result.dynamic }, null, 2)}\n`,
    );
  } else {
    console.log(
      `JS: ${result.calls} __() calls, ${result.entries.size} unique msgids in ${result.files} files.`,
    );
    const unmarked = result.dynamic.filter((d) => !d.marked);
    if (result.dynamic.length > 0) {
      console.log(`\nNon-literal __() calls (${result.dynamic.length}; unmarked: ${unmarked.length}):`);
      for (const d of result.dynamic) {
        console.log(`  ${d.marked ? '  ' : '! '}${d.file}:${d.line}  ${d.expr}`);
      }
      console.log(
        '\n  Marked (i18n-dynamic) calls rely on assets/editor/src/i18n/dynamic-strings.ts',
      );
      console.log('  listing every possible value; "!" marks calls that need fixing or marking.');
    }
  }

  if (args.has('--strict') && result.dynamic.some((d) => !d.marked)) {
    console.error('\nUnmarked non-literal __() calls found (see "!" lines above).');
    process.exit(1);
  }
}
