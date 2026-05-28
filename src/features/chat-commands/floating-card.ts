import { t } from '../../shared/i18n';
import { createCloseIcon } from '../../shared/icons';
import { findChatInput } from '../../youtube/chat-input';

export function positionFloatingCardAboveInput(card: HTMLElement): void {
  const input = findChatInput();
  const inputRect = input?.getBoundingClientRect();
  const margin = 8;
  const cardRect = card.getBoundingClientRect();
  const width = cardRect.width;
  const height = cardRect.height;
  const fallbackLeft = window.innerWidth - width - margin;
  const fallbackTop = window.innerHeight - height - margin;
  const preferredLeft = inputRect ? inputRect.left : fallbackLeft;
  const preferredTop = inputRect ? inputRect.top - height - margin : fallbackTop;
  const maxLeft = window.innerWidth - width - margin;
  const maxTop = window.innerHeight - height - margin;

  card.style.left = `${Math.max(margin, Math.min(Math.round(preferredLeft), maxLeft))}px`;
  card.style.top = `${Math.max(margin, Math.min(Math.round(preferredTop), maxTop))}px`;
}

export function createFloatingCardCloseButton(onClick: () => void): HTMLButtonElement {
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'ytcq-command-help-close';
  closeButton.setAttribute('aria-label', t('close'));
  closeButton.append(createCloseIcon());
  closeButton.addEventListener('click', onClick);
  return closeButton;
}
