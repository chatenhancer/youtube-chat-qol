/**
 * YouTube chat message adapter.
 *
 * Centralizes extraction of author names, message text, renderer data, and
 * original message snapshots. Feature modules use this instead of duplicating
 * fragile selectors across the codebase.
 */
import { cleanText } from '../shared/text';
import { CHAT_TOOLTIP_SELECTOR } from './selectors';

interface RendererRun {
  text?: string;
  emoji?: {
    shortcuts?: string[];
    searchTerms?: string[];
    emojiId?: string;
  };
}

interface RendererText {
  simpleText?: string;
  runs?: RendererRun[];
}

interface RendererData {
  id?: string;
  authorExternalChannelId?: string;
  authorChannelId?: string;
  authorName?: RendererText;
  message?: RendererText;
  messageText?: RendererText;
  headerSubtext?: RendererText;
}

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
  const data = getRendererData(message);
  return cleanText(
    data?.authorName?.simpleText ||
    data?.authorName?.runs?.map((run) => run.text || '').join('') ||
    getAuthorNameElement(message)?.textContent ||
    ''
  );
}

export function getAuthorNameElement(message: HTMLElement): HTMLElement | null {
  return message.querySelector<HTMLElement>('#author-name');
}

export function getMessageText(message: HTMLElement): string {
  const replaced = replacedMessages.get(message);
  if (replaced?.originalText) return cleanText(replaced.originalText);

  const data = getRendererData(message);
  const fromRuns = getTextFromRuns(data?.message?.runs) ||
    getTextFromRuns(data?.messageText?.runs) ||
    getTextFromRuns(data?.headerSubtext?.runs);

  const messageText = getMessageTextElement(message);
  return cleanText(fromRuns || (messageText ? getPlainTextFromMessageNodes(messageText) : ''));
}

export function getMessageTextElement(message: HTMLElement): HTMLElement | null {
  return message.querySelector<HTMLElement>('#message');
}

export function getMessageContentNodes(message: HTMLElement): Node[] {
  return getMessageContentSourceNodes(message).map((node) => node.cloneNode(true));
}

export function getMessageContentSourceNodes(message: HTMLElement): Node[] {
  const replaced = replacedMessages.get(message);
  if (replaced?.childNodes.length) {
    return replaced.childNodes;
  }

  const messageText = getMessageTextElement(message);
  return messageText ? Array.from(messageText.childNodes) : [];
}

export function getRendererData(message: HTMLElement): RendererData | null {
  const candidate = message as HTMLElement & {
    data?: RendererData;
    __data?: { data?: RendererData };
  };
  return candidate.data || candidate.__data?.data || null;
}

export function getMessageRuns(message: HTMLElement): RendererRun[] | null {
  const data = getRendererData(message);
  return data?.message?.runs ||
    data?.messageText?.runs ||
    data?.headerSubtext?.runs ||
    null;
}

export function getMessageTimestampText(message: HTMLElement, timestamp = Date.now()): string {
  const youtubeTimestamp = message.querySelector('#timestamp')?.textContent;
  if (youtubeTimestamp) {
    const cleanTimestamp = youtubeTimestamp.replace(/\s+/g, ' ').trim();
    if (cleanTimestamp) return cleanTimestamp;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(timestamp);
}

export function getMessageStableId(message: HTMLElement): string {
  const data = getRendererData(message);
  return cleanText(
    data?.id ||
    message.getAttribute('data-message-id') ||
    message.id ||
    ''
  );
}

export function getTextFromRuns(runs: RendererRun[] | undefined): string {
  if (!Array.isArray(runs)) return '';
  return runs.map((run) => run.text || getEmojiTextFromRun(run) || '').join('');
}

export function getEmojiTextFromRun(run: RendererRun): string {
  return run?.emoji?.shortcuts?.[0] ||
    run?.emoji?.searchTerms?.[0] ||
    run?.emoji?.emojiId ||
    '';
}

function getPlainTextFromMessageNodes(element: HTMLElement): string {
  return Array.from(element.childNodes).map(getPlainTextFromNode).join('');
}

function getPlainTextFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (!(node instanceof Element)) return '';
  if (node.matches(CHAT_TOOLTIP_SELECTOR)) return '';

  const tagName = node.tagName.toLowerCase();
  if (tagName === 'br') return '\n';
  if (tagName === 'img' || node.getAttribute('role') === 'img') {
    return node.getAttribute('alt') ||
      node.getAttribute('aria-label') ||
      node.getAttribute('title') ||
      node.textContent ||
      '';
  }

  return Array.from(node.childNodes).map(getPlainTextFromNode).join('');
}

export function rememberOriginalMessageText(message: HTMLElement, messageText: HTMLElement, originalText: string): void {
  if (replacedMessages.has(message)) return;

  replacedMessages.set(message, {
    originalText,
    childNodes: Array.from(messageText.childNodes).map((node) => node.cloneNode(true)),
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
