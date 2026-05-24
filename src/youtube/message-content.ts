/**
 * Shared visible-message traversal helpers.
 *
 * YouTube message nodes can include hidden tooltip DOM next to visible text and
 * emoji. Keep the visibility and emoji rules in one place so plain extraction,
 * rich card rendering, and quote insertion do not drift.
 */
import { cleanText } from '../shared/text';
import { CHAT_TOOLTIP_SELECTOR } from './selectors';

export function isIgnoredMessageContentElement(element: Element): boolean {
  return element.matches(CHAT_TOOLTIP_SELECTOR);
}

export function isMessageLineBreakElement(element: Element): boolean {
  return element.tagName.toLowerCase() === 'br';
}

export function isEmojiLikeElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'img' || element.getAttribute('role') === 'img') return true;

  const marker = [
    element.id,
    element.getAttribute('class'),
    element.getAttribute('data-emoji-id'),
    element.getAttribute('shared-tooltip-text')
  ].join(' ');
  return /\bemoji\b/i.test(marker);
}

export function getElementImageSource(element: Element): string {
  const image = element instanceof HTMLImageElement ? element : element.querySelector('img');
  if (image instanceof HTMLImageElement) {
    return image.currentSrc ||
      image.src ||
      image.getAttribute('src') ||
      image.getAttribute('data-src') ||
      '';
  }

  return element.getAttribute('src') || element.getAttribute('data-src') || '';
}

export function getCleanAttribute(element: Element, name: string): string {
  return (element.getAttribute(name) || '').replace(/\s+/g, ' ').trim();
}

export function getElementTextFallback(element: Element): string {
  const image = element instanceof HTMLImageElement ? element : element.querySelector('img');
  return cleanText(
    getCleanAttribute(element, 'alt') ||
    getCleanAttribute(element, 'aria-label') ||
    getCleanAttribute(element, 'title') ||
    getCleanAttribute(element, 'shared-tooltip-text') ||
    (image ? getCleanAttribute(image, 'alt') : '') ||
    (image ? getCleanAttribute(image, 'aria-label') : '') ||
    (image ? getCleanAttribute(image, 'title') : '') ||
    (image ? getCleanAttribute(image, 'shared-tooltip-text') : '') ||
    element.textContent ||
    ''
  );
}

export function getPlainTextFromMessageNodes(nodes: Iterable<Node> | ArrayLike<Node>): string {
  return Array.from(nodes).map(getPlainTextFromMessageNode).join('');
}

export function getPlainTextFromMessageNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (!(node instanceof Element)) return '';
  if (isIgnoredMessageContentElement(node)) return '';

  if (isMessageLineBreakElement(node)) return '\n';
  if (isEmojiLikeElement(node)) return getElementTextFallback(node);

  return getPlainTextFromMessageNodes(node.childNodes);
}

export function cloneSafeMessageNode(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return node.cloneNode(true);
  if (!(node instanceof Element)) return null;
  if (isIgnoredMessageContentElement(node)) return null;

  const clone = node.cloneNode(true) as Element;
  clone.querySelectorAll(CHAT_TOOLTIP_SELECTOR).forEach((child) => child.remove());
  stripDuplicateIds(clone);
  return clone;
}

function stripDuplicateIds(element: Element): void {
  element.removeAttribute('id');
  element.querySelectorAll('[id]').forEach((child) => child.removeAttribute('id'));
}
