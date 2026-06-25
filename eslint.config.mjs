import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const RAW_CREATE_ELEMENT_ALLOW_MARKER = 'ytcq-allow-raw-create-element:';

const managedDomPlugin = {
  rules: {
    'require-managed-create-element': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Require ytcqCreateElement for feature-owned HTML UI.'
        },
        messages: {
          useManagedDom: 'Use ytcqCreateElement() for extension-owned feature UI. If this raw element intentionally becomes chat/input content or is never inserted, add a preceding // ytcq-allow-raw-create-element: ... comment.'
        },
        schema: []
      },
      create(context) {
        const sourceCode = context.sourceCode;
        const comments = sourceCode.getAllComments();

        return {
          CallExpression(node) {
            if (!isDocumentCreateElementCall(node)) return;
            if (hasRawCreateElementAllowMarker(comments, node)) return;

            context.report({
              messageId: 'useManagedDom',
              node
            });
          }
        };
      }
    }
  }
};

function isDocumentCreateElementCall(node) {
  const callee = node.callee;
  return callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object?.type === 'Identifier' &&
    callee.object.name === 'document' &&
    callee.property?.type === 'Identifier' &&
    callee.property.name === 'createElement';
}

function hasRawCreateElementAllowMarker(comments, node) {
  const startLine = node.loc?.start.line;
  if (!startLine) return false;

  return comments.some((comment) => {
    return comment.value.includes(RAW_CREATE_ELEMENT_ALLOW_MARKER) &&
      comment.loc &&
      (comment.loc.start.line === startLine || comment.loc.end.line === startLine - 1);
  });
}

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
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    files: ['src/features/**/*.ts'],
    ignores: ['src/features/**/*.test.ts'],
    plugins: {
      'ytcq-managed-dom': managedDomPlugin
    },
    rules: {
      'ytcq-managed-dom/require-managed-create-element': 'error'
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
