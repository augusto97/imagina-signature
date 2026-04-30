import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Vite config for the iframe editor (and admin views).
 *
 * Outputs to /build, which IS committed (it ships in the plugin ZIP).
 * No external CDNs at runtime — everything is bundled (CLAUDE.md §1.4).
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
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        editor: resolve(__dirname, 'assets/editor/src/main.tsx'),
        admin: resolve(__dirname, 'assets/admin/src/main.tsx'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: (info) => {
          // With cssCodeSplit: false Vite merges everything into a single
          // bundle and names it "style.css" by default. The iframe host
          // (`EditorIframeController`) loads `build/editor.css`, so emit
          // under that name.
          if (info.name?.endsWith('.css')) {
            return 'editor.css';
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
