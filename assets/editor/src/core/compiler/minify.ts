/**
 * Minifies the compiled HTML without changing what it renders.
 *
 * Rules:
 *  1. Outlook conditional comments are kept byte-identical. Two forms
 *     are in play:
 *       - downlevel-hidden   `<!--[if mso]>…<![endif]-->`
 *       - downlevel-revealed `<!--[if !mso]><!-->…<!--<![endif]-->`
 *     If the `<!--<![endif]-->` closer of the second form were
 *     stripped, its opener would have no `-->` and the comment would
 *     swallow everything after it. Every block from an `<!--[if` opener
 *     to the next `<![endif]-->` is stashed before anything else runs.
 *  2. Every other HTML comment is removed.
 *  3. Runs of ASCII whitespace collapse to a single space. (U+00A0 is
 *     NOT whitespace here — a literal non-breaking space stays.)
 *  4. Whitespace is removed ONLY between two tags that are table /
 *     block structure (table, tr, td, div, p, br, body, …) — or between
 *     such a tag and a stashed conditional. Whitespace next to inline
 *     elements or text is left alone, so `<strong>Jane</strong>
 *     <em>Doe</em>` keeps its separating space (the previous minifier
 *     produced "JaneDoe", and joined text lines with nothing).
 */
const PLACEHOLDER = (idx: number): string => `\uE000${idx}\uE000`;
const PLACEHOLDER_RE = /\uE000(\d+)\uE000/g;

const STRUCTURAL_TAGS = new Set([
  'table',
  'tbody',
  'thead',
  'tfoot',
  'tr',
  'td',
  'th',
  'div',
  'p',
  'br',
  'html',
  'head',
  'body',
  'meta',
  'title',
  'style',
  '!doctype',
]);

/** A tag (attribute values may contain `>` when quoted) or a stashed conditional. */
const TOKEN = String.raw`(?:<(?:[^>"']|"[^"]*"|'[^']*')*>|\uE000\d+\uE000)`;
const GAP_BETWEEN_TOKENS = new RegExp(`(${TOKEN}) (?=(${TOKEN}))`, 'g');

type TokenKind = 'structural' | 'conditional' | 'other';

function kindOf(token: string): TokenKind {
  if (token.startsWith('\uE000')) return 'conditional';
  const m = /^<\/?\s*(!?[a-zA-Z][\w:-]*)/.exec(token);
  if (!m) return 'other';
  return STRUCTURAL_TAGS.has(m[1]!.toLowerCase()) ? 'structural' : 'other';
}

function removable(a: TokenKind, b: TokenKind): boolean {
  if (a === 'structural' && b === 'structural') return true;
  if (a === 'structural' && b === 'conditional') return true;
  if (a === 'conditional' && b === 'structural') return true;
  return false;
}

export function minifyHtml(html: string): string {
  // 1. Stash conditional comments.
  const conditionals: string[] = [];
  const stashed = html.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/g, (match) => {
    conditionals.push(match);
    return PLACEHOLDER(conditionals.length - 1);
  });

  // 2. Drop plain comments, 3. collapse ASCII whitespace runs.
  const collapsed = stashed.replace(/<!--[\s\S]*?-->/g, '').replace(/[ \t\n\r\f]+/g, ' ');

  // 4. Remove the single space only between structural neighbours.
  const tightened = collapsed
    .replace(GAP_BETWEEN_TOKENS, (match, left: string, right: string) =>
      removable(kindOf(left), kindOf(right)) ? left : match,
    )
    .trim();

  // Restore conditionals exactly as they were.
  return tightened.replace(PLACEHOLDER_RE, (_, idx: string) => conditionals[Number(idx)] ?? '');
}
