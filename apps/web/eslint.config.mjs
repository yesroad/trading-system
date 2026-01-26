import config from '@workspace/eslint-config/web';
import tanstackQuery from '@tanstack/eslint-plugin-query';

/** @type {import("eslint").Linter.Config} */
const eslintConfig = [
  ...config,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@tanstack/query': tanstackQuery,
    },
    rules: {
      '@tanstack/query/exhaustive-deps': 'warn',
      '@tanstack/query/no-rest-destructuring': 'warn',
      '@tanstack/query/stable-query-client': 'error',
    },
  },
];

export default eslintConfig;
