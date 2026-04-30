import type { Config } from 'tailwindcss';

/**
 * Tailwind config covers both the iframe editor and the wp-admin
 * React app. Both bundles are scoped — the editor iframe runs in an
 * isolated document, and the admin React app mounts inside an
 * `#imagina-admin-root` div whose styles are loaded via a dedicated
 * stylesheet. We turn off Tailwind's preflight so the admin bundle
 * never resets WP-admin's existing styles outside our root.
 */
const config: Config = {
  content: [
    './assets/editor/src/**/*.{ts,tsx,html}',
    './assets/admin/src/**/*.{ts,tsx,html}',
    './assets/shared/**/*.{ts,tsx}',
  ],
  // Scope every utility class behind the admin root in the admin
  // bundle so wp-admin's own UI is untouched. The editor iframe
  // doesn't need this — its document is owned by us — but the same
  // selector also matches `#imagina-editor-root` inside the iframe
  // so editor utilities still apply.
  important: ':where(#imagina-editor-root, #imagina-admin-root)',
  theme: {
    extend: {
      colors: {
        // Tokens declared in src/styles/globals.css.
        'bg-primary': 'var(--bg-primary)',
        'bg-panel': 'var(--bg-panel)',
        'bg-hover': 'var(--bg-hover)',
        'bg-selected': 'var(--bg-selected)',
        'border-default': 'var(--border-default)',
        'border-strong': 'var(--border-strong)',
        'border-selected': 'var(--border-selected)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
  // Preflight is enabled. Both bundles (editor and admin) ship inside
  // same-origin iframes whose documents are owned entirely by us, so
  // Tailwind's CSS reset can apply globally without clobbering
  // wp-admin's UI outside the iframe. The reset is what keeps native
  // <button>, <input>, <a>, headings, lists, images, etc. consistent
  // — without it the iframe falls back to UA defaults (button border:
  // 2px outset, image inline-block alignment quirks, list bullets,
  // h1-h6 default sizes, etc.).
  plugins: [],
};

export default config;
