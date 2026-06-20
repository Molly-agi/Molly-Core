import coreWebVitalsConfig from 'eslint-config-next/core-web-vitals';
import typescriptConfig from 'eslint-config-next/typescript';

export default [
  {
    ignores: ['stuff/drafts/**'],
  },
  ...coreWebVitalsConfig,
  ...typescriptConfig,
  {
    // Global rule: allow underscore-prefixed unused variables
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];
