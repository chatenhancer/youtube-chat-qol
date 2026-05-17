/**
 * Reply insertion helpers.
 *
 * Mention and Quote insert plain text into YouTube's native chat input.
 * Clicking an author name is a quick Mention shortcut. Alt/Option-clicking an
 * author name quotes that message while normal message clicks remain available
 * for YouTube's own message UI.
 */
import { getOptions } from '../shared/state';
import { cleanText } from '../shared/text';
import { showToast } from '../shared/toast';
import { insertIntoChatInput } from '../youtube/chatInput';
import { getMessageDetails } from '../youtube/messages';

export function wireAuthorNameMention(message: HTMLElement): void {
  if (message.dataset.ytcqAuthorMentionWired === 'true') return;
  message.dataset.ytcqAuthorMentionWired = 'true';

  const authorName = message.querySelector<HTMLElement>('#author-name');
  if (!authorName) return;

  authorName.title = 'Mention user. Alt/Option-click to quote.';
  authorName.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    replyToMessage(message, { quote: event.altKey });
  }, true);
}

export function replyToMessage(message: HTMLElement, { quote }: { quote: boolean }): void {
  const details = getMessageDetails(message);
  if (quote && details.text) {
    quoteAuthorText(details.authorName, details.text);
  } else {
    mentionAuthorName(details.authorName);
  }
}

export function mentionAuthorName(authorName: string): void {
  const mentionText = formatMentionText(authorName);
  if (!mentionText) {
    showToast('Could not read that user name.');
    return;
  }

  insertMentionText(mentionText);
}

export function quoteAuthorText(authorName: string, text: string): void {
  const quoteText = formatQuoteText(authorName, text);
  if (!quoteText) {
    showToast('Could not read that user name.');
    return;
  }

  insertMentionText(quoteText);
}

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

  return `${cleanAuthorName}: "${truncateForQuote(cleanMessage)}" `;
}

function insertMentionText(text: string): void {
  if (!insertIntoChatInput(text)) {
    showToast('Could not find the chat input.');
  }
}

function truncateForQuote(text: string): string {
  const clean = cleanText(text);
  const { quoteMaxLength } = getOptions();
  if (clean.length <= quoteMaxLength) return clean;
  return `${clean.slice(0, Math.max(0, quoteMaxLength - 3)).trim()}...`;
}
