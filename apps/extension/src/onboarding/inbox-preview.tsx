/** An Inbox example with inactive sample controls and temporary keyword highlights. */
import {
  applyChatKeywordHighlights,
  clearChatKeywordHighlights
} from '../features/inbox/highlights';
import { positionInboxCard } from '../features/inbox/positioning';
import { clampFloatingPanelToViewport, wireFloatingPanelDrag } from '../shared/floating-panel-drag';
import { getUiLocale, initUiLocaleFromDocument, t } from '../shared/i18n';
import {
  createBookmarkIcon,
  createAddIcon,
  createCloseIcon,
  createInboxIcon,
  createJumpToMessageIcon
} from '../shared/icons';
import { el, jsx } from '../shared/jsx-dom';
import { wirePreviewInfo } from './info-tooltips';

const SAMPLE_KEYWORD = 'welcome';

export async function initInboxPreview(root: HTMLElement): Promise<void> {
  await initUiLocaleFromDocument();
  const trigger = root.querySelector<HTMLButtonElement>('#previewInboxIcon');
  const message = root.querySelector<HTMLElement>('.preview-message:last-of-type');
  const sourceText = message?.querySelector<HTMLElement>('#message');
  const sourceAvatar = message?.querySelector<HTMLElement>('#author-photo');
  if (!trigger || !message || !sourceText || !sourceAvatar || !root.isConnected) return;
  trigger.setAttribute('aria-label', t('inbox'));
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', () => {
    const existingClose = document.querySelector<HTMLButtonElement>(
      '.preview-inbox-card .ytcq-profile-card-close'
    );
    if (existingClose) {
      existingClose.click();
      return;
    }
    document
      .querySelector<HTMLButtonElement>('.preview-profile-card .ytcq-profile-card-close')
      ?.click();
    const menu = root.querySelector<HTMLElement>('#previewSettingsMenu');
    if (menu && !menu.hidden) root.querySelector<HTMLButtonElement>('#previewMenuButton')?.click();

    const previewBounds = root.getBoundingClientRect();
    if (previewBounds.top < 0 || previewBounds.bottom > window.innerHeight)
      root.scrollIntoView({ block: 'center', behavior: 'instant' });
    applyChatKeywordHighlights(message, [SAMPLE_KEYWORD], SAMPLE_KEYWORD);
    const text = sourceText.cloneNode(true) as HTMLElement;
    text.removeAttribute('id');
    const avatar = sourceAvatar.cloneNode(true) as HTMLElement;
    for (const element of [avatar, ...avatar.querySelectorAll('[id]')])
      element.removeAttribute('id');
    for (const attribute of [
      'role',
      'tabindex',
      'title',
      'aria-label',
      'aria-haspopup',
      'aria-describedby'
    ])
      avatar.removeAttribute(attribute);
    avatar.classList.add('ytcq-inbox-avatar');
    avatar.setAttribute('aria-hidden', 'true');
    const closeButton = el<HTMLButtonElement>(
      <button
        type="button"
        class="ytcq-profile-card-header-button ytcq-profile-card-close"
        aria-label={t('close')}
        onClick={() => close(true)}
      >
        {createCloseIcon()}
      </button>
    );
    const card = el<HTMLElement>(
      <section
        id="previewInbox"
        class="ytcq-profile-card ytcq-inbox-card preview-inbox-card"
        role="dialog"
        aria-label={t('inbox')}
      >
        <div class="ytcq-profile-card-header ytcq-inbox-card-header">
          <span class="ytcq-panel-drag-grip" aria-hidden="true" />
          <span class="ytcq-inbox-card-icon">{createInboxIcon(true)}</span>
          <div class="ytcq-profile-card-title-wrap">
            <div class="ytcq-profile-card-title">{t('inbox')}</div>
            <div class="ytcq-profile-card-subtitle">{t('savedMessages', { count: 1 })}</div>
          </div>
          <button
            type="button"
            class="ytcq-profile-card-header-button ytcq-inbox-keyword-toggle ytcq-inbox-keyword-toggle-has-count"
            aria-label={t('addKeywordsCount', { count: 1 })}
            aria-expanded="true"
            disabled
          >
            {createAddIcon()}
            <span class="ytcq-inbox-keyword-count">1</span>
          </button>
          {closeButton}
        </div>
        <div class="ytcq-inbox-keyword-panel">
          <div class="ytcq-inbox-keyword-form">
            <input
              class="ytcq-inbox-keyword-input"
              type="text"
              placeholder={t('keywordOrPhrase')}
              aria-label={t('keywordOrPhrase')}
              disabled
            />
            <button type="button" class="ytcq-inbox-keyword-add" disabled>
              {t('add')}
            </button>
          </div>
          <div class="ytcq-inbox-keyword-chips">
            <span class="ytcq-inbox-keyword-chip">
              <span>{SAMPLE_KEYWORD}</span>
              <button
                type="button"
                class="ytcq-inbox-keyword-remove"
                aria-label={t('removeKeyword', { keyword: SAMPLE_KEYWORD })}
                disabled
              >
                {createCloseIcon()}
              </button>
            </span>
          </div>
        </div>
        <div class="ytcq-profile-card-messages ytcq-inbox-messages">
          <div class="ytcq-profile-card-message ytcq-inbox-message ytcq-inbox-message-has-avatar">
            {avatar}
            <time class="ytcq-profile-card-message-time">
              {new Intl.DateTimeFormat(getUiLocale(), {
                hour: 'numeric',
                minute: '2-digit'
              }).format(new Date(2026, 0, 1, 12, 2))}
            </time>
            <span class="ytcq-profile-card-message-text ytcq-inbox-message-body">
              <span class="preview-inbox-author" dir="auto">
                {message.querySelector('#author-name')?.textContent}
              </span>{' '}
              {text}
            </span>
            <span class="ytcq-profile-card-message-actions">
              <button
                type="button"
                class="ytcq-message-row-action ytcq-bookmark-toggle"
                aria-label={t('saveMessage')}
                disabled
              >
                {createBookmarkIcon()}
              </button>
              <button
                type="button"
                class="ytcq-message-row-action ytcq-profile-card-jump"
                aria-label={t('jumpToMessage')}
                disabled
              >
                {createJumpToMessageIcon()}
              </button>
            </span>
          </div>
        </div>
        <div class="ytcq-profile-card-actions">
          <button type="button" class="ytcq-profile-card-open ytcq-inbox-clear" disabled>
            {t('clear')}
          </button>
        </div>
      </section>
    );
    const listeners = new AbortController();
    document.body.append(card);
    trigger.setAttribute('aria-expanded', 'true');
    positionInboxCard(card, trigger);
    let dragged = false;
    wireFloatingPanelDrag({
      panel: card,
      handle: card.querySelector<HTMLElement>('.ytcq-profile-card-header')!,
      draggingClassName: 'ytcq-inbox-card-dragging',
      signal: listeners.signal,
      onDragMove: () => {
        dragged = true;
      }
    });
    wirePreviewInfo(
      card,
      [
        ['.ytcq-bookmark-toggle', 'onboardingBookmarkTooltip'],
        ['.ytcq-profile-card-jump', 'onboardingJumpToMessageTooltip']
      ],
      listeners.signal
    );
    window.addEventListener(
      'resize',
      () => {
        if (dragged) clampFloatingPanelToViewport(card);
        else positionInboxCard(card, trigger);
      },
      {
        signal: listeners.signal
      }
    );
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (
          event.target instanceof Node &&
          !card.contains(event.target) &&
          !trigger.contains(event.target)
        )
          close();
      },
      { capture: true, signal: listeners.signal }
    );
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') close(true);
      },
      { signal: listeners.signal }
    );
    closeButton.focus({ preventScroll: true });

    function close(restoreFocus = false): void {
      listeners.abort();
      card.remove();
      clearChatKeywordHighlights(message!);
      delete message!.dataset.ytcqInboxKeywordHighlightKey;
      trigger!.setAttribute('aria-expanded', 'false');
      if (restoreFocus) trigger!.focus({ preventScroll: true });
    }
  });
}
