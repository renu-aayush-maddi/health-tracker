import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'e2e/playwright-report/**'] },
  js.configs.recommended,
  {
    files: ['backend/**/*.js', 'shared/**/*.js', 'e2e/**/*.js', '*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['frontend/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Playwright specs run some code inside the browser (page.evaluate).
    files: ['e2e/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['**/*.test.{js,jsx}', '**/tests/**/*.js', 'frontend/src/test/**'],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
  {
    // Build tooling runs in Node.
    files: ['frontend/vite.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
