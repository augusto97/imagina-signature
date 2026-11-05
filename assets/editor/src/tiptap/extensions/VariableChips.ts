import { Extension } from '@tiptap/react';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * Shows `{{variable}}` tokens as inline chips inside the editor.
 *
 * Purely presentational: a ProseMirror decoration plugin wraps each
 * token in a styled span in the EDITOR VIEW only. The document — and
 * therefore the stored HTML — keeps the token as plain text, so the
 * compiler's substitution pass, the server sanitiser and older readers
 * see exactly what they always saw. Tokens split across marks (e.g.
 * half bold) are still matched, because matching runs on each
 * paragraph's text rather than on individual text nodes.
 */

export const VARIABLE_TOKEN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/** Class on every chip (tests / styling hooks). */
export const VARIABLE_CHIP_CLASS = 'is-variable-chip';

const CHIP_STYLE = [
  'background-color: var(--accent-soft, #dbeafe)',
  'color: var(--accent, #2563eb)',
  'border-radius: 4px',
  'padding: 0 3px',
  'font-weight: 500',
  'white-space: nowrap',
].join('; ');

/** One-character stand-in for inline leaf nodes (hard breaks), so string offsets = doc offsets. */
const LEAF = '\ufffc';

export function variableDecorations(doc: PmNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textBetween(0, node.content.size, undefined, LEAF);
    VARIABLE_TOKEN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = VARIABLE_TOKEN.exec(text)) !== null) {
      const from = pos + 1 + match.index;
      decorations.push(
        Decoration.inline(from, from + match[0].length, {
          class: VARIABLE_CHIP_CLASS,
          style: CHIP_STYLE,
          'data-variable': match[1] ?? '',
        }),
      );
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

const KEY = new PluginKey<DecorationSet>('imgsigVariableChips');

export const VariableChips = Extension.create({
  name: 'variableChips',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: KEY,
        state: {
          init: (_config, state) => variableDecorations(state.doc),
          apply: (tr, previous) => (tr.docChanged ? variableDecorations(tr.doc) : previous),
        },
        props: {
          decorations: (state) => KEY.getState(state),
        },
      }),
    ];
  },
});
