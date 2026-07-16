/**
 * Games panel shell.
 *
 * Creates the shared floating panel chrome for the Games lobby and owns the
 * document listeners that close or reposition that panel.
 */
import { createCloseIcon, createGamesIcon } from '../../../shared/icons';
import { t } from '../../../shared/i18n';
import { jsx, el } from '../../../shared/jsx-dom';
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
  let body!: HTMLDivElement;
  const card = el<HTMLElement>(
    <section class="ytcq-profile-card ytcq-games-card" role="dialog" aria-label={t('games')}>
      <div class="ytcq-profile-card-header ytcq-games-card-header">
        <span class="ytcq-games-card-icon">{createGamesIcon()}</span>
        <div class="ytcq-profile-card-title-wrap">
          <div class="ytcq-games-title-row">
            <div class="ytcq-profile-card-title">{t('games')}</div>
          </div>
          <div class="ytcq-profile-card-subtitle">{t('playground')}</div>
        </div>
        {createGamesCardCloseButton(onClose)}
      </div>
      <div
        ref={(element: HTMLDivElement) => (body = element)}
        class="ytcq-profile-card-messages ytcq-games-card-body"
      />
    </section>
  );
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
  const closeButton = el<HTMLButtonElement>(
    <button
      type="button"
      class="ytcq-profile-card-header-button ytcq-profile-card-close"
      aria-label={t('close')}
      onClick={onClose}
    >
      {createCloseIcon()}
    </button>
  );
  return closeButton;
}
