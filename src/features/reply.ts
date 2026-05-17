/**
 * Reply insertion helpers.
 *
 * Mention and Quote insert plain text into YouTube's native chat input.
 * Shift-clicking a message is also treated as a quick Mention shortcut while
 * normal clicks remain available for YouTube's own message UI.
 */
import { getOptions } from '../shared/state';
import { cleanText } from '../shared/text';
import { showToast } from '../shared/toast';
import { insertIntoChatInput } from '../youtube/chatInput';
import { getMessageDetails } from '../youtube/messages';
import { CHAT_MESSAGE_SELECTOR } from '../youtube/selectors';

export function handleShiftClickMention(event: MouseEvent): void {
  if (!event.shiftKey || event.defaultPrevented) return;
  if (event.button !== 0) return;

  const target = event.target instanceof Element ? event.target : null;
  const message = target?.closest<HTMLElement>(CHAT_MESSAGE_SELECTOR);
  if (!message || !target || shouldIgnoreShiftClickMention(target)) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  replyToMessage(message, { quote: false });
}

export function replyToMessage(message: HTMLElement, { quote }: { quote: boolean }): void {
  const details = getMessageDetails(message);
  if (!details.authorName) {
    showToast('Could not read that user name.');
    return;
  }

  const prefix = quote && details.text
    ? `${details.authorName}: "${truncateForQuote(details.text)}" `
    : `${details.authorName} `;

  insertMentionText(prefix);
}

export function mentionAuthorName(authorName: string): void {
  const cleanAuthorName = cleanText(authorName);
  if (!cleanAuthorName) {
    showToast('Could not read that user name.');
    return;
  }

  insertMentionText(`${cleanAuthorName} `);
}

function insertMentionText(text: string): void {
  if (!insertIntoChatInput(text)) {
    showToast('Could not find the chat input.');
  }
}

function shouldIgnoreShiftClickMention(target: Element): boolean {
  return Boolean(target.closest([
    'a',
    'button',
    'input',
    'textarea',
    'select',
    '[contenteditable]',
    '#menu',
    'ytd-menu-popup-renderer',
    '.ytcq-translation',
    '.ytcq-replaced-translation-icon',
    '.ytcq-frequent-emoji-row'
  ].join(',')));
}

function truncateForQuote(text: string): string {
  const clean = cleanText(text);
  const { quoteMaxLength } = getOptions();
  if (clean.length <= quoteMaxLength) return clean;
  return `${clean.slice(0, Math.max(0, quoteMaxLength - 3)).trim()}...`;
}
