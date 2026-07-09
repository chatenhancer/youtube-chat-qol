/**
 * Bounty Hunting round-start cutoff and visual divider placement.
 */
import { t } from '../../../../shared/i18n';
import { jsx, el } from '../../../../shared/jsx-dom';
import { getBountyHuntingRoundStartTimestampUsec } from '../../../../shared/playground/bounty-hunting';
import { getMessageStableId } from '../../../../youtube/messages';
import { CHAT_MESSAGE_SELECTOR } from '../../../../youtube/selectors';
import {
  compareBountyHuntingTimestampUsec,
  getBountyHuntingMessageTimestampUsec,
  rememberBountyHuntingCachedMessageData
} from './message-timestamps';
import type { BountyHuntingPanelRuntime } from './types';

type BountyHuntingStartDividerPlacement = 'after' | 'before';

const BOUNTY_HUNTING_START_DIVIDER_CLASS = 'ytcq-bounty-hunting-start-divider';
const BOUNTY_HUNTING_START_DIVIDER_HOST_CLASS = 'ytcq-bounty-hunting-start-divider-host';
const BOUNTY_HUNTING_START_DIVIDER_HOST_BEFORE_CLASS =
  'ytcq-bounty-hunting-start-divider-host-before';
const BOUNTY_HUNTING_START_DIVIDER_HOST_AFTER_CLASS =
  'ytcq-bounty-hunting-start-divider-host-after';

export function sendBountyHuntingStartRound(runtime: BountyHuntingPanelRuntime): void {
  runtime.game = {
    ...runtime.game,
    roundStartTimestampUsec: getBountyHuntingRoundStartTimestampUsec(runtime.game.phaseStartedAt)
  };
  ensureBountyHuntingRoundStartDivider(runtime);
  runtime.onAction(runtime.game.gameId, 'startRound');
}

export function ensureBountyHuntingRoundStartDivider(runtime: BountyHuntingPanelRuntime): void {
  if (!hasBountyHuntingRoundStartBoundary(runtime)) return;
  placeBountyHuntingRoundStartDivider(runtime);
}

export function hasBountyHuntingRoundStartBoundary(runtime: BountyHuntingPanelRuntime): boolean {
  return /^\d{1,24}$/.test(runtime.game.roundStartTimestampUsec || '');
}

export function isBountyHuntingMessageEligibleForRound(
  runtime: BountyHuntingPanelRuntime,
  message: HTMLElement
): boolean {
  if (!hasBountyHuntingRoundStartBoundary(runtime)) return true;
  rememberBountyHuntingCachedMessageData(runtime, message);
  const messageId = getMessageStableId(message);
  const timestampEligibility = getBountyHuntingTimestampEligibility(runtime, messageId);
  return timestampEligibility === true;
}

export function removeBountyHuntingRoundStartDivider(runtime: BountyHuntingPanelRuntime): void {
  runtime.roundStartDivider?.remove();
  runtime.roundStartDivider = null;
  restoreBountyHuntingRoundStartDividerHost(runtime);
}

function placeBountyHuntingRoundStartDivider(runtime: BountyHuntingPanelRuntime): void {
  const divider = getBountyHuntingRoundStartDivider(runtime);
  const placement = findBountyHuntingRoundStartPlacement(runtime);
  const host = getBountyHuntingRoundStartDividerHost(placement);
  if (!host) {
    divider.remove();
    restoreBountyHuntingRoundStartDividerHost(runtime);
    return;
  }
  prepareBountyHuntingRoundStartDividerHost(runtime, host.element, host.placement);
  if (divider.parentElement !== host.element) host.element.append(divider);
  positionBountyHuntingRoundStartDivider(divider, host.placement);
}

function findBountyHuntingRoundStartPlacement(runtime: BountyHuntingPanelRuntime): {
  anchor: HTMLElement | null;
  firstAfter: HTMLElement | null;
} {
  let anchor: HTMLElement | null = null;
  let firstAfter: HTMLElement | null = null;
  for (const message of getBountyHuntingChatMessages()) {
    rememberBountyHuntingCachedMessageData(runtime, message);
    const eligibility = getBountyHuntingMessageEligibility(runtime, message);
    if (eligibility === null) continue;
    if (!eligibility) {
      anchor = message;
      firstAfter = null;
    } else if (!firstAfter) {
      firstAfter = message;
    }
  }

  return {
    anchor,
    firstAfter
  };
}

function getBountyHuntingRoundStartDivider(runtime: BountyHuntingPanelRuntime): HTMLElement {
  if (runtime.roundStartDivider) return runtime.roundStartDivider;
  const divider = el<HTMLDivElement>(
    <div class={BOUNTY_HUNTING_START_DIVIDER_CLASS} role="separator">
      {t('gamesBountyHuntingStartsHere')}
    </div>
  );
  runtime.roundStartDivider = divider;
  return divider;
}

function getBountyHuntingMessageEligibility(
  runtime: BountyHuntingPanelRuntime,
  message: HTMLElement
): boolean | null {
  const messageId = getMessageStableId(message);
  return messageId ? getBountyHuntingTimestampEligibility(runtime, messageId) : null;
}

function getBountyHuntingTimestampEligibility(
  runtime: BountyHuntingPanelRuntime,
  messageId: string
): boolean | null {
  const cutoff = runtime.game.roundStartTimestampUsec;
  const timestampUsec = messageId ? getBountyHuntingMessageTimestampUsec(runtime, messageId) : '';
  if (!cutoff || !/^\d{1,24}$/.test(cutoff)) return null;
  if (!timestampUsec) return null;
  return compareBountyHuntingTimestampUsec(timestampUsec, cutoff) > 0;
}

function getBountyHuntingChatMessages(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR)).filter(
    (message) => !message.id.startsWith('local:')
  );
}

function getBountyHuntingRoundStartDividerHost(placement: {
  anchor: HTMLElement | null;
  firstAfter: HTMLElement | null;
}): { element: HTMLElement; placement: BountyHuntingStartDividerPlacement } | null {
  if (placement.firstAfter?.isConnected) {
    return {
      element: placement.firstAfter,
      placement: 'before'
    };
  }
  if (placement.anchor?.isConnected) {
    return {
      element: placement.anchor,
      placement: 'after'
    };
  }
  return null;
}

function positionBountyHuntingRoundStartDivider(
  divider: HTMLElement,
  dividerPlacement: BountyHuntingStartDividerPlacement
): void {
  divider.dataset.ytcqPlacement = dividerPlacement;
  divider.hidden = false;
  divider.style.left = '';
  divider.style.right = '';
  divider.style.top = '';
}

function prepareBountyHuntingRoundStartDividerHost(
  runtime: BountyHuntingPanelRuntime,
  host: HTMLElement,
  placement: BountyHuntingStartDividerPlacement
): void {
  if (runtime.roundStartDividerHost !== host) {
    restoreBountyHuntingRoundStartDividerHost(runtime);
    runtime.roundStartDividerHost = host;
  }
  host.classList.add(BOUNTY_HUNTING_START_DIVIDER_HOST_CLASS);
  host.classList.toggle(BOUNTY_HUNTING_START_DIVIDER_HOST_BEFORE_CLASS, placement === 'before');
  host.classList.toggle(BOUNTY_HUNTING_START_DIVIDER_HOST_AFTER_CLASS, placement === 'after');
}

function restoreBountyHuntingRoundStartDividerHost(runtime: BountyHuntingPanelRuntime): void {
  const host = runtime.roundStartDividerHost;
  if (host) {
    host.classList.remove(
      BOUNTY_HUNTING_START_DIVIDER_HOST_CLASS,
      BOUNTY_HUNTING_START_DIVIDER_HOST_BEFORE_CLASS,
      BOUNTY_HUNTING_START_DIVIDER_HOST_AFTER_CLASS
    );
  }
  runtime.roundStartDividerHost = null;
}
