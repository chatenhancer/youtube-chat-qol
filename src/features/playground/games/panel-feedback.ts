/**
 * Shared game panel feedback surfaces.
 *
 * Provides two reusable layers for game panels: centered state screens over the
 * game board, and short floating bubbles positioned at the user's click.
 */
import { ytcqCreateElement } from '../../../shared/managed-dom';

export interface GamePanelStatusOverlay {
  clear: (options?: { resetKey?: boolean }) => void;
  element: HTMLElement;
  show: (message: GamePanelStatusMessage) => void;
}

export interface GamePanelStatusMessage {
  key: string;
  message: string;
  temporary: boolean;
  timeoutMs?: number;
}

export function createGamePanelStatusOverlay({
  classNamePrefix
}: {
  classNamePrefix: string;
}): GamePanelStatusOverlay {
  let statusMessageKey: string | null = null;
  let statusMessageTimeout: number | null = null;

  const element = ytcqCreateElement('div');
  element.className = `ytcq-game-status ${classNamePrefix}-status`;
  element.hidden = true;
  element.setAttribute('aria-live', 'polite');

  const clear = ({ resetKey = false }: { resetKey?: boolean } = {}): void => {
    if (statusMessageTimeout !== null) {
      window.clearTimeout(statusMessageTimeout);
      statusMessageTimeout = null;
    }
    element.hidden = true;
    element.textContent = '';
    delete element.dataset.temporary;
    if (resetKey) statusMessageKey = null;
  };

  return {
    clear,
    element,
    show: ({ key, message, temporary, timeoutMs = 1500 }) => {
      if (statusMessageKey === key) return;

      clear();
      statusMessageKey = key;
      element.textContent = message;
      element.dataset.temporary = temporary ? 'true' : 'false';
      element.hidden = false;

      if (temporary) {
        statusMessageTimeout = window.setTimeout(() => {
          clear();
        }, timeoutMs);
      }
    }
  };
}

export function showGamePanelFeedbackBubble({
  className,
  event,
  message,
  timeoutMs = 1300
}: {
  className: string;
  event: MouseEvent;
  message: string;
  timeoutMs?: number;
}): void {
  const bubble = ytcqCreateElement('div');
  bubble.className = `ytcq-game-feedback-message ${className}`;
  bubble.textContent = message;
  bubble.style.visibility = 'hidden';
  document.body.append(bubble);
  positionGamePanelFeedbackBubble(bubble, event);
  bubble.style.visibility = '';

  const removeBubble = (): void => bubble.remove();
  bubble.addEventListener('animationend', removeBubble, { once: true });
  window.setTimeout(removeBubble, timeoutMs);
}

function positionGamePanelFeedbackBubble(bubble: HTMLElement, event: MouseEvent): void {
  bubble.style.left = `${Math.round(event.clientX)}px`;
  bubble.style.top = `${Math.round(event.clientY)}px`;
}
