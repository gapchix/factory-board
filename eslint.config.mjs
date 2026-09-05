import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/out/**', 'packages/game-data/generated/**'] },
  ...tseslint.configs.recommended,
  {
    /*
     * The two classic hooks rules, above all `exhaustive-deps`. The recipe book
     * became state rather than a module constant (docs/adr/0034), and a memo
     * that reads it without listing it keeps solving against the old book after
     * a new one is dropped on the page — silently, and only until something
     * else changes. The plugin's newer compiler-era rules are not enabled: the
     * board sets state inside effects on purpose ("restore before you persist",
     * AGENTS.md), and those rules would argue with it.
     */
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
