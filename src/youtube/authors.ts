/**
 * YouTube author-name cleanup helpers.
 *
 * Badge and tooltip DOM can live inside YouTube's author-name element, so
 * author extraction must prefer the visible handle and sanitize fallback text
 * before it reaches mentions, profile cards, or channel URLs.
 */
import { cleanText } from '../shared/text';

interface RendererAuthorText {
  simpleText?: string;
  runs?: { text?: string }[];
}

const AUTHOR_HANDLE_PATTERN = /^@[^\s]+/;

export function getAuthorNameFromRendererText(text: RendererAuthorText | null | undefined): string {
  return cleanAuthorNameText(
    text?.simpleText ||
    text?.runs?.map((run) => run.text || '').join('') ||
    ''
  );
}

export function getAuthorNameFromElement(element: Element | null): string {
  if (!element) return '';

  return cleanAuthorNameText(getDirectTextFromElement(element)) ||
    cleanAuthorNameText(getVisibleTextFromElement(element)) ||
    cleanAuthorNameText(element.textContent);
}

export function cleanAuthorNameText(text: unknown): string {
  const clean = cleanText(text);
  if (!clean) return '';

  const handleMatch = clean.match(AUTHOR_HANDLE_PATTERN);
  if (handleMatch) return handleMatch[0];

  return clean;
}

export function getAuthorHandleForUrl(authorName: string): string {
  const cleanAuthorName = cleanAuthorNameText(authorName);
  const handleMatch = cleanAuthorName.match(AUTHOR_HANDLE_PATTERN);
  return handleMatch?.[0] || '';
}

function getDirectTextFromElement(element: Element): string {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === 3)
    .map((node) => node.textContent || '')
    .join('');
}

function getVisibleTextFromElement(element: Element): string {
  return element instanceof HTMLElement ? element.innerText : '';
}
