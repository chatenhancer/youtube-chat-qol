/**
 * Profile card message list.
 *
 * Renders recent user messages, optional translations, quote interactions, and
 * jump-to-message controls for the avatar profile card.
 */
import { getOptions } from '../../shared/state';
import { t } from '../../shared/i18n';
import { ytcqCreateElement } from '../../shared/managed-dom';
import { normalizeComparableText } from '../../shared/text';
import { appendRichMessageText } from '../../youtube/rich-text';
import { createNodesWithPlaceholders } from '../translation/protected-placeholders';
import {
  createInlineTranslationElement,
  createReplacedTranslationIcon,
  getReplacementTranslationTitle,
  isMeaningfulTranslation
} from '../translation/render';
import {
  getLiveMessageForRecord,
  getRecentMessagesForKey,
  type MessageRecord
} from '../user-message-history';
import { createJumpToMessageIcon, jumpToChatMessage } from '../message-jump';
import { quoteAuthorRichText } from '../reply';
import type { ProfileSource } from './types';

export function renderProfileMessages(
  list: HTMLElement,
  recentMessages: MessageRecord[],
  source: ProfileSource,
  onClose: () => void
): void {
  list.replaceChildren();

  if (recentMessages.length) {
    recentMessages.forEach((recentMessage) => {
      const liveMessage = getLiveMessageForRecord(recentMessage);
      const item = ytcqCreateElement('div');
      item.className = 'ytcq-profile-card-message';
      item.title = t('quoteMessage');
      item.setAttribute('role', 'button');
      item.tabIndex = 0;
      item.dataset.ytcqMessageRecordId = String(recentMessage.id);
      if (recentMessage.messageId) item.dataset.ytcqMessageId = recentMessage.messageId;
      if (liveMessage?.id) item.dataset.ytcqLiveMessageId = liveMessage.id;
      wireQuoteCardItem(item, recentMessage, source, onClose);

      const timestamp = ytcqCreateElement('time');
      timestamp.className = 'ytcq-profile-card-message-time';
      timestamp.textContent = recentMessage.timestampText;
      timestamp.dateTime = new Date(recentMessage.timestamp).toISOString();

      const text = ytcqCreateElement('div');
      text.className = 'ytcq-profile-card-message-text';
      renderProfileMessageText(item, text, recentMessage);

      item.append(timestamp, text);
      const jumpButton = liveMessage ? createJumpToMessageButton(liveMessage) : null;
      if (jumpButton) item.append(jumpButton);
      list.append(item);
    });
    return;
  }

  const empty = ytcqCreateElement('div');
  empty.className = 'ytcq-profile-card-empty ytcq-profile-card-empty-centered';

  const text = ytcqCreateElement('span');
  text.textContent = t('noRecentMessages');

  empty.append(text);
  list.append(empty);
}

export function shouldRefreshProfileMessages(key: string, source: ProfileSource, profileKey: string): boolean {
  if (key === profileKey) return true;

  const authorName = normalizeComparableText(source.authorName);
  if (!authorName) return false;

  return getRecentMessagesForKey(key).some((record) => (
    normalizeComparableText(record.authorName) === authorName
  ));
}

function renderProfileMessageText(
  item: HTMLElement,
  text: HTMLElement,
  recentMessage: MessageRecord
): void {
  const translation = getVisibleProfileMessageTranslation(recentMessage);

  if (translation && getOptions().translationDisplay === 'replace') {
    item.classList.add('ytcq-translation-replaced');
    text.classList.add('ytcq-translation-replaced-text');
    text.lang = translation.result.targetLanguage;
    text.title = getReplacementTranslationTitle(translation.result, recentMessage.text);
    text.append(
      ...createNodesWithPlaceholders(translation.result.text, translation.protectedTokens),
      createReplacedTranslationIcon()
    );
    return;
  }

  appendRichMessageText(text, recentMessage.text, [], recentMessage.contentParts);
  if (translation) {
    text.append(createInlineTranslationElement(translation.result, translation.protectedTokens));
  }
}

function getVisibleProfileMessageTranslation(recentMessage: MessageRecord): MessageRecord['translation'] {
  const translation = recentMessage.translation;
  const targetLanguage = getOptions().targetLanguage;
  if (!translation || !targetLanguage) return undefined;
  if (translation.result.targetLanguage !== targetLanguage) return undefined;
  if (!isMeaningfulTranslation(translation.result, translation.protectedTokens, translation.sourceText)) return undefined;
  return translation;
}

function wireQuoteCardItem(
  item: HTMLElement,
  recentMessage: MessageRecord,
  source: ProfileSource,
  onClose: () => void
): void {
  const quote = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    quoteAuthorRichText(recentMessage.authorName, recentMessage.text, {
      segments: recentMessage.contentParts
    }, {
      focusSource: {
        authorName: source.authorName,
        avatarSrc: source.avatarSrc,
        channelId: source.identity.channelId
      }
    });
    onClose();
  };

  item.addEventListener('click', quote);
  item.addEventListener('keydown', (event) => {
    if (event.target !== item) return;
    if (event.key === 'Enter' || event.key === ' ') {
      quote(event);
    }
  });
}

function createJumpToMessageButton(liveMessage: HTMLElement): HTMLButtonElement {
  const button = ytcqCreateElement('button');
  button.type = 'button';
  button.className = 'ytcq-profile-card-jump';
  button.title = t('jumpToMessage');
  button.setAttribute('aria-label', t('jumpToMessage'));
  button.append(createJumpToMessageIcon());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    jumpToChatMessage(liveMessage);
  });

  return button;
}
