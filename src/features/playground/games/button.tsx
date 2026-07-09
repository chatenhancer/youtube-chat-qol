/**
 * Games header button.
 *
 * Wires the compact Games entry point into YouTube's live chat header and keeps
 * it ordered next to the Inbox button without hardcoding Inbox's class names.
 */
import { createGamesIcon } from '../../../shared/icons';
import { t } from '../../../shared/i18n';
import { jsx, el } from '../../../shared/jsx-dom';
import { CHAT_HEADER_SELECTOR } from '../../../youtube/selectors';
import { formatBadgeCount } from '../../inbox/icons';
import { INBOX_BUTTON_CLASS, INBOX_BUTTON_SELECTOR } from '../../inbox/selectors';

export interface GamesButtonBadgeState {
  activeGames: number;
  invites: number;
}

export function findGamesHeader(): HTMLElement | null {
  return document.querySelector<HTMLElement>(CHAT_HEADER_SELECTOR);
}

export function shouldWireGamesButton(
  addedElements: Element[],
  mutations: MutationRecord[]
): boolean {
  return (
    mutations.some((mutation) => {
      return (
        mutation.type === 'childList' &&
        mutation.target instanceof Element &&
        mutation.target.closest(CHAT_HEADER_SELECTOR)
      );
    }) ||
    addedElements.some((element) => {
      return (
        element.matches(CHAT_HEADER_SELECTOR) ||
        Boolean(element.querySelector(CHAT_HEADER_SELECTOR))
      );
    })
  );
}

export function createGamesButton(
  ownerId: string,
  onClick: (anchor: HTMLElement) => void
): HTMLButtonElement {
  const handleClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget instanceof HTMLElement) onClick(event.currentTarget);
  };
  const button = el<HTMLButtonElement>(
    <button
      type="button"
      class="ytcq-games-button"
      data-ytcq-games-owner={ownerId}
      title={t('games')}
      aria-haspopup="dialog"
      aria-expanded="false"
      aria-label={t('games')}
      onClickCapture={handleClick}
    >
      {createGamesIcon()}
      <span class="ytcq-games-badge" hidden />
    </button>
  );
  return button;
}

export function updateGamesButtonStatus(
  button: HTMLButtonElement,
  state: GamesButtonBadgeState
): void {
  const invites = getPositiveCount(state.invites);
  const activeGames = getPositiveCount(state.activeGames);
  const displayCount = invites || activeGames;
  const hasInvites = invites > 0;
  const hasActiveGames = !hasInvites && activeGames > 0;
  const ariaLabel = getGamesAriaLabel({ activeGames, invites });
  const badge = button.querySelector<HTMLElement>('.ytcq-games-badge');

  if (button.getAttribute('aria-label') !== ariaLabel) {
    button.setAttribute('aria-label', ariaLabel);
  }
  button.classList.toggle('ytcq-games-button-has-invites', hasInvites);
  button.classList.toggle('ytcq-games-button-has-active-games', hasActiveGames);

  if (!badge) return;
  badge.classList.toggle('ytcq-games-badge-invites', hasInvites);
  badge.classList.toggle('ytcq-games-badge-active', hasActiveGames);
  badge.hidden = displayCount === 0;
  badge.textContent = displayCount ? formatBadgeCount(displayCount) : '';
}

export function getGamesHeaderAnchor(header: HTMLElement): HTMLElement | null {
  return (
    header.querySelector<HTMLElement>(INBOX_BUTTON_SELECTOR) ||
    header.querySelector<HTMLElement>('#live-chat-header-context-menu') ||
    getDirectHeaderChild(
      header,
      header.querySelector<HTMLElement>('button[aria-label="More options"]')
    ) ||
    getDirectHeaderChild(
      header,
      header.querySelector<HTMLElement>('button[title="More options"]')
    ) ||
    header.querySelector<HTMLElement>('#close-button')
  );
}

export function moveGamesButton(
  button: HTMLButtonElement,
  header: HTMLElement,
  anchor: HTMLElement | null
): void {
  if (anchor?.classList.contains(INBOX_BUTTON_CLASS)) {
    if (button.nextElementSibling !== anchor) anchor.before(button);
    return;
  }

  if (anchor && anchor !== button && button.nextElementSibling !== anchor) {
    anchor.before(button);
  } else if (!anchor && button.parentElement !== header) {
    header.append(button);
  }
}

export function setGamesButtonExpanded(
  anchor: HTMLElement | null | undefined,
  expanded: boolean
): void {
  if (anchor instanceof HTMLButtonElement && anchor.classList.contains('ytcq-games-button')) {
    anchor.setAttribute('aria-expanded', String(expanded));
  }
}

function getPositiveCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function getGamesAriaLabel(state: GamesButtonBadgeState): string {
  if (state.invites > 0)
    return `${t('games')}: ${t('gamesInvites')} ${formatBadgeCount(state.invites)}`;
  if (state.activeGames > 0)
    return `${t('games')}: ${t('gamesActiveGame')} ${formatBadgeCount(state.activeGames)}`;
  return t('games');
}

export function positionGamesCard(card: HTMLElement, anchor?: HTMLElement): void {
  const margin = 8;
  const cardRect = card.getBoundingClientRect();
  const width = cardRect.width;
  const height = cardRect.height;
  const anchorRect = anchor?.isConnected
    ? anchor.getBoundingClientRect()
    : {
        left: window.innerWidth - margin,
        right: window.innerWidth - margin,
        top: margin,
        bottom: margin
      };

  let left = anchorRect.right - width;
  if (left < margin) {
    left = anchorRect.left;
  }
  if (left + width + margin > window.innerWidth) {
    left = window.innerWidth - width - margin;
  }

  let top = anchorRect.bottom + margin;
  if (top + height + margin > window.innerHeight) {
    top = anchorRect.top - height - margin;
  }

  card.style.left = `${Math.max(margin, Math.round(left))}px`;
  card.style.top = `${Math.max(margin, Math.round(top))}px`;
}

function getDirectHeaderChild(
  header: HTMLElement,
  element: HTMLElement | null
): HTMLElement | null {
  if (!element) return null;

  let current: HTMLElement | null = element;
  while (current && current.parentElement !== header) {
    current = current.parentElement;
  }

  return current;
}
