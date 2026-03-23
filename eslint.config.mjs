import coreWebVitalsConfig from 'eslint-config-next/core-web-vitals';
import typescriptConfig from 'eslint-config-next/typescript';

export default [
  ...coreWebVitalsConfig,
  ...typescriptConfig,
  {
    files: [
      '**/__tests__/**/*.ts',
      '**/__tests__/**/*.tsx',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      'e2e/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];
