/**
 * Games panel shell.
 *
 * Creates the shared floating panel chrome for the Games lobby and owns the
 * document listeners that close or reposition that panel.
 */
import { createCloseIcon, createGamesIcon } from '../../../shared/icons';
import { t } from '../../../shared/i18n';
import { ytcqCreateElement } from '../../../shared/managed-dom';
import { positionGamesCard } from './button';

export interface GamesCardElements {
  body: HTMLElement;
  card: HTMLElement;
}

export interface GamesCardListenerOptions {
  getAnchor: () => HTMLElement | null;
  getCard: () => HTMLElement | null;
  onClose: () => void;
}

export function createGamesCard(onClose: () => void): GamesCardElements {
  const card = ytcqCreateElement('section');
  card.className = 'ytcq-profile-card ytcq-games-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', t('games'));

  const header = ytcqCreateElement('div');
  header.className = 'ytcq-profile-card-header ytcq-games-card-header';

  const icon = ytcqCreateElement('span');
  icon.className = 'ytcq-games-card-icon';
  icon.append(createGamesIcon());

  const titleWrap = ytcqCreateElement('div');
  titleWrap.className = 'ytcq-profile-card-title-wrap';

  const titleRow = ytcqCreateElement('div');
  titleRow.className = 'ytcq-games-title-row';

  const title = ytcqCreateElement('div');
  title.className = 'ytcq-profile-card-title';
  title.textContent = t('games');

  const betaBadge = ytcqCreateElement('span');
  betaBadge.className = 'ytcq-games-beta-badge';
  betaBadge.textContent = 'Beta';

  const subtitle = ytcqCreateElement('div');
  subtitle.className = 'ytcq-profile-card-subtitle';
  subtitle.textContent = t('playground');

  titleRow.append(title, betaBadge);
  titleWrap.append(titleRow, subtitle);
  header.append(icon, titleWrap, createGamesCardCloseButton(onClose));

  const body = ytcqCreateElement('div');
  body.className = 'ytcq-profile-card-messages ytcq-games-card-body';

  card.append(header, body);
  return { body, card };
}

export function installGamesCardListeners({
  getAnchor,
  getCard,
  onClose
}: GamesCardListenerOptions): () => void {
  const handleOutsideClick = (event: MouseEvent): void => {
    if (getCard()?.contains(event.target as Node)) return;
    if ((event.target as Element | null)?.closest?.('.ytcq-games-button')) return;
    if ((event.target as Element | null)?.closest?.('.ytcq-game-panel')) return;
    onClose();
  };
  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') onClose();
  };
  const handleResize = (): void => {
    const card = getCard();
    if (!card) return;
    positionGamesCard(card, getAnchor() || undefined);
  };
  const cardListeners = new AbortController();

  window.setTimeout(() => {
    const options = { capture: true, signal: cardListeners.signal };
    document.addEventListener('click', handleOutsideClick, options);
    document.addEventListener('keydown', handleKeydown, options);
    window.addEventListener('resize', handleResize, options);
  }, 0);

  return () => cardListeners.abort();
}

function createGamesCardCloseButton(onClose: () => void): HTMLButtonElement {
  const closeButton = ytcqCreateElement('button');
  closeButton.type = 'button';
  closeButton.className = 'ytcq-profile-card-header-button ytcq-profile-card-close';
  closeButton.setAttribute('aria-label', t('close'));
  closeButton.append(createCloseIcon());
  closeButton.addEventListener('click', onClose);
  return closeButton;
}
