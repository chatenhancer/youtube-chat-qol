/** Pending and completed Bounty Hunting badges attached to chat messages. */
import { t } from '../../../../shared/i18n';
import { jsx, el } from '../../../../shared/jsx-dom';
import { getPlaygroundAvatarPresentation } from '../../../../shared/playground/identity';
import type {
  BountyHuntingClaim,
  PublicBountyHuntingBounty
} from '../../../../shared/playground/bounty-hunting';
import { getMessageStableId } from '../../../../youtube/messages';
import { CHAT_MESSAGE_SELECTOR } from '../../../../youtube/selectors';
import type { PublicBountyHuntingGame } from './types';

const INDICATOR_CLASS = 'ytcq-bounty-hunting-claim-indicator';
const INDICATOR_AVATAR_CLASS = 'ytcq-bounty-hunting-claim-indicator-avatar';
const INDICATOR_AMOUNT_CLASS = 'ytcq-bounty-hunting-claim-indicator-amount';
const PENDING_KEY_PREFIX = 'pending:';

export const BOUNTY_HUNTING_MESSAGE_INDICATOR_SELECTOR = `.${INDICATOR_CLASS}`;

export interface BountyHuntingMessageIndicatorState {
  currentUserId: string;
  game: PublicBountyHuntingGame;
  pendingMessageId: string;
}

export interface BountyHuntingMessageIndicators {
  clear(): void;
  showForMessage(message: HTMLElement, state: BountyHuntingMessageIndicatorState): void;
  sync(state: BountyHuntingMessageIndicatorState): void;
}

export function createBountyHuntingMessageIndicators(
  getBountyLabel: (bounty: PublicBountyHuntingBounty) => string
): BountyHuntingMessageIndicators {
  function showForMessage(message: HTMLElement, state: BountyHuntingMessageIndicatorState): void {
    const messageId = getMessageStableId(message);
    const currentKeys = new Set<string>();

    state.game.bounties.forEach((bounty) => {
      const claim = bounty.claim;
      if (claim?.messageId !== messageId) return;
      const key = getBountyHuntingClaimKey(claim);
      currentKeys.add(key);
      show(message, key, () => createClaimIndicator(state.game, claim, getBountyLabel));
    });

    if (messageId && state.pendingMessageId === messageId) {
      const player = Object.values(state.game.players).find(
        (candidate) => candidate.userId === state.currentUserId
      );
      if (player) {
        const key = `${PENDING_KEY_PREFIX}${messageId}`;
        currentKeys.add(key);
        show(message, key, () => createIndicator(key, player, t('gamesWaitingForReply'), '…'));
      }
    }

    message
      .querySelectorAll<HTMLElement>(BOUNTY_HUNTING_MESSAGE_INDICATOR_SELECTOR)
      .forEach((indicator) => {
        if (!currentKeys.has(indicator.dataset.ytcqBountyHuntingClaimKey || '')) {
          indicator.remove();
        }
      });
  }

  function sync(state: BountyHuntingMessageIndicatorState): void {
    const currentKeys = new Set(
      state.game.bounties
        .map((bounty) => bounty.claim)
        .filter((claim): claim is BountyHuntingClaim => Boolean(claim))
        .map(getBountyHuntingClaimKey)
    );
    if (state.pendingMessageId) currentKeys.add(`${PENDING_KEY_PREFIX}${state.pendingMessageId}`);

    document
      .querySelectorAll<HTMLElement>(BOUNTY_HUNTING_MESSAGE_INDICATOR_SELECTOR)
      .forEach((indicator) => {
        if (
          indicator.isConnected &&
          currentKeys.has(indicator.dataset.ytcqBountyHuntingClaimKey || '')
        )
          return;
        indicator.remove();
      });

    document
      .querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR)
      .forEach((message) => showForMessage(message, state));
  }

  function show(message: HTMLElement, key: string, create: () => HTMLElement): void {
    const existing = [
      ...message.querySelectorAll<HTMLElement>(BOUNTY_HUNTING_MESSAGE_INDICATOR_SELECTOR)
    ].find((indicator) => indicator.dataset.ytcqBountyHuntingClaimKey === key);
    if (existing) return;

    const indicator = create();
    const host =
      message.querySelector<HTMLElement>('#message-container') ||
      message.querySelector<HTMLElement>('#message')?.parentElement ||
      message;
    host.append(indicator);
  }

  return {
    clear() {
      document
        .querySelectorAll<HTMLElement>(BOUNTY_HUNTING_MESSAGE_INDICATOR_SELECTOR)
        .forEach((indicator) => indicator.remove());
    },
    showForMessage,
    sync
  };
}

export function getBountyHuntingClaimKey(claim: BountyHuntingClaim): string {
  return `${claim.bountyId}:${claim.messageId}:${claim.claimedAt}:${claim.userId}`;
}

function createClaimIndicator(
  game: PublicBountyHuntingGame,
  claim: BountyHuntingClaim,
  getBountyLabel: (bounty: PublicBountyHuntingBounty) => string
): HTMLElement {
  const player = game.players[claim.role];
  const bounty = game.bounties.find((candidate) => candidate.id === claim.bountyId);
  const bountyLabel = bounty ? getBountyLabel(bounty) : t('gamesBountyHuntingClaimed');
  const amount = bounty ? `$${bounty.amount}` : '';
  const label = [
    t('gamesBountyHuntingClaimed'),
    player.displayName,
    `${t('gamesBountyHuntingBountyLabel')}: ${bountyLabel}`,
    amount ? `${t('gamesBountyHuntingAmountLabel')}: ${amount}` : ''
  ]
    .filter(Boolean)
    .join(' · ');

  return createIndicator(
    getBountyHuntingClaimKey(claim),
    player,
    label,
    amount || t('gamesBountyHuntingClaimed')
  );
}

function createIndicator(
  key: string,
  player: PublicBountyHuntingGame['players']['host'],
  label: string,
  amount: string
): HTMLElement {
  const presentation = getPlaygroundAvatarPresentation(player);

  return el<HTMLSpanElement>(
    <span
      class={INDICATOR_CLASS}
      data-ytcq-bounty-hunting-claim-key={key}
      aria-label={label}
      role="status"
      title={label}
    >
      <span
        class={INDICATOR_AVATAR_CLASS}
        style={{
          backgroundColor: presentation.backgroundColor,
          color: presentation.foregroundColor
        }}
      >
        {presentation.initial}
      </span>
      <span class={INDICATOR_AMOUNT_CLASS}>{amount}</span>
    </span>
  );
}
