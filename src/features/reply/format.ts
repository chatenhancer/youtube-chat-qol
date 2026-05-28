import { cleanText } from '../../shared/text';

export const QUOTE_MAX_LENGTH = 120;

export function formatMentionText(authorName: string): string {
  const cleanAuthorName = cleanText(authorName);
  return cleanAuthorName ? `${cleanAuthorName} ` : '';
}

export function formatQuoteText(authorName: string, text: string): string {
  const cleanAuthorName = cleanText(authorName);
  if (!cleanAuthorName) return '';

  const cleanMessage = cleanText(text);
  if (!cleanMessage) {
    return `${cleanAuthorName} `;
  }

  return `${cleanAuthorName} : "${truncateForQuote(cleanMessage)}" `;
}

export function truncateForQuote(text: string): string {
  const clean = cleanText(text);
  if (clean.length <= QUOTE_MAX_LENGTH) return clean;
  return `${clean.slice(0, Math.max(0, QUOTE_MAX_LENGTH - 3)).trim()}...`;
}
