import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';

const sharedRules = {
  'no-case-declarations': 'off',
  'no-control-regex': 'off',
  'no-useless-escape': 'off',
  'no-unused-vars': 'off',
  'prefer-const': 'warn',
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
};

export default tseslint.config(
  {
    ignores: [
      'coverage/',
      'dist/',
      'node_modules/',
      'public/',
      '**/combined_code.js',
      '**/combined_code.txt',
    ],
  },
  pluginJs.configs.recommended,
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'vite.config.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
      },
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: sharedRules,
  },
  {
    files: ['src/tests/**/*.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
      parserOptions: {
        project: './tsconfig.test.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...sharedRules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  }
);
