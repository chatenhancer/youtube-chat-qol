/** Cursor-following feedback for a missed Bounty Hunting claim. */
import { createSvgIcon, MATERIAL_ICON_VIEW_BOX } from '../../../../shared/icons';
import { t } from '../../../../shared/i18n';
import { jsx, el } from '../../../../shared/jsx-dom';

const CURSOR_GAP_PX = 12;
const VIEWPORT_EDGE_PX = 8;
const RELOADING_CLASS = 'ytcq-bounty-hunting-reloading';
const RELOAD_PROGRESS_CLASS = 'ytcq-bounty-hunting-reload-progress';
// Google Material Symbols "explosion" icon (Apache-2.0).
const MISS_IMPACT_ICON_PATH =
  'm480-281 59-59h81v-81l59-59-59-59v-81h-81l-59-59-59 59h-81v81l-59 59 59 59v81h81l59 59Zm0 253L346-160H160v-186L28-480l132-134v-186h186l134-132 134 132h186v186l132 134-132 134v186H614L480-28Zm0-112 100-100h140v-140l100-100-100-100v-140H580L480-820 380-720H240v140L140-480l100 100v140h140l100 100Zm0-340Z';

export interface BountyHuntingMissFeedback {
  clear(): void;
  destroy(): void;
  isActive(): boolean;
  move(clientX: number, clientY: number): void;
  syncUntil(cooldownUntil: number, position?: BountyHuntingMissFeedbackPosition): void;
}

interface BountyHuntingMissFeedbackPosition {
  clientX: number;
  clientY: number;
}

export function createBountyHuntingMissFeedback(signal?: AbortSignal): BountyHuntingMissFeedback {
  document.documentElement.classList.remove(RELOADING_CLASS);
  const missIcon = createSvgIcon(MATERIAL_ICON_VIEW_BOX, MISS_IMPACT_ICON_PATH);
  missIcon.classList.add('ytcq-bounty-hunting-miss-icon');
  const element = el<HTMLDivElement>(
    <div
      class="ytcq-bounty-hunting-miss-feedback"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      hidden
    >
      {missIcon}
      <span class="ytcq-bounty-hunting-miss-copy"></span>
    </div>
  );
  document.body.append(element);
  const copy = element.querySelector<HTMLElement>('.ytcq-bounty-hunting-miss-copy')!;
  const listeners = new AbortController();
  if (signal?.aborted) listeners.abort();
  else signal?.addEventListener('abort', () => listeners.abort(), { once: true });

  let cooldownUntil = 0;
  let cooldownTimer: number | null = null;
  let pointerInside = false;

  function clearTimer(): void {
    if (cooldownTimer !== null) window.clearTimeout(cooldownTimer);
    cooldownTimer = null;
  }

  function clear(): void {
    clearTimer();
    cooldownUntil = 0;
    document.documentElement.classList.remove(RELOADING_CLASS);
    element.classList.remove(RELOAD_PROGRESS_CLASS);
    element.hidden = true;
    copy.textContent = '';
  }

  function isActive(): boolean {
    if (!cooldownUntil) return false;
    if (Date.now() < cooldownUntil) return true;
    clear();
    return false;
  }

  function move(clientX: number, clientY: number): void {
    pointerInside = true;
    if (!isActive()) return;
    element.hidden = false;
    positionBountyHuntingMissFeedback(element, clientX, clientY);
  }

  function syncUntil(
    nextCooldownUntil: number,
    position?: BountyHuntingMissFeedbackPosition
  ): void {
    const remainingMs = Math.max(0, nextCooldownUntil - Date.now());
    if (!Number.isFinite(nextCooldownUntil) || !remainingMs) {
      clear();
      return;
    }

    const restartProgress =
      cooldownUntil !== nextCooldownUntil || !element.classList.contains(RELOAD_PROGRESS_CLASS);
    clearTimer();
    cooldownUntil = nextCooldownUntil;
    document.documentElement.classList.add(RELOADING_CLASS);
    if (restartProgress) {
      element.style.setProperty('--ytcq-bounty-hunting-reload-duration', `${remainingMs}ms`);
      element.classList.remove(RELOAD_PROGRESS_CLASS);
      void element.offsetWidth;
      element.classList.add(RELOAD_PROGRESS_CLASS);
    }
    copy.textContent = t('gamesBountyHuntingMissReloading');
    cooldownTimer = window.setTimeout(clear, remainingMs);
    if (position && pointerInside) {
      element.hidden = false;
      positionBountyHuntingMissFeedback(element, position.clientX, position.clientY);
    }
  }

  document.addEventListener('mousemove', (event) => move(event.clientX, event.clientY), {
    signal: listeners.signal
  });
  document.documentElement.addEventListener(
    'mouseenter',
    (event) => move(event.clientX, event.clientY),
    { signal: listeners.signal }
  );
  document.documentElement.addEventListener(
    'mouseleave',
    () => {
      pointerInside = false;
      element.hidden = true;
    },
    { signal: listeners.signal }
  );

  return {
    clear,
    destroy: () => {
      listeners.abort();
      clear();
      element.remove();
    },
    isActive,
    move,
    syncUntil
  };
}

function positionBountyHuntingMissFeedback(
  element: HTMLElement,
  clientX: number,
  clientY: number
): void {
  const maxLeft = Math.max(
    VIEWPORT_EDGE_PX,
    window.innerWidth - element.offsetWidth - VIEWPORT_EDGE_PX
  );
  const maxTop = Math.max(
    VIEWPORT_EDGE_PX,
    window.innerHeight - element.offsetHeight - VIEWPORT_EDGE_PX
  );
  const preferredLeft = clientX + CURSOR_GAP_PX;
  const preferredTop = clientY - element.offsetHeight / 2;
  const left =
    preferredLeft <= maxLeft ? preferredLeft : clientX - element.offsetWidth - CURSOR_GAP_PX;
  const top =
    preferredTop <= maxTop ? preferredTop : clientY - element.offsetHeight - CURSOR_GAP_PX;

  element.style.left = `${Math.min(maxLeft, Math.max(VIEWPORT_EDGE_PX, left))}px`;
  element.style.top = `${Math.min(maxTop, Math.max(VIEWPORT_EDGE_PX, top))}px`;
}
