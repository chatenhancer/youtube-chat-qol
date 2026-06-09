import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['coverage/**', 'dist/**', 'node_modules/**']
  },
  {
    files: ['cloudflare/language-redirect/src/**/*.ts', 'cloudflare/playground/src/**/*.ts', 'src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        ...globals.browser,
        chrome: 'readonly',
        WebSocketPair: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: {
      globals: globals.node
    },
    rules: js.configs.recommended.rules
  },
  {
    files: ['tests/browser/**/*.ts', 'playwright.config.ts', 'vitest.config.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  }
];
