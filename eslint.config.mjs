import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import ytcqPlugin from './scripts/eslint-local-rules.mjs';

export default [
  {
    ignores: ['coverage/**', 'dist/**', 'node_modules/**']
  },
  {
    files: ['cloudflare/**/*.ts', 'src/**/*.ts', 'src/**/*.tsx', 'tests/**/*.ts'],
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
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/shared/jsx-dom.ts',
      'src/shared/managed-dom.ts'
    ],
    plugins: {
      ytcq: ytcqPlugin
    },
    rules: {
      'ytcq/no-direct-jsx-factory': 'error',
      'ytcq/no-direct-ytcq-create-element': 'error',
      'ytcq/require-jsx-dom-el-type': 'error'
    }
  },
  {
    files: ['src/features/**/*.ts', 'src/features/**/*.tsx'],
    ignores: ['src/features/**/*.test.ts', 'src/features/**/*.test.tsx'],
    plugins: {
      ytcq: ytcqPlugin
    },
    rules: {
      'ytcq/no-hardcoded-visible-ui-literals': 'warn',
      'ytcq/no-direct-ytcq-create-element': 'error',
      'ytcq/prefer-shared-youtube-selectors': 'warn',
      'ytcq/require-global-listener-signal': 'error',
      'ytcq/require-managed-create-element': 'error'
    }
  },
  {
    files: ['src/popup/**/*.ts', 'src/popup/**/*.tsx'],
    ignores: ['src/popup/**/*.test.ts', 'src/popup/**/*.test.tsx'],
    plugins: {
      ytcq: ytcqPlugin
    },
    rules: {
      'ytcq/no-hardcoded-visible-ui-literals': 'warn',
      'ytcq/require-managed-create-element': 'error'
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
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  }
];
