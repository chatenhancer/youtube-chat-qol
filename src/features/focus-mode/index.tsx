/**
 * Conversation focus mode.
 *
 * Offers a temporary input-adjacent panel for continuing a conversation with a
 * selected chatter. It is intentionally local and current-page only.
 */
import { t } from '../../shared/i18n';
import { createCloseIcon } from '../../shared/icons';
import { jsx, el } from '../../shared/jsx-dom';
import {
  captureScrollPosition,
  restoreScrollPositionAfterRender,
  scrollElementToBottom,
  wireScrollEdgeFades
} from '../../shared/scroll';
import { findChatInput, getChatInputText, replaceChatInput } from '../../youtube/chat-input';
import {
  CHAT_MESSAGE_SELECTOR,
  PANEL_PAGES_SELECTOR,
  SEND_BUTTON_SELECTOR
} from '../../youtube/selectors';
import { getChannelUrl, openChannelWindow } from '../channel-popup';
import { applyMarkedUserRing } from '../marked-users';
import { isCurrentUserAuthorName } from '../mention-detection';
import { registerFeatureLifecycle } from '../../content/lifecycle';
import {
  onMessageTranslationCleared,
  onMessageTranslationRendered,
  onMessageTranslationsCleared,
  type MessageTranslationRenderedEvent
} from '../translation/events';
import { cloneProtectedTokens } from '../translation/protected-placeholders';
import {
  createTranslationPriorityScope,
  type TranslationPriorityScope
} from '../translation/queue';
import { createFocusRecord, findFocusRecordForMessage } from './records';
import {
  getAuthorInitial,
  getFocusMentionPrefix,
  getFocusSourceFromMessage,
  isSameFocusSource,
  normalizeFocusSource,
  startsWithFocusMention
} from './source';
import { renderFocusMessageText } from './translation';
import type { FocusRecord, FocusSource } from './types';

const FOCUS_ANCHOR_CLASS = 'ytcq-focus-anchor';

let activeSource: FocusSource | null = null;
let activeCard: HTMLElement | null = null;
let activeList: HTMLElement | null = null;
let activeScrollFadeCleanup: (() => void) | null = null;
let activeTranslationPriorityScope: TranslationPriorityScope | null = null;
let activeExpanded = false;
let mentionRestoreTimer = 0;
let nextRecordId = 1;
let focusModeListeners = new AbortController();
const focusRecords: FocusRecord[] = [];

registerFeatureLifecycle({
  page: {
    init: initFocusMode,
    cleanupStale: cleanupStaleFocusMode,
    reset: resetFocusMode
  },
  message: { collect: handlePotentialFocusMessage }
});

export function initFocusMode(): void {
  const options = { capture: true, signal: focusModeListeners.signal };
  document.addEventListener('keydown', handleDocumentKeydown, options);
  document.addEventListener('click', handleDocumentClick, options);
  onMessageTranslationRendered(recordFocusMessageTranslation);
  onMessageTranslationCleared(({ message }) => clearFocusMessageTranslation(message));
  onMessageTranslationsCleared(clearFocusMessageTranslations);
}

export function resetFocusMode(): void {
  closeFocusMode();
}

export function cleanupStaleFocusMode(): void {
  focusModeListeners.abort();
  focusModeListeners = new AbortController();
  closeFocusMode();
  document
    .querySelectorAll<HTMLElement>(`.${FOCUS_ANCHOR_CLASS}`)
    .forEach((anchor) => anchor.remove());
}

export function showFocusPromptForMessage(message: HTMLElement): void {
  const source = getFocusSourceFromMessage(message);
  if (source) showFocusPromptForAuthor(source);
}

export function showFocusPromptForAuthor(source: FocusSource): void {
  const normalizedSource = normalizeFocusSource(source);
  if (!normalizedSource || isCurrentUserAuthorName(normalizedSource.authorName)) return;

  if (activeExpanded && activeSource && isSameFocusSource(activeSource, normalizedSource)) {
    return;
  }

  activeSource = normalizedSource;
  clearFocusRecords();
  stopFocusTranslationPriority();
  renderCollapsedFocusPrompt();
}

export function openFocusModeForAuthor(source: FocusSource): boolean {
  const normalizedSource = normalizeFocusSource(source);
  if (!normalizedSource || isCurrentUserAuthorName(normalizedSource.authorName)) return false;

  activeSource = normalizedSource;
  openFocusPanel();
  return true;
}

export function handlePotentialFocusMessage(message: HTMLElement): void {
  if (!activeExpanded || !activeSource || !activeList || !message.isConnected) return;

  const record = createFocusRecord(message, activeSource, focusRecords, () => nextRecordId++);
  if (!record) return;

  focusRecords.push(record);
  prioritizeFocusRecordTranslation(record);
  refreshFocusMessages();
}

function recordFocusMessageTranslation({
  message,
  result,
  originalText,
  protectedTokens,
  sourceText
}: MessageTranslationRenderedEvent): void {
  const record = findFocusRecordForMessage(focusRecords, message);
  if (!record) return;

  record.translation = {
    result,
    originalText,
    sourceText,
    protectedTokens: cloneProtectedTokens(protectedTokens)
  };
  refreshFocusMessages();
  prioritizeFocusMessageTranslations();
}

function clearFocusMessageTranslation(message: HTMLElement): void {
  const record = findFocusRecordForMessage(focusRecords, message);
  if (!record?.translation) return;

  delete record.translation;
  refreshFocusMessages();
}

function clearFocusMessageTranslations(): void {
  let changed = false;
  focusRecords.forEach((record) => {
    if (!record.translation) return;
    delete record.translation;
    changed = true;
  });
  if (!changed) return;

  refreshFocusMessages();
  prioritizeFocusMessageTranslations();
}

function renderCollapsedFocusPrompt(): void {
  if (!activeSource) return;

  activeExpanded = false;
  cleanupActiveScrollFade();
  activeCard?.remove();

  const author = createFocusAuthor(activeSource, { openChannel: false });
  const openButton = el<HTMLButtonElement>(
    <button type="button" class="ytcq-focus-open">
      {t('open')}
    </button>
  );
  openButton.addEventListener('click', openCollapsedFocusPanel);

  const card = el<HTMLElement>(
    <section
      class="ytcq-focus-card ytcq-focus-card-collapsed"
      role="button"
      tabIndex={0}
      aria-label={t('focusMode')}
    >
      <div class="ytcq-focus-summary">
        <span class="ytcq-focus-label">{t('focusOn')}</span>
        {author}
      </div>
      {openButton}
      {createFocusCloseButton(closeFocusMode)}
    </section>
  );
  card.addEventListener('click', openCollapsedFocusPanel);
  card.addEventListener('keydown', (event) => {
    if (event.target !== card) return;
    if (event.key === 'Enter' || event.key === ' ') {
      openCollapsedFocusPanel(event);
    }
  });
  mountFocusCard(card);
  activeList = null;
}

function openCollapsedFocusPanel(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  openFocusPanel();
}

function openFocusPanel(): void {
  if (!activeSource) return;

  activeExpanded = true;
  cleanupActiveScrollFade();
  activeCard?.remove();
  clearFocusRecords();
  stopFocusTranslationPriority();
  activeTranslationPriorityScope = createTranslationPriorityScope();

  let list!: HTMLDivElement;
  const card = el<HTMLElement>(
    <section
      class="ytcq-focus-card ytcq-focus-card-expanded"
      role="dialog"
      aria-label={t('focusMode')}
    >
      <div class="ytcq-focus-header">
        <div class="ytcq-focus-title">
          <span class="ytcq-focus-label">{t('focusingOn')}</span>
          {createFocusAuthor(activeSource, { openChannel: true })}
        </div>
        {createFocusCloseButton(closeFocusMode)}
      </div>
      <div ref={(element: HTMLDivElement) => (list = element)} class="ytcq-focus-messages" />
    </section>
  );
  activeScrollFadeCleanup = wireScrollEdgeFades(list);
  mountFocusCard(card);
  activeList = list;

  scanVisibleFocusInteractions();
  prioritizeFocusMessageTranslations();
  renderFocusMessages();
  if (activeList) scrollElementToBottom(activeList);
  scheduleEnsureFocusMentionPrefix();
}

function scanVisibleFocusInteractions(): void {
  if (!activeSource) return;
  const source = activeSource;

  document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR).forEach((message) => {
    const record = createFocusRecord(message, source, focusRecords, () => nextRecordId++);
    if (record) focusRecords.push(record);
  });
}

function renderFocusMessages(): void {
  if (!activeList) return;
  activeList.replaceChildren();

  if (!focusRecords.length) {
    activeList.append(el<HTMLDivElement>(<div class="ytcq-focus-empty">{t('noMessagesYet')}</div>));
    return;
  }

  focusRecords.forEach((record) => {
    const item = el<HTMLDivElement>(
      <div class={`ytcq-focus-message ytcq-focus-message-${record.side}`} />
    );
    if (record.side === 'them') {
      item.classList.add('ytcq-focus-message-quotable');
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('title', t('quoteMessage'));
      item.setAttribute('aria-label', t('quoteMessage'));
      wireFocusMessageQuote(item, record);
    }

    const meta = el<HTMLDivElement>(
      <div class="ytcq-focus-message-meta">{record.timestampText}</div>
    );

    const bubble = el<HTMLDivElement>(<div class="ytcq-focus-bubble" />);
    renderFocusMessageText(item, bubble, record);

    item.append(meta, bubble);
    activeList?.append(item);
  });
}

function wireFocusMessageQuote(item: HTMLElement, record: FocusRecord): void {
  const quote = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    void quoteFocusRecord(record);
  };

  item.addEventListener('click', quote);
  item.addEventListener('keydown', (event) => {
    if (event.target !== item) return;
    if (event.key === 'Enter' || event.key === ' ') {
      quote(event);
    }
  });
}

async function quoteFocusRecord(record: FocusRecord): Promise<void> {
  const { quoteAuthorRichText } = await import('../reply');
  quoteAuthorRichText(
    record.authorName,
    record.text,
    {
      segments: record.contentParts
    },
    { skipFocusPrompt: true }
  );
}

function closeFocusMode(): void {
  cleanupActiveScrollFade();
  activeCard?.remove();
  activeCard = null;
  activeList = null;
  activeSource = null;
  activeExpanded = false;
  stopFocusTranslationPriority();
  clearFocusRecords();
  window.clearTimeout(mentionRestoreTimer);
  mentionRestoreTimer = 0;
}

function cleanupActiveScrollFade(): void {
  activeScrollFadeCleanup?.();
  activeScrollFadeCleanup = null;
}

function clearFocusRecords(): void {
  focusRecords.length = 0;
}

function prioritizeFocusMessageTranslations(): void {
  activeTranslationPriorityScope?.prioritize(focusRecords.map(getFocusRecordLiveMessage));
}

function prioritizeFocusRecordTranslation(record: FocusRecord): void {
  activeTranslationPriorityScope?.prioritize([getFocusRecordLiveMessage(record)]);
}

function getFocusRecordLiveMessage(record: FocusRecord): HTMLElement | null {
  const message = record.messageRef?.deref() || null;
  return message?.isConnected ? message : null;
}

function stopFocusTranslationPriority(): void {
  activeTranslationPriorityScope?.close();
  activeTranslationPriorityScope = null;
}

function createFocusAuthor(source: FocusSource, options: { openChannel: boolean }): HTMLElement {
  const channelUrl = getChannelUrl(source.channelId, source.authorName);
  const content = [
    createFocusAvatar(source),
    el<HTMLSpanElement>(<span class="ytcq-focus-author-name">{source.authorName}</span>)
  ];

  if (channelUrl && options.openChannel) {
    const author = el<HTMLButtonElement>(
      <button
        type="button"
        class="ytcq-focus-author ytcq-focus-author-button"
        title={t('openChannel')}
        aria-label={t('openChannel')}
      >
        {content}
      </button>
    );
    author.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openChannelWindow(channelUrl);
    });
    return author;
  }

  return el<HTMLSpanElement>(<span class="ytcq-focus-author">{content}</span>);
}

function createFocusAvatar(source: FocusSource): HTMLElement {
  if (source.avatarSrc) {
    const surface = el<HTMLSpanElement>(
      <span class="ytcq-focus-avatar">
        <img src={source.avatarSrc} alt="" referrerPolicy="no-referrer" />
      </span>
    );
    applyMarkedUserRing(surface, {
      authorName: source.authorName,
      avatarUrl: source.avatarSrc,
      channelId: source.channelId
    });
    return surface;
  }

  const fallback = el<HTMLSpanElement>(
    <span class="ytcq-focus-avatar ytcq-focus-avatar-fallback">
      {getAuthorInitial(source.authorName)}
    </span>
  );
  applyMarkedUserRing(fallback, {
    authorName: source.authorName,
    avatarUrl: source.avatarSrc,
    channelId: source.channelId
  });
  return fallback;
}

function createFocusCloseButton(onClick: () => void): HTMLButtonElement {
  const button = el<HTMLButtonElement>(
    <button type="button" class="ytcq-focus-close" aria-label={t('close')}>
      {createCloseIcon()}
    </button>
  );
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

function mountFocusCard(card: HTMLElement): void {
  const anchor = getFocusAnchor();
  anchor.replaceChildren(card);
  activeCard = card;
}

function getFocusAnchor(): HTMLElement {
  const existing = document.querySelector<HTMLElement>(`.${FOCUS_ANCHOR_CLASS}`);
  const panelPages = document.querySelector<HTMLElement>(PANEL_PAGES_SELECTOR);
  const parent = panelPages?.parentElement || document.body;
  if (existing && existing.parentElement === parent) return existing;

  existing?.remove();

  const anchor = el<HTMLDivElement>(<div class={FOCUS_ANCHOR_CLASS} />);
  if (panelPages) {
    parent.insertBefore(anchor, panelPages);
  } else {
    parent.append(anchor);
  }
  return anchor;
}

function refreshFocusMessages(): void {
  if (!activeList) return;

  const scrollPosition = captureScrollPosition(activeList);
  renderFocusMessages();
  restoreScrollPositionAfterRender(activeList, scrollPosition);
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (!activeExpanded) return;
  if (event.key === 'Escape') {
    closeFocusMode();
    return;
  }
  if (event.key !== 'Enter' || event.shiftKey || !isFromChatInput(event.target)) return;

  schedulePostSendMentionRestore();
}

function handleDocumentClick(event: Event): void {
  if (!activeExpanded) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest(SEND_BUTTON_SELECTOR)) return;

  schedulePostSendMentionRestore();
}

function schedulePostSendMentionRestore(): void {
  window.setTimeout(() => scheduleEnsureFocusMentionPrefix({ prefixExistingText: false }), 120);
  window.setTimeout(() => scheduleEnsureFocusMentionPrefix({ prefixExistingText: false }), 360);
}

function scheduleEnsureFocusMentionPrefix(options: { prefixExistingText?: boolean } = {}): void {
  if (mentionRestoreTimer) window.clearTimeout(mentionRestoreTimer);
  const prefixExistingText = options.prefixExistingText !== false;
  mentionRestoreTimer = window.setTimeout(() => {
    mentionRestoreTimer = 0;
    ensureFocusMentionPrefix({ prefixExistingText });
  }, 0);
}

function ensureFocusMentionPrefix({ prefixExistingText }: { prefixExistingText: boolean }): void {
  if (!activeExpanded || !activeSource) return;

  const prefix = getFocusMentionPrefix(activeSource);
  if (!prefix) return;

  const text = getChatInputText();
  if (startsWithFocusMention(text, activeSource)) {
    focusChatInput();
    return;
  }

  const nextText = prefixExistingText && text ? `${prefix}${text}` : prefix;
  replaceChatInput(nextText);
}

function focusChatInput(): void {
  const input = findChatInput();
  if (!input) return;

  input.focus();

  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    input.selectionStart = input.selectionEnd = input.value.length;
    return;
  }

  const selection = document.getSelection();
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function isFromChatInput(target: EventTarget | null): boolean {
  const input = findChatInput();
  return Boolean(input && target instanceof Node && (input === target || input.contains(target)));
}
