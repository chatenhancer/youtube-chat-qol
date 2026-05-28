import { t } from '../../shared/i18n';
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

export function createCloseIcon(): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('focusable', 'false');
  icon.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4Z');
  icon.append(path);

  return icon;
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
