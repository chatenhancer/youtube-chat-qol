/**
 * YouTube chat message adapter.
 *
 * Centralizes extraction of author names, message text, stable DOM IDs, and
 * original message snapshots. Feature modules use this instead of duplicating
 * fragile selectors across the codebase.
 */
import { cleanText } from '../shared/text';
import { getAuthorNameFromElement } from './authors';
import { cloneSafeMessageNode, getPlainTextFromMessageNodes } from './message-content';

interface OriginalMessageSnapshot {
  originalText: string;
  childNodes: Node[];
  className: string;
  hadLang: boolean;
  lang: string | null;
  hadTitle: boolean;
  title: string | null;
}

const replacedMessages = new WeakMap<HTMLElement, OriginalMessageSnapshot>();

export function getMessageDetails(message: HTMLElement): { authorName: string; text: string } {
  return {
    authorName: getAuthorName(message),
    text: getMessageText(message)
  };
}

export function getAuthorName(message: HTMLElement): string {
  return getAuthorNameFromElement(getAuthorNameElement(message));
}

export function getAuthorNameElement(message: HTMLElement): HTMLElement | null {
  return message.querySelector<HTMLElement>('[id="author-name"]') ||
    message.querySelector<HTMLElement>('a[href*="/channel/"], a[href^="/@"]');
}

export function getAuthorChannelId(message: HTMLElement): string {
  return getChannelIdFromElementLinks(message);
}

export function getMessageAvatarSrc(message: HTMLElement): string {
  const source = message.querySelector<HTMLImageElement>('#author-photo img, #author-photo #img, img#img');
  return source?.src || '';
}

export function getMessageText(message: HTMLElement): string {
  const replaced = replacedMessages.get(message);
  if (replaced?.originalText) return cleanText(replaced.originalText);

  const messageText = getMessageTextElement(message);
  return cleanText(messageText ? getPlainTextFromMessageNodes(messageText.childNodes) : '');
}

export function getMessageTextElement(message: HTMLElement): HTMLElement | null {
  return message.querySelector<HTMLElement>('[id="message"]');
}

export function getMessageContentNodes(message: HTMLElement): Node[] {
  return getMessageContentSourceNodes(message)
    .map(cloneSafeMessageNode)
    .filter((node): node is Node => Boolean(node));
}

export function getMessageContentSourceNodes(message: HTMLElement): Node[] {
  const replaced = replacedMessages.get(message);
  if (replaced?.childNodes.length) {
    return replaced.childNodes;
  }

  const messageText = getMessageTextElement(message);
  return messageText ? Array.from(messageText.childNodes) : [];
}

export function getMessageTimestampText(message: HTMLElement, timestamp = Date.now()): string {
  const youtubeTimestamp = message.querySelector('#timestamp')?.textContent;
  if (youtubeTimestamp) {
    const cleanTimestamp = youtubeTimestamp.replace(/\s+/g, ' ').trim();
    if (cleanTimestamp) return cleanTimestamp;
  }

  return formatMessageTimestamp(timestamp);
}

export function formatMessageTimestamp(timestamp: number, locale?: string): string {
  if (!Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

export function formatMessageTimestampUsec(timestampUsec: string | undefined): string {
  if (!timestampUsec || !/^\d{1,24}$/.test(timestampUsec)) return '';
  const milliseconds = Number(timestampUsec) / 1_000;
  return formatMessageTimestamp(milliseconds);
}

export function getMessageStableId(message: HTMLElement): string {
  return cleanText(
    message.getAttribute('data-message-id') ||
    message.id ||
    ''
  );
}

export function rememberOriginalMessageText(message: HTMLElement, messageText: HTMLElement, originalText: string): void {
  if (replacedMessages.has(message)) return;

  replacedMessages.set(message, {
    originalText,
    childNodes: Array.from(messageText.childNodes)
      .map(cloneSafeMessageNode)
      .filter((node): node is Node => Boolean(node)),
    className: messageText.className,
    hadLang: messageText.hasAttribute('lang'),
    lang: messageText.getAttribute('lang'),
    hadTitle: messageText.hasAttribute('title'),
    title: messageText.getAttribute('title')
  });
}

export function getStoredOriginalMessage(message: HTMLElement): OriginalMessageSnapshot | undefined {
  return replacedMessages.get(message);
}

export function restoreReplacedTranslation(message: Element): void {
  if (!(message instanceof HTMLElement)) return;
  const messageText = getMessageTextElement(message);
  const original = replacedMessages.get(message);

  if (messageText && original) {
    messageText.replaceChildren(...original.childNodes.map((node) => node.cloneNode(true)));
    messageText.className = original.className;

    if (original.hadLang && original.lang !== null) {
      messageText.setAttribute('lang', original.lang);
    } else {
      messageText.removeAttribute('lang');
    }

    if (original.hadTitle && original.title !== null) {
      messageText.setAttribute('title', original.title);
    } else {
      messageText.removeAttribute('title');
    }
  } else if (messageText) {
    messageText.classList.remove('ytcq-translation-replaced-text');
    messageText.querySelector(':scope .ytcq-replaced-translation-icon')?.remove();
  }

  message.classList.remove('ytcq-translation-replaced');
  delete message.dataset.ytcqReplacedTranslation;
}

function getChannelIdFromElementLinks(root: HTMLElement): string {
  const authorName = getAuthorNameElement(root);
  const authorLink = authorName?.closest<HTMLAnchorElement>('a[href]');
  const candidateLinks = [
    authorName instanceof HTMLAnchorElement ? authorName : null,
    authorLink,
    root.querySelector<HTMLAnchorElement>('a[href*="/channel/"]')
  ];

  for (const link of candidateLinks) {
    const channelId = getChannelIdFromHref(link?.getAttribute('href') || '');
    if (channelId) return channelId;
  }

  return '';
}

function getChannelIdFromHref(href: string): string {
  const cleanHref = cleanText(href);
  if (!cleanHref) return '';

  try {
    const url = new URL(cleanHref, 'https://www.youtube.com');
    const [kind, channelId] = url.pathname.split('/').filter(Boolean);
    return kind === 'channel' ? cleanText(channelId) : '';
  } catch {
    return '';
  }
}
