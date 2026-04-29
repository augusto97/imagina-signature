import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [preact()],
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
