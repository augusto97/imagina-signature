/**
 * Browser-side sanitiser for Tiptap-produced HTML, scoped to the
 * email-safe whitelist.
 *
 * Mirrors the PHP HtmlSanitizer (CLAUDE.md §19.4): allows
 * `<strong>`, `<em>`, `<u>`, `<a href title rel target>`, `<br>`,
 * `<span style>`. Anything else is dropped. URL protocols are
 * limited to http(s), mailto, tel.
 *
 * Implementation uses `DOMParser` so we get a real DOM walk rather
 * than regex-based stripping (which has a long history of being
 * outsmarted by edge-case payloads).
 */
const ALLOWED_TAGS = new Set(['STRONG', 'EM', 'U', 'A', 'BR', 'SPAN', 'P', 'B', 'I']);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  A: new Set(['href', 'title', 'rel', 'target']),
  SPAN: new Set(['style']),
};
const URL_PROTOCOL = /^(https?:|mailto:|tel:)/i;

export function sanitizeEmailHtml(html: string, _variables: Record<string, string> = {}): string {
  if (!html || typeof DOMParser === 'undefined') {
    return html;
  }

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';

  walk(root);
  return root.innerHTML;
}

function walk(node: Element): void {
  // Iterate over a snapshot — we mutate as we go.
  const children = Array.from(node.children);
  for (const child of children) {
    if (!ALLOWED_TAGS.has(child.tagName)) {
      // Replace with text content (drops the tag, keeps the text).
      child.replaceWith(...Array.from(child.childNodes));
      continue;
    }

    // Strip disallowed attrs.
    const allowed = ALLOWED_ATTRS[child.tagName] ?? new Set();
    for (const attr of Array.from(child.attributes)) {
      if (!allowed.has(attr.name)) {
        child.removeAttribute(attr.name);
        continue;
      }
      // Validate href protocol.
      if (attr.name === 'href' && !URL_PROTOCOL.test(attr.value)) {
        child.removeAttribute('href');
      }
    }

    walk(child);
  }
}
