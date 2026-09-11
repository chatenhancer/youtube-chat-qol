/** Dedicated entry point for stream-time Chat Enhancer controls. */
import { registerFeature } from '../../content/dispatcher';
import { t } from '../../shared/i18n';
import { createChatEnhancerIcon } from '../../shared/icons';
import { el, jsx } from '../../shared/jsx-dom';
import { CHAT_HEADER_SELECTOR } from '../../youtube/selectors';
import { closeMenu } from './common';
import { cleanupStaleSettingsMenuSurfaces, createSettingsMenuItems } from './settings-menu';
import { createSettingsPopup, handleSettingsMenuKeyDown } from './settings-popup';

let button: HTMLButtonElement | null = null;
let menu: HTMLDivElement | null = null;
let listeners: AbortController | null = null;
let wireFrame = 0;

registerFeature({
  page: {
    boot: wireSettingsButton,
    cleanup: cleanupSettingsButton,
    reset: closeSettingsPopup,
    optionsChanged: positionSettingsPopup
  },
  mutation: ({ addedElements, mutations }) => {
    if (button && !button.isConnected) closeSettingsPopup();
    if (wireFrame) return;
    const headerChanged =
      addedElements.some(
        (element) =>
          element.matches(CHAT_HEADER_SELECTOR) || element.querySelector(CHAT_HEADER_SELECTOR)
      ) ||
      mutations.some(
        (mutation) =>
          mutation.type === 'childList' &&
          mutation.target instanceof Element &&
          mutation.target.closest(CHAT_HEADER_SELECTOR)
      );
    if (headerChanged)
      wireFrame = window.requestAnimationFrame(() => {
        wireFrame = 0;
        wireSettingsButton();
      });
  }
});

export function wireSettingsButton(): void {
  const header = document.querySelector<HTMLElement>(CHAT_HEADER_SELECTOR);
  if (!header) return;
  if (!button || !header.contains(button)) {
    closeSettingsPopup();
    button?.remove();
    header.querySelectorAll('.ytcq-settings-button').forEach((stale) => stale.remove());
    button = el<HTMLButtonElement>(
      <button
        type="button"
        class="ytcq-settings-button"
        title={t('chatEnhancer')}
        aria-label={t('chatEnhancer')}
        aria-haspopup="menu"
        aria-expanded="false"
        onClick={(event: MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          if (menu) closeSettingsPopup(true);
          else openSettingsPopup();
        }}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          event.stopPropagation();
          openSettingsPopup(event.key === 'ArrowUp');
        }}
      >
        {createChatEnhancerIcon()}
      </button>
    );
  }
  // Keep the extension buttons together; Inbox and Games retain their order.
  const anchor = header.querySelector(
    '.ytcq-games-button, .ytcq-inbox-button, #live-chat-header-context-menu, #close-button'
  );
  if (anchor) {
    if (button.nextElementSibling !== anchor) anchor.before(button);
  } else if (button.parentElement !== header) header.append(button);
}

function openSettingsPopup(focusLast = false): void {
  if (!button?.isConnected) return;
  closeSettingsPopup();
  closeMenu();
  menu = createSettingsPopup(createSettingsMenuItems(() => closeSettingsPopup(true)));
  menu.id = 'ytcq-settings-menu';
  document.body.append(menu);
  button.setAttribute('aria-controls', menu.id);
  button.setAttribute('aria-expanded', 'true');
  positionSettingsPopup();
  const rows = menu.querySelectorAll<HTMLElement>('.ytcq-settings-item');
  rows[focusLast ? rows.length - 1 : 0]?.focus();

  listeners = new AbortController();
  const options = { capture: true, signal: listeners.signal };
  const dismissOutside = (event: Event): void => {
    if (
      event.target instanceof Node &&
      !menu?.contains(event.target) &&
      !button?.contains(event.target)
    ) {
      closeSettingsPopup();
    }
  };
  document.addEventListener('pointerdown', dismissOutside, options);
  document.addEventListener('click', dismissOutside, options);
  document.addEventListener('focusin', dismissOutside, options);
  document.addEventListener('contextmenu', dismissOutside, options);
  window.addEventListener(
    'keydown',
    (event) => {
      if (menu) handleSettingsMenuKeyDown(event, menu, () => closeSettingsPopup(true));
    },
    options
  );
  window.addEventListener('resize', positionSettingsPopup, options);
}

function closeSettingsPopup(restoreFocus = false): void {
  listeners?.abort();
  listeners = null;
  menu?.remove();
  menu = null;
  button?.setAttribute('aria-expanded', 'false');
  button?.removeAttribute('aria-controls');
  if (restoreFocus && button?.isConnected) button.focus();
}

function positionSettingsPopup(): void {
  if (!menu || !button?.isConnected) return;
  const anchor = button.getBoundingClientRect();
  const { width, height } = menu.getBoundingClientRect();
  const margin = 8;
  const preferredLeft =
    getComputedStyle(button).direction === 'rtl' ? anchor.left : anchor.right - width;
  const left = Math.min(
    Math.max(margin, preferredLeft),
    Math.max(margin, window.innerWidth - width - margin)
  );
  const top = Math.min(anchor.bottom + 4, Math.max(margin, window.innerHeight - height - margin));
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

export function cleanupSettingsButton(): void {
  window.cancelAnimationFrame(wireFrame);
  wireFrame = 0;
  closeSettingsPopup();
  button = null;
  document
    .querySelectorAll('.ytcq-settings-button, .ytcq-settings-menu')
    .forEach((element) => element.remove());
  cleanupStaleSettingsMenuSurfaces();
}
