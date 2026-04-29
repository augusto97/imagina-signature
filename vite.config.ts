import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [preact()],
  // Emit relative URLs in the bundle so dynamic `import('chunks/X.js')`
  // resolves against the bundle's URL (the plugin path) rather than the
  // host page's URL (wp-admin/admin.php). Without this, code-split chunks
  // 404 on every WordPress install because the browser tries to fetch
  // them from the admin URL.
  base: './',
  experimental: {
    renderBuiltUrl(_filename, _type) {
      return { relative: true };
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'assets/editor/src'),
      '@shared': resolve(__dirname, 'assets/shared'),
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
  build: {
    outDir: 'build',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        editor: resolve(__dirname, 'assets/editor/src/main.tsx'),
        admin: resolve(__dirname, 'assets/admin/src/main.tsx'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/js/**/*.test.ts', 'tests/js/**/*.test.tsx'],
    setupFiles: ['./tests/js/setup.ts'],
  },
});
