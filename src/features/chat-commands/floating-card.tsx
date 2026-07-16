/**
 * Input-adjacent floating card helpers.
 *
 * Shared positioning and close-button utilities for command UI that should sit
 * near the YouTube chat input without resizing chat.
 */
import { t } from '../../shared/i18n';
import { createCloseIcon } from '../../shared/icons';
import { jsx, el } from '../../shared/jsx-dom';
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
  return el<HTMLButtonElement>(
    <button type="button" class="ytcq-command-help-close" aria-label={t('close')} onClick={onClick}>
      {createCloseIcon()}
    </button>
  );
}
