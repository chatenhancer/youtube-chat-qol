/** Interactive sample profiles, using the live card's styles and shared controls. */
import {
  keepProfileCardInViewport,
  positionProfileCard
} from '../features/profile-popup/positioning';
import { formatMentionText, formatQuoteText } from '../features/reply/format';
import { getAvatarRingColor } from '../shared/avatar-rings';
import { wireFloatingPanelDrag } from '../shared/floating-panel-drag';
import { wireFloatingPanelResize } from '../shared/floating-panel-resize';
import { getUiLocale, initUiLocaleFromDocument, t } from '../shared/i18n';
import {
  createBookmarkIcon,
  createAvatarRingIcon,
  createChannelIcon,
  createCloseIcon,
  createJumpToMessageIcon
} from '../shared/icons';
import { el, jsx } from '../shared/jsx-dom';
import { wirePreviewInfo } from './info-tooltips';

const EARLIER_MESSAGES = [
  ['终于赶上啦 🙌', '音质好清楚 🎧'],
  ['heyy everyone 👋', 'this sounds so good 🎶'],
  ['made it just in time ☕', 'love this part ✨']
];

export async function initProfilePreview(root: HTMLElement): Promise<void> {
  await initUiLocaleFromDocument();
  const draft = root.querySelector<HTMLInputElement>('#previewDraft');
  if (!draft || !root.isConnected) return;
  const hideAvatarInfo = wirePreviewInfo(root, [
    ['.preview-message #author-photo', 'onboardingProfileTooltip']
  ]);
  let closeCurrent = (): void => {};
  const timestamp = new Intl.DateTimeFormat(getUiLocale(), { hour: 'numeric', minute: '2-digit' });

  root.querySelectorAll<HTMLElement>('.preview-message').forEach((message, index) => {
    const avatar = message.querySelector<HTMLElement>('#author-photo');
    const author = message.querySelector<HTMLElement>('#author-name');
    const sourceText = message.querySelector<HTMLElement>('#message');
    if (!avatar || !author || !sourceText) return;
    const authorName = author.textContent || '';
    // Preview interactions stay in this page and never create saved users/bookmarks.
    const savedMessages = new Set<number>();
    const ringColor = getAvatarRingColor({ authorName });
    avatar.style.setProperty('--ytcq-avatar-ring-color', ringColor);
    author.style.setProperty('--ytcq-avatar-ring-color', ringColor);
    avatar.setAttribute('role', 'button');
    avatar.setAttribute('aria-haspopup', 'dialog');
    avatar.setAttribute('aria-label', `${t('showRecentMessages')}: ${authorName}`);
    avatar.removeAttribute('aria-hidden');
    avatar.tabIndex = 0;
    avatar.addEventListener('click', open);
    avatar.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open();
    });

    function open(): void {
      hideAvatarInfo();
      closeCurrent();
      document
        .querySelector<HTMLButtonElement>('.preview-inbox-card .ytcq-profile-card-close')
        ?.click();
      const menu = root.querySelector<HTMLElement>('#previewSettingsMenu');
      if (menu && !menu.hidden)
        root.querySelector<HTMLButtonElement>('#previewMenuButton')?.click();
      const listeners = new AbortController();
      const avatarCopy = avatar!.cloneNode(true) as HTMLElement;
      for (const element of [avatarCopy, ...avatarCopy.querySelectorAll('[id]')])
        element.removeAttribute('id');
      for (const attribute of ['role', 'tabindex', 'title', 'aria-label', 'aria-haspopup'])
        avatarCopy.removeAttribute(attribute);
      avatarCopy.setAttribute('aria-hidden', 'true');
      avatarCopy.classList.add('preview-profile-avatar');
      const title = el<HTMLButtonElement>(
        <button
          type="button"
          class="ytcq-profile-card-title ytcq-profile-card-author"
          dir="auto"
          title={t('mentionUser')}
          onClick={() => fillDraft(formatMentionText(authorName))}
        >
          {authorName}
        </button>
      );
      title.style.setProperty('--ytcq-avatar-ring-color', ringColor);
      const remember = actionButton(
        'ytcq-profile-card-header-button ytcq-avatar-ring-toggle',
        t('rememberUser'),
        createAvatarRingIcon(),
        () => {
          avatar!.classList.toggle('ytcq-avatar-ring-active');
          renderRemembered();
        }
      );
      remember.style.setProperty('--ytcq-avatar-ring-color', ringColor);
      const channel = el<HTMLButtonElement>(
        <button
          type="button"
          class="ytcq-profile-card-header-button ytcq-profile-card-channel"
          aria-label={t('openChannel')}
          aria-disabled="true"
        >
          {createChannelIcon()}
        </button>
      );
      const closeButton = actionButton(
        'ytcq-profile-card-header-button ytcq-profile-card-close',
        t('close'),
        createCloseIcon(),
        () => close(true)
      );
      const header = el<HTMLDivElement>(
        <div class="ytcq-profile-card-header ytcq-profile-card-header-has-channel">
          <span class="ytcq-panel-drag-grip" aria-hidden="true" />
          {avatarCopy}
          <div class="ytcq-profile-card-title-wrap">{title}</div>
          {remember}
          {channel}
          {closeButton}
        </div>
      );
      const list = el<HTMLDivElement>(<div class="ytcq-profile-card-messages" />);
      const card = el<HTMLElement>(
        <section
          class="ytcq-profile-card preview-profile-card"
          role="dialog"
          aria-label={t('recentMessagesFromThisUser')}
        >
          {header}
          {list}
        </section>
      );
      const messages = [...(EARLIER_MESSAGES[index] || []), sourceText!.textContent || ''];
      messages.forEach((text, messageIndex) => {
        const latest = messageIndex === messages.length - 1;
        const body = el<HTMLDivElement>(
          <div class="ytcq-profile-card-message-text" dir="auto">
            {text}
          </div>
        );
        const row = el<HTMLDivElement>(
          <div
            class="ytcq-profile-card-message"
            role="button"
            tabIndex={0}
            title={t('quoteMessage')}
            onClick={() => fillDraft(formatQuoteText(authorName, body.textContent || ''))}
            onKeyDown={(event: KeyboardEvent) => {
              if (
                event.target === event.currentTarget &&
                (event.key === 'Enter' || event.key === ' ')
              ) {
                event.preventDefault();
                fillDraft(formatQuoteText(authorName, body.textContent || ''));
              }
            }}
          >
            <time class="ytcq-profile-card-message-time">
              {timestamp.format(new Date(2026, 0, 1, 12, messageIndex))}
            </time>
            {body}
          </div>
        );
        const save = actionButton(
          'ytcq-message-row-action ytcq-bookmark-toggle',
          t('saveMessage'),
          createBookmarkIcon(),
          () => {
            if (savedMessages.has(messageIndex)) savedMessages.delete(messageIndex);
            else savedMessages.add(messageIndex);
            renderSaved();
          }
        );
        const actions = el<HTMLSpanElement>(
          <span class="ytcq-profile-card-message-actions">{save}</span>
        );
        if (latest) {
          actions.append(
            actionButton(
              'ytcq-message-row-action ytcq-profile-card-jump',
              t('jumpToMessage'),
              createJumpToMessageIcon(),
              () => {
                close();
                const scroller = root.querySelector<HTMLElement>('.preview-item-scroller')!;
                const top =
                  message.getBoundingClientRect().top -
                  scroller.getBoundingClientRect().top +
                  scroller.scrollTop;
                scroller.scrollTo({
                  top: Math.max(0, top - scroller.clientHeight / 2 + message.offsetHeight / 2),
                  behavior: 'smooth'
                });
                message.classList.add('ytcq-message-jump-target');
                window.setTimeout(() => message.classList.remove('ytcq-message-jump-target'), 1600);
              }
            )
          );
          const observer = new MutationObserver(() => {
            body.textContent = sourceText!.textContent;
          });
          observer.observe(sourceText!, { childList: true, characterData: true, subtree: true });
          listeners.signal.addEventListener('abort', () => observer.disconnect(), { once: true });
        }
        row.append(actions);
        list.append(row);
        renderSaved();

        function renderSaved(): void {
          const saved = savedMessages.has(messageIndex);
          const label = t(saved ? 'removeSavedMessage' : 'saveMessage');
          save.setAttribute('aria-label', label);
          save.setAttribute('aria-pressed', String(saved));
          save.classList.toggle('ytcq-bookmark-toggle-active', saved);
          save.replaceChildren(createBookmarkIcon(saved));
        }
      });
      document.body.append(card);
      renderRemembered();
      positionProfileCard(card, avatar!.getBoundingClientRect());
      wirePreviewInfo(
        card,
        [
          ['.ytcq-bookmark-toggle', 'onboardingBookmarkTooltip'],
          ['.ytcq-avatar-ring-toggle', 'onboardingRememberUserTooltip'],
          ['.ytcq-profile-card-channel', 'onboardingOpenChannelTooltip'],
          ['.ytcq-profile-card-jump', 'onboardingJumpToMessageTooltip']
        ],
        listeners.signal
      );
      wireFloatingPanelDrag({
        panel: card,
        handle: header,
        draggingClassName: 'ytcq-profile-card-dragging',
        signal: listeners.signal
      });
      wireFloatingPanelResize({
        panel: card,
        axis: 'both',
        minHeight: 140,
        minWidth: 'initial',
        maxWidth: 520,
        signal: listeners.signal,
        onResize: () => keepProfileCardInViewport(card)
      });
      window.addEventListener('resize', () => keepProfileCardInViewport(card), {
        signal: listeners.signal
      });
      document.addEventListener(
        'pointerdown',
        (event) => {
          if (event.target instanceof Node && !card.contains(event.target)) close();
        },
        { capture: true, signal: listeners.signal }
      );
      card.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        close(true);
      });
      closeCurrent = close;
      closeButton.focus({ preventScroll: true });

      function close(restoreFocus = false): void {
        listeners.abort();
        card.remove();
        if (restoreFocus) avatar!.focus({ preventScroll: true });
      }

      function fillDraft(text: string): void {
        close();
        draft!.value = text;
        draft!.focus();
        draft!.setSelectionRange(text.length, text.length);
      }

      function renderRemembered(): void {
        const enabled = avatar!.classList.contains('ytcq-avatar-ring-active');
        const label = t(enabled ? 'forgetUser' : 'rememberUser');
        remember.setAttribute('aria-label', label);
        remember.setAttribute('aria-pressed', String(enabled));
        remember.classList.toggle('ytcq-avatar-ring-toggle-active', enabled);
        remember.replaceChildren(createAvatarRingIcon(enabled));
        avatarCopy.classList.toggle('ytcq-avatar-ring-active', enabled);
        for (const element of [author!, title])
          element.classList.toggle('ytcq-remembered-author-active', enabled);
      }
    }
  });
}

function actionButton(
  className: string,
  label: string,
  icon: SVGSVGElement,
  onClick: () => void
): HTMLButtonElement {
  return el<HTMLButtonElement>(
    <button
      type="button"
      class={className}
      title={label}
      aria-label={label}
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {icon}
    </button>
  );
}
