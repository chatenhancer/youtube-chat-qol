/**
 * Extension-owned DOM helpers.
 *
 * Extension UI should use JSX from `shared/jsx-dom`. The low-level factory
 * marks nodes with a stable attribute so the shared MutationObserver can ignore
 * extension-owned DOM without each feature maintaining fragile selector lists.
 *
 * Use raw `document.createElement()` only for nodes that intentionally become
 * user/chat content, such as rich quote content, input emoji nodes, or temporary
 * text-processing holders.
 */
const EXTENSION_MANAGED_ATTRIBUTE = 'data-ytcq-managed';
const EXTENSION_MANAGED_SELECTOR = `[${EXTENSION_MANAGED_ATTRIBUTE}="true"]`;

/**
 * Mark an existing element as extension-owned.
 *
 * Prefer JSX from `shared/jsx-dom` for new UI. This helper exists for the less
 * common case where a caller receives an element from another factory and needs
 * to mark that root before inserting it.
 *
 * @param element Element that should be treated as extension-owned by the
 * shared content observer.
 */
export function markExtensionManagedElement<T extends Element>(element: T): T {
  element.setAttribute(EXTENSION_MANAGED_ATTRIBUTE, 'true');
  return element;
}

/**
 * Create extension-owned HTML UI.
 *
 * The returned element is automatically marked as managed. Descendants inherit
 * that status through `closest()` checks, so marking the root of a card/panel is
 * usually enough. The JSX factory uses this helper internally so feature code
 * can keep the ownership convention without direct factory calls.
 *
 * @param tagName HTML tag name to pass through to `document.createElement`.
 * @param options Optional browser element-creation options, forwarded
 * unchanged.
 */
export function ytcqCreateElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options?: ElementCreationOptions
): HTMLElementTagNameMap[K] {
  return markExtensionManagedElement(document.createElement(tagName, options));
}

/**
 * Whether this element is inside extension-owned UI.
 *
 * @param element Element to test. Descendants of a managed root also count as
 * managed.
 */
export function isExtensionManagedElement(element: Element): boolean {
  return Boolean(element.closest(EXTENSION_MANAGED_SELECTOR));
}
