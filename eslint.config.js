import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'packages/relayer/*.mjs', 'e2e/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', fetch: 'readonly', Buffer: 'readonly', URL: 'readonly', setTimeout: 'readonly', window: 'readonly', localStorage: 'readonly' } },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'build/**', 'artifacts/**', '**/coverage/**'],
  },
);
