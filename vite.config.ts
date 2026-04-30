import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Vite config for the iframe editor and the wp-admin React app.
 *
 * Outputs to /build (committed, ships in the plugin ZIP). No
 * external CDNs at runtime (CLAUDE.md §1.4).
 *
 * Each entry produces its own CSS file so the editor.js bundle
 * doesn't ship admin styles and vice versa.
 */
export default defineConfig({
  plugins: [react()],

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
    rollupOptions: {
      input: {
        editor: resolve(__dirname, 'assets/editor/src/main.tsx'),
        admin: resolve(__dirname, 'assets/admin/src/main.tsx'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: (info) => {
          // Per-entry CSS — Vite names them after the entry, so we get
          // editor.css and admin.css alongside their JS counterparts.
          if (info.name?.endsWith('.css')) {
            return '[name][extname]';
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
