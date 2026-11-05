#!/usr/bin/env node
/**
 * `npm run i18n:audit` — heuristic report of user-visible English
 * strings in the React sources that are NOT wrapped in `__()`.
 *
 * Flags:
 *   - JSX text with letters (`<p>Hello</p>`);
 *   - string literals in user-facing JSX attributes (title, placeholder,
 *     aria-label, alt, label, description, …);
 *   - string literals assigned to user-facing object keys
 *     (`label: 'Foo'`, `description: '…'`, `title: '…'`, `message: '…'`);
 *   - string literals passed to notification helpers (toast, setError…).
 *
 * It's a heuristic — some hits are intentional (sample content,
 * technical identifiers). Silence a line with an `i18n-ignore` comment
 * on it or on the line above, or a whole file with `i18n-ignore-file`.
 * Block definitions' `label` / `description` are skipped: they are
 * translated dynamically and listed in
 * assets/editor/src/i18n/dynamic-strings.ts (a test enforces that).
 * Exit code is always 0 unless `--strict`.
 */

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import ts from 'typescript';
import { listSourceFiles } from './extract-js.mjs';
import { ROOT } from './lib/catalog.mjs';

const ATTRS = new Set([
  'title',
  'placeholder',
  'aria-label',
  'aria-description',
  'alt',
  'label',
  'description',
  'hint',
  'help',
  'helpText',
  'tooltip',
  'caption',
  'heading',
  'subtitle',
  'emptyLabel',
  'confirmLabel',
  'cancelLabel',
  'message',
  'text',
]);
const KEYS = new Set(['label', 'description', 'title', 'message', 'hint', 'placeholder', 'help', 'tooltip', 'caption', 'heading', 'steps']);
const CALLS = new Set(['toast', 'showToast', 'notify', 'setError', 'setMessage', 'setNotice', 'setStatusText', 'alert', 'confirm']);

const looksHuman = (s) => /[A-Za-z]{2,}/.test(s) && !/^[a-z0-9_.:/-]+$/.test(s.trim());
/** JSX text is always output, so any word counts (but not bare entities like `&nbsp;`). */
const looksHumanText = (s) => /[A-Za-z]{2,}/.test(s.replace(/&[a-z]+;/gi, ''));

function audit(file) {
  const source = readFileSync(file, 'utf8');
  if (/i18n-ignore-file/.test(source)) return [];
  const lines = source.split('\n');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const hits = [];
  const ignored = (line) => /i18n-ignore/.test(lines[line - 1] ?? '') || /i18n-ignore/.test(lines[line - 2] ?? '');

  const push = (node, what, text) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    if (!ignored(line)) hits.push({ line, what, text: text.replace(/\s+/g, ' ').trim().slice(0, 90) });
  };

  const insideTranslate = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === '__') return true;
    }
    return false;
  };

  const isStringish = (n) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);

  /** `label` / `description` of a `const x: BlockDefinition<…> = {…}` (dynamic, listed elsewhere). */
  const inBlockDefinition = (node) => {
    const key = ts.isPropertyAssignment(node) ? node.name.getText(sf) : '';
    if (key !== 'label' && key !== 'description') return false;
    const obj = node.parent;
    const decl = obj && obj.parent;
    return Boolean(
      decl && ts.isVariableDeclaration(decl) && decl.type && /^BlockDefinition\b/.test(decl.type.getText(sf)),
    );
  };

  /** Walks up through ternaries / `??` / `||` / parens / arrays to the consuming node. */
  const consumer = (node) => {
    let p = node.parent;
    while (
      p &&
      (ts.isConditionalExpression(p) ||
        ts.isParenthesizedExpression(p) ||
        ts.isArrayLiteralExpression(p) ||
        (ts.isBinaryExpression(p) &&
          [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(
            p.operatorToken.kind,
          )))
    ) {
      // A ternary's condition isn't output.
      if (ts.isConditionalExpression(p) && p.condition === node) return null;
      node = p;
      p = p.parent;
    }
    return p ?? null;
  };

  const visit = (node) => {
    if ((isStringish(node) || ts.isTemplateExpression(node)) && !insideTranslate(node)) {
      const text = ts.isTemplateExpression(node)
        ? [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(' ')
        : node.text;
      const c = consumer(node);
      if (c && looksHuman(text)) {
        if (ts.isJsxExpression(c) && c.parent && (ts.isJsxElement(c.parent) || ts.isJsxFragment(c.parent))) {
          push(node, 'jsx-expr', text);
        } else if (ts.isJsxExpression(c) && c.parent && ts.isJsxAttribute(c.parent) && ATTRS.has(c.parent.name.getText(sf)) && !isStringish(c.expression)) {
          push(node, `attr ${c.parent.name.getText(sf)}`, text);
        } else if (ts.isPropertyAssignment(c) && !isStringish(c.initializer) && KEYS.has(c.name.getText(sf).replace(/['"]/g, ''))) {
          push(node, `key ${c.name.getText(sf)}`, text);
        }
      }
    }
    if (ts.isJsxText(node) && looksHumanText(node.getText(sf))) {
      push(node, 'jsx-text', node.getText(sf));
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(sf);
      const init = node.initializer;
      const lit = ts.isStringLiteral(init)
        ? init
        : ts.isJsxExpression(init) && init.expression && (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression))
          ? init.expression
          : null;
      if (ATTRS.has(name) && lit && looksHuman(lit.text)) push(node, `attr ${name}`, lit.text);
    } else if (ts.isPropertyAssignment(node) && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))) {
      const key = node.name.getText(sf).replace(/['"]/g, '');
      if (KEYS.has(key) && looksHuman(node.initializer.text) && !insideTranslate(node) && !inBlockDefinition(node)) {
        push(node, `key ${key}`, node.initializer.text);
      }
    } else if (ts.isCallExpression(node)) {
      const callee = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : '';
      const arg = node.arguments[0];
      if (CALLS.has(callee) && arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg) || ts.isTemplateExpression(arg)) && looksHuman(arg.getText(sf))) {
        push(node, `call ${callee}`, arg.getText(sf));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

let total = 0;
for (const file of listSourceFiles(ROOT)) {
  const hits = audit(file);
  if (hits.length === 0) continue;
  const rel = relative(ROOT, file);
  for (const h of hits) console.log(`${rel}:${h.line}  [${h.what}]  ${h.text}`);
  total += hits.length;
}
console.log(`\n${total} possible hard-coded string(s).`);
if (process.argv.includes('--strict') && total > 0) process.exit(1);
