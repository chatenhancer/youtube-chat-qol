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

export default {
  rules: {
    'require-managed-create-element': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Require managed JSX/DOM creation for extension-owned HTML UI.'
        },
        messages: {
          useManagedDom:
            'Use JSX from shared/jsx-dom for extension-owned feature UI. If this raw element intentionally becomes chat/input content or is never inserted, add a preceding // ytcq-allow-raw-create-element: ... comment.'
        },
        schema: []
      },
      create(context) {
        const comments = context.sourceCode.getAllComments();

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
    'no-direct-ytcq-create-element': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow production UI code from calling ytcqCreateElement directly.'
        },
        messages: {
          useJsxDom: 'Use JSX from shared/jsx-dom instead of calling ytcqCreateElement() directly.'
        },
        schema: []
      },
      create(context) {
        const ytcqCreateElementNames = new Set();

        return {
          ImportDeclaration(node) {
            if (!isManagedDomImportSource(node.source?.value)) return;

            node.specifiers.forEach((specifier) => {
              if (
                specifier.type === 'ImportSpecifier' &&
                getImportedName(specifier.imported) === 'ytcqCreateElement'
              ) {
                ytcqCreateElementNames.add(specifier.local.name);
                context.report({
                  messageId: 'useJsxDom',
                  node: specifier
                });
              }
            });
          },
          CallExpression(node) {
            const callee = node.callee;
            if (callee?.type !== 'Identifier' || !ytcqCreateElementNames.has(callee.name)) return;

            context.report({
              messageId: 'useJsxDom',
              node: callee
            });
          }
        };
      }
    },
    'require-jsx-dom-el-type': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Require explicit element subtypes for shared jsx-dom el() calls.'
        },
        messages: {
          missingType: 'Pass an explicit element type to el(), for example el<HTMLDivElement>(...).'
        },
        schema: []
      },
      create(context) {
        const jsxDomElementNames = new Set();

        return {
          ImportDeclaration(node) {
            if (!isJsxDomImportSource(node.source?.value)) return;

            node.specifiers.forEach((specifier) => {
              if (
                specifier.type === 'ImportSpecifier' &&
                getImportedName(specifier.imported) === 'el'
              ) {
                jsxDomElementNames.add(specifier.local.name);
              }
            });
          },
          CallExpression(node) {
            const callee = node.callee;
            if (callee?.type !== 'Identifier' || !jsxDomElementNames.has(callee.name)) return;
            if (hasTypeArguments(node)) return;

            context.report({
              messageId: 'missingType',
              node: callee
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
          missingSignal:
            'Pass an options object with signal to {{target}}.addEventListener() so lifecycle cleanup can abort the listener.'
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
          useLocalizedText:
            'Use localized text for visible UI literals. If this literal is intentionally not localized, add a preceding // ytcq-allow-visible-ui-literal: ... comment.'
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
          useSharedSelector:
            'Prefer {{replacement}} for this common YouTube selector. If the selector is intentionally feature-owned, add a preceding // ytcq-allow-local-youtube-selector: ... comment.'
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
  const methodName = callee?.property?.type === 'Identifier' ? callee.property.name : '';
  return (
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object?.type === 'Identifier' &&
    callee.object.name === 'document' &&
    (methodName === 'createElement' || methodName === 'createElementNS')
  );
}

function hasRawCreateElementAllowMarker(comments, node) {
  return hasAllowMarker(comments, node, RAW_CREATE_ELEMENT_ALLOW_MARKER);
}

function isManagedDomImportSource(source) {
  return typeof source === 'string' && /(?:^|\/)managed-dom$/.test(source);
}

function isJsxDomImportSource(source) {
  return typeof source === 'string' && /(?:^|\/)jsx-dom$/.test(source);
}

function getImportedName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal') return String(node.value);
  return '';
}

function hasTypeArguments(node) {
  return Boolean(node.typeArguments || node.typeParameters);
}

function hasAllowMarker(comments, node, marker) {
  const startLine = node.loc?.start.line;
  if (!startLine) return false;

  return comments.some((comment) => {
    return (
      comment.value.includes(marker) &&
      comment.loc &&
      (comment.loc.start.line === startLine || comment.loc.end.line === startLine - 1)
    );
  });
}

function getNamedMemberCallTarget(node, methodName) {
  const callee = node.callee;
  if (
    callee?.type !== 'MemberExpression' ||
    callee.computed ||
    callee.property?.type !== 'Identifier' ||
    callee.property.name !== methodName ||
    callee.object?.type !== 'Identifier'
  ) {
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

  return options.type !== 'Literal' || (options.value !== true && options.value !== false);
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
  return (
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property?.type === 'Identifier' &&
    callee.property.name === 'setAttribute'
  );
}

function isDomSelectorCall(node) {
  const callee = node.callee;
  return (
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property?.type === 'Identifier' &&
    DOM_SELECTOR_METHODS.has(callee.property.name)
  );
}

function isSelectorConstantDeclarator(node) {
  return (
    node.id?.type === 'Identifier' &&
    node.id.name.endsWith('_SELECTOR') &&
    Boolean(getStaticString(node.init))
  );
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
  while (
    current?.type === 'TSAsExpression' ||
    current?.type === 'TSTypeAssertion' ||
    current?.type === 'TSNonNullExpression'
  ) {
    current = current.expression;
  }
  return current;
}

function getSharedYouTubeSelectorHint(value) {
  if (!value) return null;
  return SHARED_YOUTUBE_SELECTOR_HINTS.find((hint) => hint.pattern.test(value)) || null;
}
