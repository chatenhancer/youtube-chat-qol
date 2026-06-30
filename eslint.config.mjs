import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const RAW_CREATE_ELEMENT_ALLOW_MARKER = 'ytcq-allow-raw-create-element:';
const VISIBLE_UI_LITERAL_ALLOW_MARKER = 'ytcq-allow-visible-ui-literal:';
const LOCAL_YOUTUBE_SELECTOR_ALLOW_MARKER = 'ytcq-allow-local-youtube-selector:';

const GLOBAL_LISTENER_TARGETS = new Set(['document', 'window']);
const DOM_SELECTOR_METHODS = new Set(['closest', 'matches', 'querySelector', 'querySelectorAll']);
const VISIBLE_UI_PROPERTIES = new Set(['ariaLabel', 'innerText', 'textContent', 'title']);
const VISIBLE_UI_ATTRIBUTES = new Set(['aria-label', 'title']);
const SHARED_YOUTUBE_SELECTOR_HINTS = [
  {
    pattern: /yt-live-chat-(?:text-message|paid-message|membership-item)-renderer/,
    replacement: 'CHAT_MESSAGE_SELECTOR'
  },
  {
    pattern: /yt-live-chat-participant-renderer/,
    replacement: 'PARTICIPANT_SELECTOR'
  },
  {
    pattern: /(?:yt-live-chat-item-list-renderer\s+#item-scroller|yt-live-chat-renderer\s+#item-scroller|#item-scroller)/,
    replacement: 'CHAT_SCROLLER_SELECTOR'
  },
  {
    pattern: /tp-yt-iron-pages#panel-pages/,
    replacement: 'PANEL_PAGES_SELECTOR'
  },
  {
    pattern: /(?:#send-button|yt-button-renderer#send-button|yt-icon-button#send-button|button\[(?:aria-label|title)=["']Send["']\])/,
    replacement: 'SEND_BUTTON_SELECTOR'
  },
  {
    pattern: /(?:\[role=["']tooltip["']|tp-yt-paper-tooltip|yt-tooltip)/,
    replacement: 'CHAT_TOOLTIP_SELECTOR'
  },
  {
    pattern: /yt-live-chat-header-renderer/,
    replacement: 'CHAT_HEADER_SELECTOR'
  }
];

const ytcqPlugin = {
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
    },
    'require-global-listener-signal': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Require AbortSignal-backed cleanup for document/window listeners in feature code.'
        },
        messages: {
          missingSignal: 'Pass an options object with signal to {{target}}.addEventListener() so lifecycle cleanup can abort the listener.'
        },
        schema: []
      },
      create(context) {
        return {
          CallExpression(node) {
            const target = getNamedMemberCallTarget(node, 'addEventListener');
            if (!target || !GLOBAL_LISTENER_TARGETS.has(target)) return;
            if (hasListenerSignalOption(context, node)) return;

            context.report({
              data: { target },
              messageId: 'missingSignal',
              node
            });
          }
        };
      }
    },
    'no-hardcoded-visible-ui-literals': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Warn when visible extension UI text is hardcoded instead of coming from localization.'
        },
        messages: {
          useLocalizedText: 'Use localized text for visible UI literals. If this literal is intentionally not localized, add a preceding // ytcq-allow-visible-ui-literal: ... comment.'
        },
        schema: []
      },
      create(context) {
        const comments = context.sourceCode.getAllComments();

        return {
          AssignmentExpression(node) {
            const propertyName = getAssignedPropertyName(node);
            if (!VISIBLE_UI_PROPERTIES.has(propertyName)) return;
            if (!isVisibleStaticString(node.right)) return;
            if (hasAllowMarker(comments, node, VISIBLE_UI_LITERAL_ALLOW_MARKER)) return;

            context.report({
              messageId: 'useLocalizedText',
              node: node.right
            });
          },
          CallExpression(node) {
            if (!isSetAttributeCall(node)) return;
            const attributeName = getStaticString(node.arguments[0]);
            if (!VISIBLE_UI_ATTRIBUTES.has(attributeName)) return;
            if (!isVisibleStaticString(node.arguments[1])) return;
            if (hasAllowMarker(comments, node, VISIBLE_UI_LITERAL_ALLOW_MARKER)) return;

            context.report({
              messageId: 'useLocalizedText',
              node: node.arguments[1]
            });
          }
        };
      }
    },
    'prefer-shared-youtube-selectors': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Prefer shared YouTube selector constants for common chat surfaces.'
        },
        messages: {
          useSharedSelector: 'Prefer {{replacement}} for this common YouTube selector. If the selector is intentionally feature-owned, add a preceding // ytcq-allow-local-youtube-selector: ... comment.'
        },
        schema: []
      },
      create(context) {
        const comments = context.sourceCode.getAllComments();

        function reportIfSharedSelectorLiteral(node) {
          const value = getStaticString(node);
          const hint = getSharedYouTubeSelectorHint(value);
          if (!hint) return;
          if (hasAllowMarker(comments, node, LOCAL_YOUTUBE_SELECTOR_ALLOW_MARKER)) return;

          context.report({
            data: { replacement: hint.replacement },
            messageId: 'useSharedSelector',
            node
          });
        }

        return {
          CallExpression(node) {
            if (!isDomSelectorCall(node)) return;
            if (isScopedItemScrollerQuery(node)) return;
            reportIfSharedSelectorLiteral(node.arguments[0]);
          },
          VariableDeclarator(node) {
            if (!isSelectorConstantDeclarator(node)) return;
            reportIfSharedSelectorLiteral(node.init);
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
  return hasAllowMarker(comments, node, RAW_CREATE_ELEMENT_ALLOW_MARKER);
}

function hasAllowMarker(comments, node, marker) {
  const startLine = node.loc?.start.line;
  if (!startLine) return false;

  return comments.some((comment) => {
    return comment.value.includes(marker) &&
      comment.loc &&
      (comment.loc.start.line === startLine || comment.loc.end.line === startLine - 1);
  });
}

function getNamedMemberCallTarget(node, methodName) {
  const callee = node.callee;
  if (callee?.type !== 'MemberExpression' ||
    callee.computed ||
    callee.property?.type !== 'Identifier' ||
    callee.property.name !== methodName ||
    callee.object?.type !== 'Identifier') {
    return '';
  }

  return callee.object.name;
}

function hasListenerSignalOption(context, node) {
  const options = unwrapExpression(node.arguments[2]);
  if (!options) return false;

  if (options.type === 'ObjectExpression') return objectExpressionHasProperty(options, 'signal');
  if (options.type === 'Identifier') {
    const init = getVariableInitializer(context, node, options.name);
    if (!init) return true;
    const unwrappedInit = unwrapExpression(init);
    return unwrappedInit?.type === 'ObjectExpression'
      ? objectExpressionHasProperty(unwrappedInit, 'signal')
      : true;
  }

  return options.type !== 'Literal' || options.value !== true && options.value !== false;
}

function getVariableInitializer(context, node, variableName) {
  const getScope = context.sourceCode.getScope?.bind(context.sourceCode);
  let scope = getScope ? getScope(node) : context.getScope?.();

  while (scope) {
    const variable = scope.variables.find((candidate) => candidate.name === variableName);
    const definition = variable?.defs.find((candidate) => candidate.type === 'Variable');
    if (definition?.node?.type === 'VariableDeclarator') return definition.node.init;
    scope = scope.upper;
  }

  return null;
}

function objectExpressionHasProperty(node, propertyName) {
  return node.properties.some((property) => {
    if (property.type !== 'Property') return property.type === 'SpreadElement';
    return getPropertyKeyName(property.key) === propertyName;
  });
}

function getPropertyKeyName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal') return String(node.value);
  return '';
}

function getAssignedPropertyName(node) {
  const left = node.left;
  if (left?.type !== 'MemberExpression' || left.computed) return '';
  if (left.property?.type !== 'Identifier') return '';
  return left.property.name;
}

function isSetAttributeCall(node) {
  const callee = node.callee;
  return callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property?.type === 'Identifier' &&
    callee.property.name === 'setAttribute';
}

function isDomSelectorCall(node) {
  const callee = node.callee;
  return callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property?.type === 'Identifier' &&
    DOM_SELECTOR_METHODS.has(callee.property.name);
}

function isScopedItemScrollerQuery(node) {
  const callee = node.callee;
  const selector = getStaticString(node.arguments[0]);
  return selector === '#item-scroller' &&
    callee?.type === 'MemberExpression' &&
    !(callee.object?.type === 'Identifier' && callee.object.name === 'document');
}

function isSelectorConstantDeclarator(node) {
  return node.id?.type === 'Identifier' &&
    node.id.name.endsWith('_SELECTOR') &&
    Boolean(getStaticString(node.init));
}

function isVisibleStaticString(node) {
  return Boolean(getStaticString(node)?.trim());
}

function getStaticString(node) {
  const unwrapped = unwrapExpression(node);
  if (!unwrapped) return '';
  if (unwrapped.type === 'Literal') return typeof unwrapped.value === 'string' ? unwrapped.value : '';
  if (unwrapped.type === 'TemplateLiteral' && unwrapped.expressions.length === 0) {
    return unwrapped.quasis[0]?.value.cooked || unwrapped.quasis[0]?.value.raw || '';
  }
  return '';
}

function unwrapExpression(node) {
  let current = node;
  while (current?.type === 'TSAsExpression' ||
    current?.type === 'TSTypeAssertion' ||
    current?.type === 'TSNonNullExpression') {
    current = current.expression;
  }
  return current;
}

function getSharedYouTubeSelectorHint(value) {
  if (!value) return null;
  return SHARED_YOUTUBE_SELECTOR_HINTS.find((hint) => hint.pattern.test(value)) || null;
}

export default [
  {
    ignores: ['coverage/**', 'dist/**', 'node_modules/**']
  },
  {
    files: ['cloudflare/**/*.ts', 'src/**/*.ts', 'tests/**/*.ts'],
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
      ytcq: ytcqPlugin
    },
    rules: {
      'ytcq/no-hardcoded-visible-ui-literals': 'warn',
      'ytcq/prefer-shared-youtube-selectors': 'warn',
      'ytcq/require-global-listener-signal': 'error',
      'ytcq/require-managed-create-element': 'error'
    }
  },
  {
    files: ['src/popup/**/*.ts'],
    ignores: ['src/popup/**/*.test.ts'],
    plugins: {
      ytcq: ytcqPlugin
    },
    rules: {
      'ytcq/no-hardcoded-visible-ui-literals': 'warn'
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
