import type { Config } from 'tailwindcss';

/**
 * Tailwind config for the editor running inside the iframe.
 *
 * No prefix: the iframe is an isolated context, so we don't need to
 * namespace utilities. (CLAUDE.md §6.6)
 *
 * For the wp-admin views (assets/admin), see CLAUDE.md §6.6 — those
 * use the `is-` prefix and a separate config when needed.
 */
const config: Config = {
  content: [
    './assets/editor/src/**/*.{ts,tsx,html}',
    './assets/shared/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Tokens declared in src/styles/globals.css (CLAUDE.md §18.1)
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
      },
    },
  },
  plugins: [],
};

export default config;
