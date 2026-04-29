import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'assets/editor/src'),
      '@shared': resolve(__dirname, 'assets/shared'),
      react: 'preact/compat',
      'react-dom': 'preact/compat',
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
        assetFileNames: '[name].[ext]',
      },
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/js/**/*.test.ts', 'tests/js/**/*.test.tsx'],
  },
});
