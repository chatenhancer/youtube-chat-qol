/**
 * Reply insertion helpers.
 *
 * Mention and Quote insert plain text into YouTube's native chat input.
 * Clicking an author name is a quick Mention shortcut. Alt/Option-clicking an
 * author name quotes that message while normal message clicks remain available
 * for YouTube's own message UI.
 */
import { t } from '../../shared/i18n';
import { cleanText } from '../../shared/text';
import { showToast } from '../../shared/toast';
import { getMessageContentNodes, getMessageDetails } from '../../youtube/messages';
import { showFocusPromptForAuthor, showFocusPromptForMessage } from '../focus-mode';
import { registerFeatureLifecycle } from '../../content/lifecycle';
import { formatMentionText, formatQuoteText } from './format';
import { insertMentionText, replaceInputWithQuoteNodes, replaceInputWithQuoteText } from './input';
import { createQuoteContentNodes } from './quote-content';
import type { ReplyInsertOptions, RichQuoteContent } from './types';

let replyWiringListeners = new AbortController();

registerFeatureLifecycle({
  page: { cleanupStale: cleanupStaleReplyWiring },
  message: { enhance: wireAuthorNameMention }
});

export function wireAuthorNameMention(message: HTMLElement): void {
  if (message.dataset.ytcqAuthorMentionWired === 'true') return;
  message.dataset.ytcqAuthorMentionWired = 'true';

  const authorName = message.querySelector<HTMLElement>('#author-name');
  if (!authorName) return;

  authorName.title = t('mentionUserTitle');
  const handleClick = (event: MouseEvent): void => {
    if (event.defaultPrevented || event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    replyToMessage(message, { quote: event.altKey });
  };
  authorName.addEventListener('click', handleClick, {
    capture: true,
    signal: replyWiringListeners.signal
  });
}

export function cleanupStaleReplyWiring(): void {
  replyWiringListeners.abort();
  replyWiringListeners = new AbortController();
  document.querySelectorAll('[data-ytcq-author-mention-wired]').forEach((element) => {
    const authorName = element.querySelector<HTMLElement>('#author-name');
    if (authorName?.title === t('mentionUserTitle')) {
      authorName.removeAttribute('title');
    }
    element.removeAttribute('data-ytcq-author-mention-wired');
  });
}

export function replyToMessage(message: HTMLElement, { quote }: { quote: boolean }): void {
  const details = getMessageDetails(message);
  showFocusPromptForMessage(message);
  if (quote && details.text) {
    quoteAuthorRichText(details.authorName, details.text, {
      nodes: getMessageContentNodes(message)
    }, { skipFocusPrompt: true });
  } else {
    mentionAuthorName(details.authorName, { skipFocusPrompt: true });
  }
}

export function mentionAuthorName(authorName: string, options: ReplyInsertOptions = {}): void {
  if (!options.skipFocusPrompt) showFocusPromptForAuthor(options.focusSource || { authorName });

  const mentionText = formatMentionText(authorName);
  if (!mentionText) {
    showToast(t('couldNotReadUserName'));
    return;
  }

  insertMentionText(mentionText);
}

export function quoteAuthorText(authorName: string, text: string, options: ReplyInsertOptions = {}): void {
  if (!options.skipFocusPrompt) showFocusPromptForAuthor(options.focusSource || { authorName });

  const quoteText = formatQuoteText(authorName, text);
  if (!quoteText) {
    showToast(t('couldNotReadUserName'));
    return;
  }

  replaceInputWithQuoteText(quoteText);
}

export function quoteAuthorRichText(
  authorName: string,
  text: string,
  content: RichQuoteContent,
  options: ReplyInsertOptions = {}
): void {
  if (!options.skipFocusPrompt) showFocusPromptForAuthor(options.focusSource || { authorName });

  const cleanAuthorName = cleanText(authorName);
  if (!cleanAuthorName) {
    showToast(t('couldNotReadUserName'));
    return;
  }

  const cleanMessage = cleanText(text);
  if (!cleanMessage) {
    replaceInputWithQuoteText(`${cleanAuthorName} `);
    return;
  }

  const quoteContent = createQuoteContentNodes(content, cleanMessage);
  const fallbackText = formatQuoteText(cleanAuthorName, cleanMessage);
  if (!quoteContent.nodes.length) {
    replaceInputWithQuoteText(fallbackText);
    return;
  }

  replaceInputWithQuoteNodes([
    document.createTextNode(`${cleanAuthorName} : "`),
    ...quoteContent.nodes,
    document.createTextNode(`${quoteContent.truncated ? '...' : ''}"`)
  ], fallbackText, ' ');
}

export { formatMentionText, formatQuoteText };
