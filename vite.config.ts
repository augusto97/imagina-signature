import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Read IMGSIG_VERSION from the plugin main file so the JS bundle and
 * the PHP header are guaranteed to agree. Single source of truth.
 *
 * Surfaced inside the bundle as `__BUNDLE_VERSION__` (Vite `define`)
 * so the editor can compare its compile-time version against the
 * runtime `IMGSIG_EDITOR_CONFIG.pluginVersion` and warn the user
 * when their browser is serving cached editor.js while the plugin
 * itself was upgraded.
 */
function readPluginVersion(): string {
  const phpFile = readFileSync(resolve(__dirname, 'imagina-signatures.php'), 'utf8');
  const m = /define\(\s*['"]IMGSIG_VERSION['"],\s*['"]([^'"]+)['"]/.exec(phpFile);
  return m ? m[1]! : '0.0.0';
}

const PLUGIN_VERSION = readPluginVersion();

/**
 * Vite config for the editor + the wp-admin React app.
 *
 * Outputs to /build (committed, ships in the plugin ZIP). No
 * external CDNs at runtime (CLAUDE.md §1.4).
 *
 * Cache busting strategy (1.0.21+):
 *
 *   Every output file gets a content hash baked into its filename
 *   (`editor.[hash].js`, `admin.[hash].js`, `editor.[hash].css`,
 *   `bundle-mjs-[hash].js`). Vite emits a `manifest.json` mapping
 *   each entry's source-tree path to its hashed filename, and the
 *   PHP enqueuers (`AdminAssetEnqueuer`, `EditorAssetEnqueuer`)
 *   read the manifest at request time to resolve the current
 *   filenames. Because the URL itself changes on each release,
 *   no browser, CDN, or page-cache layer can possibly serve a
 *   stale bundle — the only way to load `editor.[OLD_HASH].js`
 *   would be for someone to type that URL by hand.
 *
 *   Earlier versions output `[name].js` (no hash), relying on
 *   `wp_enqueue_script`'s `?ver=` query param to defeat caches.
 *   That's not enough — many CDN configs ignore query strings,
 *   and the inline-loaded shared chunk URL doesn't carry `?ver=`.
 */
export default defineConfig({
  plugins: [react()],

  define: {
    __BUNDLE_VERSION__: JSON.stringify(PLUGIN_VERSION),
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, 'assets/editor/src'),
      '@admin': resolve(__dirname, 'assets/admin/src'),
      '@shared': resolve(__dirname, 'assets/shared'),
    },
  },

  build: {
    outDir: 'build',
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: true,
    manifest: true, // emits build/.vite/manifest.json
    rollupOptions: {
      input: {
        editor: resolve(__dirname, 'assets/editor/src/main.tsx'),
        admin: resolve(__dirname, 'assets/admin/src/main.tsx'),
      },
      output: {
        // Hash ALL outputs — that's the cache buster. The previous
        // config used `[name].js` for entries which let CDNs cache
        // them indefinitely.
        entryFileNames: '[name].[hash].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: (info) => {
          if (info.name?.endsWith('.css')) {
            return '[name].[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
    target: 'es2020',
    minify: 'esbuild',
  },

  server: {
    port: 5173,
    strictPort: true,
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/js/setup.ts'],
    include: ['tests/js/**/*.test.{ts,tsx}', 'assets/**/*.test.{ts,tsx}'],
  },
});
