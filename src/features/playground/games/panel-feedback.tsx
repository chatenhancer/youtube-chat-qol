/**
 * Shared game panel feedback surfaces.
 *
 * Provides two reusable layers for game panels: centered state screens over the
 * game board, and short floating bubbles positioned at the user's click.
 */
import { jsx, el } from '../../../shared/jsx-dom';

export type GamePanelOverlayOwner = 'game' | 'system';

export interface GamePanelOverlay {
  clear: (options?: { owner?: GamePanelOverlayOwner; resetKey?: boolean }) => void;
  element: HTMLElement;
  has: (options: { keyPrefix?: string; owner: GamePanelOverlayOwner }) => boolean;
  isBlocking: () => boolean;
  show: (message: GamePanelOverlayMessage) => void;
}

export interface GamePanelOverlayMessage {
  key: string;
  message: string;
  owner: GamePanelOverlayOwner;
  temporary: boolean;
  timeoutMs?: number;
}

export function createGamePanelStatusOverlay({
  classNamePrefix
}: {
  classNamePrefix: string;
}): GamePanelOverlay {
  const messages = new Map<GamePanelOverlayOwner, GamePanelOverlayMessage>();
  let statusMessageKey: string | null = null;
  let statusMessageTimeout: number | null = null;

  const element = el<HTMLDivElement>(
    <div class={`ytcq-game-status ${classNamePrefix}-status`} hidden aria-live="polite" />
  );

  const getVisibleMessage = (): GamePanelOverlayMessage | null => {
    return messages.get('system') || messages.get('game') || null;
  };

  const clearTimer = (): void => {
    if (statusMessageTimeout !== null) {
      window.clearTimeout(statusMessageTimeout);
      statusMessageTimeout = null;
    }
  };

  const render = (): void => {
    const message = getVisibleMessage();
    const nextKey = message ? `${message.owner}:${message.key}` : '';
    if (statusMessageKey === nextKey) {
      if (message && element.textContent !== message.message) {
        element.textContent = message.message;
      }
      return;
    }

    clearTimer();
    statusMessageKey = nextKey;
    if (!message) {
      element.hidden = true;
      element.textContent = '';
      delete element.dataset.owner;
      delete element.dataset.temporary;
      return;
    }

    element.textContent = message.message;
    element.dataset.owner = message.owner;
    element.dataset.temporary = message.temporary ? 'true' : 'false';
    element.hidden = false;

    if (message.temporary) {
      statusMessageTimeout = window.setTimeout(() => {
        messages.delete(message.owner);
        statusMessageKey = null;
        render();
      }, message.timeoutMs || 1500);
    }
  };

  const clear = ({
    owner
  }: {
    owner?: GamePanelOverlayOwner;
    resetKey?: boolean;
  } = {}): void => {
    if (owner) {
      messages.delete(owner);
    } else {
      messages.clear();
    }
    if (owner && getVisibleMessage()) {
      render();
      return;
    }
    if (!getVisibleMessage()) {
      clearTimer();
      statusMessageKey = null;
    }
    render();
  };

  return {
    clear,
    element,
    has: ({ keyPrefix, owner }) => {
      const message = messages.get(owner);
      return Boolean(message && (!keyPrefix || message.key.startsWith(keyPrefix)));
    },
    isBlocking: () => {
      const message = getVisibleMessage();
      return Boolean(message && !message.temporary);
    },
    show: (message) => {
      messages.set(message.owner, message);
      render();
    }
  };
}

export type GamePanelStatusOverlay = GamePanelOverlay;

export type GamePanelStatusMessage = Omit<GamePanelOverlayMessage, 'owner'>;

export function toGamePanelStatusMessage(message: GamePanelStatusMessage): GamePanelOverlayMessage {
  return {
    ...message,
    owner: 'game'
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
  const bubble = el<HTMLDivElement>(
    <div class={`ytcq-game-feedback-message ${className}`}>{message}</div>
  );
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
