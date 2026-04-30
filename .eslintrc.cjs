/* eslint-env node */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: false,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'react-refresh'],
  settings: {
    react: { version: 'detect' },
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/consistent-type-imports': [
      'error',
      { prefer: 'type-imports' },
    ],
    'react/prop-types': 'off',
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  ignorePatterns: [
    'build/',
    'dist/',
    'vendor/',
    'node_modules/',
    '*.config.ts',
    '*.config.js',
    '.eslintrc.cjs',
  ],
  overrides: [
    {
      files: ['tests/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
      env: { node: true },
    },
    {
      // Each block's definition.tsx co-locates the Renderer + Properties
      // components alongside the registration object. That trips
      // react-refresh/only-export-components even though it doesn't matter
      // for production — Fast Refresh isn't used outside dev.
      files: ['assets/editor/src/core/blocks/**/definition.tsx'],
      rules: {
        'react-refresh/only-export-components': 'off',
      },
    },
  ],
};
