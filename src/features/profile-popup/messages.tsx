/**
 * Profile card message list.
 *
 * Renders recent user messages, optional translations, quote interactions, and
 * jump-to-message controls for the avatar profile card.
 */
import { getOptions } from '../../shared/state';
import { t } from '../../shared/i18n';
import { jsx, el } from '../../shared/jsx-dom';
import { normalizeComparableText } from '../../shared/text';
import { appendRichMessageText } from '../../youtube/rich-text';
import {
  createInlineTranslationElement,
  isMeaningfulTranslation,
  renderToggleableReplacementTranslation
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
  const focusedControl = captureFocusedMessageControl(list);
  list.replaceChildren();

  if (recentMessages.length) {
    recentMessages.forEach((recentMessage) => {
      const liveMessage = getLiveMessageForRecord(recentMessage);
      const item = el<HTMLDivElement>(
        <div
          class="ytcq-profile-card-message"
          title={t('quoteMessage')}
          role="button"
          tabIndex={0}
        />
      );
      item.dataset.ytcqMessageRecordId = String(recentMessage.id);
      if (recentMessage.messageId) item.dataset.ytcqMessageId = recentMessage.messageId;
      if (liveMessage?.id) item.dataset.ytcqLiveMessageId = liveMessage.id;
      wireQuoteCardItem(item, recentMessage, source, onClose);

      const timestamp = el<HTMLTimeElement>(
        <time
          class="ytcq-profile-card-message-time"
          dateTime={new Date(recentMessage.timestamp).toISOString()}
        >
          {recentMessage.timestampText}
        </time>
      );

      const text = el<HTMLDivElement>(<div class="ytcq-profile-card-message-text" />);
      renderProfileMessageText(item, text, recentMessage);

      item.append(timestamp, text);
      const jumpButton = liveMessage ? createJumpToMessageButton(liveMessage) : null;
      if (jumpButton) item.append(jumpButton);
      list.append(item);
    });
    restoreFocusedMessageControl(list, focusedControl);
    return;
  }

  list.append(
    el<HTMLDivElement>(
      <div class="ytcq-profile-card-empty ytcq-profile-card-empty-centered">
        <span>{t('noRecentMessages')}</span>
      </div>
    )
  );
}

interface FocusedMessageControl {
  recordId: string;
  target: 'jump' | 'message';
}

function captureFocusedMessageControl(list: HTMLElement): FocusedMessageControl | null {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement) || !list.contains(activeElement)) return null;

  const message = activeElement.closest<HTMLElement>('.ytcq-profile-card-message');
  const recordId = message?.dataset.ytcqMessageRecordId;
  if (!message || !recordId) return null;
  if (activeElement === message) return { recordId, target: 'message' };
  if (activeElement.classList.contains('ytcq-profile-card-jump')) {
    return { recordId, target: 'jump' };
  }
  return null;
}

function restoreFocusedMessageControl(
  list: HTMLElement,
  focusedControl: FocusedMessageControl | null
): void {
  if (!focusedControl) return;

  const message = Array.from(list.querySelectorAll<HTMLElement>('.ytcq-profile-card-message')).find(
    (candidate) => candidate.dataset.ytcqMessageRecordId === focusedControl.recordId
  );
  const target =
    focusedControl.target === 'jump'
      ? message?.querySelector<HTMLElement>('.ytcq-profile-card-jump')
      : message;
  target?.focus({ preventScroll: true });
}

export function shouldRefreshProfileMessages(
  key: string,
  source: ProfileSource,
  profileKey: string
): boolean {
  if (key === profileKey) return true;

  const authorName = normalizeComparableText(source.authorName);
  if (!authorName) return false;

  return getRecentMessagesForKey(key).some(
    (record) => normalizeComparableText(record.authorName) === authorName
  );
}

function renderProfileMessageText(
  item: HTMLElement,
  text: HTMLElement,
  recentMessage: MessageRecord
): void {
  const translation = getVisibleProfileMessageTranslation(recentMessage);

  if (translation && getOptions().translationDisplay === 'replace') {
    renderToggleableReplacementTranslation({
      host: item,
      originalText: recentMessage.text,
      protectedTokens: translation.protectedTokens,
      renderOriginal: (target) =>
        appendRichMessageText(target, recentMessage.text, [], recentMessage.contentParts),
      result: translation.result,
      textElement: text
    });
    return;
  }

  appendRichMessageText(text, recentMessage.text, [], recentMessage.contentParts);
  if (translation) {
    text.append(createInlineTranslationElement(translation.result, translation.protectedTokens));
  }
}

function getVisibleProfileMessageTranslation(
  recentMessage: MessageRecord
): MessageRecord['translation'] {
  const translation = recentMessage.translation;
  const targetLanguage = getOptions().targetLanguage;
  if (!translation || !targetLanguage) return undefined;
  if (translation.result.targetLanguage !== targetLanguage) return undefined;
  if (
    !isMeaningfulTranslation(
      translation.result,
      translation.protectedTokens,
      translation.sourceText
    )
  )
    return undefined;
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
    quoteAuthorRichText(
      recentMessage.authorName,
      recentMessage.text,
      {
        segments: recentMessage.contentParts
      },
      {
        focusSource: {
          authorName: source.authorName,
          avatarSrc: source.avatarSrc,
          channelId: source.identity.channelId
        }
      }
    );
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
  const button = el<HTMLButtonElement>(
    <button
      type="button"
      class="ytcq-profile-card-jump"
      title={t('jumpToMessage')}
      aria-label={t('jumpToMessage')}
    >
      {createJumpToMessageIcon()}
    </button>
  );
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    jumpToChatMessage(liveMessage);
  });

  return button;
}
