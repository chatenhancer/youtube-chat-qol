/**
 * Text normalization helpers for browser tests.
 */
import type { Locator } from '@playwright/test';

export function cleanVisibleText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export async function getRichVisibleText(
  locator: Locator,
  options: { ignoredSelector?: string } = {}
): Promise<string> {
  const text = await locator.evaluate((element, { ignoredSelector }) => {
    const getNodeText = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
      if (!(node instanceof Element)) return '';
      if (ignoredSelector && node.matches(ignoredSelector)) return '';

      const tagName = node.tagName.toLowerCase();
      const marker = [
        node.id,
        node.getAttribute('class'),
        node.getAttribute('data-emoji-id'),
        node.getAttribute('shared-tooltip-text')
      ].join(' ');
      const isEmojiLike = tagName === 'img' ||
        node.getAttribute('role') === 'img' ||
        /\bemoji\b/i.test(marker);

      if (isEmojiLike) {
        return node.getAttribute('alt') ||
          node.getAttribute('aria-label') ||
          node.getAttribute('title') ||
          node.getAttribute('shared-tooltip-text') ||
          node.textContent ||
          '';
      }

      return Array.from(node.childNodes).map(getNodeText).join('');
    };

    return getNodeText(element);
  }, options);

  return cleanVisibleText(text);
}
