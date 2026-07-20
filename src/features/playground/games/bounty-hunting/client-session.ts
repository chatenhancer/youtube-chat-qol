/** Live-chat preparation, witnesses, shots, and recovery for Bounty Hunting. */
import { isCurrentUserAuthorName } from '../../../mention-detection';
import {
  BOUNTY_HUNTING_BOUNTY_COUNT,
  BOUNTY_HUNTING_MAX_WITNESS_OBSERVATIONS,
  BOUNTY_HUNTING_ROUND_MS,
  type BountyHuntingBounty,
  type BountyHuntingMessageObservation,
  type PublicBountyHuntingBounty
} from '../../../../shared/playground/bounty-hunting';
import type {
  GameActionClientMessage,
  PlaygroundActionError
} from '../../../../shared/playground/protocol';
import { getMessageStableId } from '../../../../youtube/messages';
import { CHAT_MESSAGE_SELECTOR } from '../../../../youtube/selectors';
import type { SendGameAction } from '../adapter';
import {
  countBountyHuntingObservedCandidateTypes,
  createBountyHuntingBountiesFromMessages,
  findBountyHuntingMatchingBounty
} from './candidates';
import { createBountyHuntingChatFeed } from './feed';
import {
  BOUNTY_HUNTING_MESSAGE_INDICATOR_SELECTOR,
  createBountyHuntingMessageIndicators
} from './message-indicators';
import { createBountyHuntingMissFeedback } from './miss-feedback';
import type {
  BountyHuntingChatFeedMessage,
  BountyHuntingChatFeedObserver,
  BountyHuntingObservedMessage,
  PublicBountyHuntingGame
} from './types';

const ACTION_RETRY_MS = 5_000;
const PREPARATION_MAX_MS = 6_000;
const PREPARATION_MIN_MS = 2_000;
const PREPARATION_RECHECK_MS = 1_000;
const RETRYABLE_ERROR_CODES = new Set(['internal_error', 'rate_limited']);
const WITNESS_FLUSH_MS = 500;
const IGNORED_SHOT_TARGET_SELECTOR = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="link"]',
  '#author-name',
  '#author-photo',
  '#menu',
  BOUNTY_HUNTING_MESSAGE_INDICATOR_SELECTOR
].join(',');

interface BountyHuntingLastShot {
  clientX: number;
  clientY: number;
  messageId: string;
  observation: BountyHuntingMessageObservation;
}

interface BountyHuntingClientSessionOptions {
  getBountyLabel(bounty: PublicBountyHuntingBounty): string;
  getCurrentUserId(): string;
  getGame(): PublicBountyHuntingGame;
  isActive(): boolean;
  isBlocked(): boolean;
  isTimestampEligible(timestampUsec: string | undefined): boolean;
  onAction: SendGameAction;
  onFeedActivity(): void;
  onMiss(): void;
  signal: AbortSignal;
}

export interface BountyHuntingClientSession {
  close(): void;
  getMessage(messageId: string): BountyHuntingChatFeedMessage | null;
  handleActionError(error: PlaygroundActionError): boolean;
  handleMessageElement(message: HTMLElement): void;
  reset(): void;
  start(): void;
  update(previousGame: PublicBountyHuntingGame): void;
}

export function createBountyHuntingClientSession(
  options: BountyHuntingClientSessionOptions
): BountyHuntingClientSession {
  const indicators = createBountyHuntingMessageIndicators(options.getBountyLabel);
  const missFeedback = createBountyHuntingMissFeedback(options.signal);
  const pendingWitnesses = new Map<
    string,
    { bountyIds: Set<string>; messageTimestampUsec?: string }
  >();
  const preparationMessages = new Map<string, BountyHuntingObservedMessage>();
  const sentWitnessKeys = new Set<string>();

  let actionRetryGeneration = 0;
  let feed: BountyHuntingChatFeedObserver | null = null;
  let lastShot: BountyHuntingLastShot | null = null;
  let preparedBounties: BountyHuntingBounty[] | null = null;
  let preparationStarted = false;
  let preparationSubmitted = false;
  let preparationTimer: number | null = null;
  let witnessFlushTimer: number | null = null;
  let witnessRescanNeeded = false;

  document.addEventListener('click', handleDocumentClick, {
    capture: true,
    signal: options.signal
  });

  function start(): void {
    if (feed) return;
    feed = createBountyHuntingChatFeed({
      onRemove: forgetMessage,
      onReset: resetFeed,
      onUpsert: handleFeedMessage
    });
    syncMissCooldown(null, options.getGame(), Date.now());
    maybeStartPreparation();
    syncIndicators();
    flushWitnesses();
  }

  function close(): void {
    actionRetryGeneration += 1;
    if (preparationTimer !== null) window.clearTimeout(preparationTimer);
    preparationTimer = null;
    feed?.close();
    feed = null;
    clearWitnesses();
    indicators.clear();
    missFeedback.destroy();
  }

  function reset(): void {
    actionRetryGeneration += 1;
    if (preparationTimer !== null) window.clearTimeout(preparationTimer);
    preparationTimer = null;
    preparationStarted = false;
    preparationSubmitted = false;
    lastShot = null;
    missFeedback.clear();
    clearWitnesses();
    sentWitnessKeys.clear();
    witnessRescanNeeded = true;
    syncIndicators();
  }

  function update(previousGame: PublicBountyHuntingGame): void {
    const game = options.getGame();
    syncMissCooldown(previousGame, game, Date.now());
    reconcileLastShot(previousGame, game);

    if (previousGame.status !== game.status) {
      actionRetryGeneration += 1;
      if (game.status !== 'preparing') resetPreparation();
      if (game.status === 'active') observeFeedMessages();
      else {
        clearWitnesses();
        missFeedback.clear();
      }
    }

    maybeStartPreparation();
    if (witnessRescanNeeded) {
      witnessRescanNeeded = false;
      if (game.status === 'active') observeFeedMessages();
    }
    if (game.status === 'active') flushWitnesses();
    syncIndicators();
  }

  function handleActionError(error: PlaygroundActionError): boolean {
    const request = error.request;
    if (request?.type !== 'gameAction' || request.gameId !== options.getGame().gameId) {
      return false;
    }

    if (request.action === 'shootBounty') {
      const rejectedMessageId = request.payload?.messageId;
      if (!lastShot || rejectedMessageId !== lastShot.messageId) return false;
      releaseWitness(lastShot.observation);
      if (isRetryableError(error, request.action)) requeueWitness(lastShot.observation);
      lastShot = null;
      syncIndicators();
      return false;
    }

    if (
      !['observeBountyMessage', 'submitBounties', 'startRound', 'timeout', 'finish'].includes(
        request.action
      )
    ) {
      return false;
    }
    if (isRetryableError(error, request.action)) {
      scheduleActionRetry(request);
      return true;
    }
    if (request.action === 'submitBounties') {
      preparedBounties = null;
      preparationSubmitted = false;
      return false;
    }
    return true;
  }

  function handleMessageElement(message: HTMLElement): void {
    indicators.showForMessage(message, getIndicatorState());
    if (options.getGame().status === 'active') options.onFeedActivity();
  }

  function handleDocumentClick(event: MouseEvent): void {
    if (!options.isActive()) return;
    missFeedback.move(event.clientX, event.clientY);
    if (options.isBlocked() || !isShotClick(event)) return;

    const element = event.target.closest<HTMLElement>(CHAT_MESSAGE_SELECTOR);
    if (!element) return;
    const messageId = getMessageStableId(element);
    const message = messageId ? feed?.getMessage(messageId) : null;
    if (!message || isCurrentUserAuthorName(message.authorName)) return;
    if (missFeedback.isActive()) {
      consumeShotClick(event);
      return;
    }

    const result = shoot(message, { clientX: event.clientX, clientY: event.clientY });
    if (result === 'ignored') return;
    consumeShotClick(event);
    if (result === 'shot') syncIndicators();
  }

  function shoot(
    message: BountyHuntingObservedMessage,
    position: { clientX: number; clientY: number }
  ): 'ignored' | 'matched' | 'pending' | 'shot' {
    const game = options.getGame();
    if (game.status !== 'active') return 'ignored';
    if (Date.now() >= game.phaseStartedAt + BOUNTY_HUNTING_ROUND_MS) return 'ignored';
    if (message.messageId.startsWith('local:')) return 'ignored';
    if (!options.isTimestampEligible(message.messageTimestampUsec)) return 'ignored';
    if (game.bounties.some((bounty) => bounty.claim?.messageId === message.messageId)) {
      return 'matched';
    }
    if (game.pendingClaimMessageId || lastShot) return 'pending';

    const observation = takeClickedObservation(message);
    lastShot = { ...position, messageId: message.messageId, observation };
    options.onAction(game.gameId, 'shootBounty', {
      messageId: message.messageId,
      observations: [observation]
    });
    return 'shot';
  }

  function syncMissCooldown(
    previousGame: PublicBountyHuntingGame | null,
    game: PublicBountyHuntingGame,
    now: number
  ): void {
    const cooldownUntil = getMissCooldownUntil(game);
    const previousCooldownUntil = previousGame ? getMissCooldownUntil(previousGame) : 0;
    if (cooldownUntil <= now) {
      if (previousCooldownUntil > 0 && cooldownUntil !== previousCooldownUntil) {
        missFeedback.syncUntil(cooldownUntil);
      }
      return;
    }

    const feedbackWasActive = missFeedback.isActive();
    const deadlineChanged = cooldownUntil !== previousCooldownUntil;
    if (!deadlineChanged && feedbackWasActive) return;

    const confirmedShot = deadlineChanged && !feedbackWasActive ? lastShot : null;
    missFeedback.syncUntil(cooldownUntil, confirmedShot || undefined);
    if (confirmedShot) options.onMiss();
    if (deadlineChanged) lastShot = null;
  }

  function reconcileLastShot(
    previousGame: PublicBountyHuntingGame,
    game: PublicBountyHuntingGame
  ): void {
    const messageId = lastShot?.messageId;
    if (!messageId) return;
    const newlyClaimed = game.bounties.some((bounty) => {
      const claim = bounty.claim;
      if (claim?.messageId !== messageId) return false;
      return !previousGame.bounties.some((previous) => {
        const previousClaim = previous.claim;
        return previousClaim?.bountyId === claim.bountyId && previousClaim.messageId === messageId;
      });
    });
    if (
      newlyClaimed ||
      (previousGame.pendingClaimMessageId === messageId &&
        game.pendingClaimMessageId !== messageId) ||
      game.status !== 'active' ||
      (game.pendingClaimMessageId !== undefined && game.pendingClaimMessageId !== messageId)
    ) {
      lastShot = null;
    }
  }

  function handleFeedMessage(message: BountyHuntingChatFeedMessage): void {
    if (!options.isActive() || options.getGame().status !== 'active') return;
    options.onFeedActivity();
    maybeSendWitness(message);
  }

  function observeFeedMessages(): void {
    feed?.getMessages().forEach(handleFeedMessage);
  }

  function forgetMessage(messageId: string): void {
    pendingWitnesses.delete(messageId);
    const prefix = `${messageId}:`;
    sentWitnessKeys.forEach((key) => {
      if (key.startsWith(prefix)) sentWitnessKeys.delete(key);
    });
    if (options.getGame().status === 'active') options.onFeedActivity();
  }

  function resetFeed(): void {
    preparationMessages.clear();
    clearWitnesses();
    if (options.getGame().status === 'active') options.onFeedActivity();
  }

  function maybeStartPreparation(): void {
    const game = options.getGame();
    if (game.status !== 'preparing' || options.getCurrentUserId() !== game.bountyProviderUserId) {
      return;
    }
    if (preparedBounties) {
      submitPreparedBounties();
      return;
    }
    if (preparationStarted) return;

    preparationStarted = true;
    collectVisibleMessages();
    schedulePreparationCheck(Date.now(), PREPARATION_MIN_MS);
  }

  function schedulePreparationCheck(startedAt: number, delay: number): void {
    preparationTimer = window.setTimeout(() => {
      preparationTimer = null;
      if (!options.isActive() || options.getGame().status !== 'preparing') return;
      collectVisibleMessages();
      const elapsedMs = Date.now() - startedAt;
      if (
        elapsedMs < PREPARATION_MAX_MS &&
        countBountyHuntingObservedCandidateTypes([...preparationMessages.values()]) <
          BOUNTY_HUNTING_BOUNTY_COUNT
      ) {
        schedulePreparationCheck(
          startedAt,
          Math.min(PREPARATION_RECHECK_MS, PREPARATION_MAX_MS - elapsedMs)
        );
        return;
      }

      preparedBounties = createBountyHuntingBountiesFromMessages([...preparationMessages.values()]);
      submitPreparedBounties();
    }, delay);
  }

  function submitPreparedBounties(): void {
    if (!preparedBounties || preparationSubmitted) return;
    preparationSubmitted = true;
    options.onAction(options.getGame().gameId, 'submitBounties', {
      bounties: preparedBounties
    });
  }

  function resetPreparation(): void {
    preparedBounties = null;
    preparationSubmitted = false;
  }

  function collectVisibleMessages(): void {
    document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR).forEach((element) => {
      const messageId = getMessageStableId(element);
      const message = messageId ? feed?.getMessage(messageId) : null;
      if (messageId && message) preparationMessages.set(messageId, message);
    });
  }

  function maybeSendWitness(message: BountyHuntingObservedMessage): void {
    const game = options.getGame();
    if (game.status !== 'active') return;
    if (Date.now() >= game.phaseStartedAt + BOUNTY_HUNTING_ROUND_MS) return;
    if (message.messageId.startsWith('local:')) return;
    if (!options.isTimestampEligible(message.messageTimestampUsec)) return;

    const bountyIds = getMatchingOpenBountyIds(game, message).filter(
      (bountyId) => !sentWitnessKeys.has(`${message.messageId}:${bountyId}`)
    );
    if (!bountyIds.length) return;

    bountyIds.forEach((bountyId) => sentWitnessKeys.add(`${message.messageId}:${bountyId}`));
    queueWitness(message.messageId, bountyIds, message.messageTimestampUsec);
  }

  function queueWitness(
    messageId: string,
    bountyIds: string[],
    messageTimestampUsec?: string
  ): void {
    const existing = pendingWitnesses.get(messageId) || { bountyIds: new Set<string>() };
    bountyIds.forEach((bountyId) => existing.bountyIds.add(bountyId));
    pendingWitnesses.set(messageId, {
      bountyIds: existing.bountyIds,
      messageTimestampUsec: existing.messageTimestampUsec || messageTimestampUsec
    });
    if (witnessFlushTimer !== null) return;
    witnessFlushTimer = window.setTimeout(() => {
      witnessFlushTimer = null;
      flushWitnesses();
    }, WITNESS_FLUSH_MS);
  }

  function flushWitnesses(): void {
    if (!pendingWitnesses.size) return;
    const game = options.getGame();
    if (game.status !== 'active') {
      clearWitnesses();
      return;
    }

    const observations: BountyHuntingMessageObservation[] = [];
    for (const [messageId, witness] of pendingWitnesses) {
      observations.push({
        bountyIds: [...witness.bountyIds],
        messageId,
        ...(witness.messageTimestampUsec
          ? { messageTimestampUsec: witness.messageTimestampUsec }
          : {})
      });
      pendingWitnesses.delete(messageId);
      if (observations.length >= BOUNTY_HUNTING_MAX_WITNESS_OBSERVATIONS) break;
    }

    if (observations.length) {
      options.onAction(game.gameId, 'observeBountyMessage', { observations });
    }
    if (pendingWitnesses.size) {
      witnessFlushTimer = window.setTimeout(() => {
        witnessFlushTimer = null;
        flushWitnesses();
      }, WITNESS_FLUSH_MS);
    }
  }

  function clearWitnesses(): void {
    pendingWitnesses.clear();
    if (witnessFlushTimer !== null) window.clearTimeout(witnessFlushTimer);
    witnessFlushTimer = null;
  }

  function takeClickedObservation(
    message: BountyHuntingObservedMessage
  ): BountyHuntingMessageObservation {
    const bountyIds = getMatchingOpenBountyIds(options.getGame(), message);
    pendingWitnesses.delete(message.messageId);
    if (!pendingWitnesses.size && witnessFlushTimer !== null) {
      window.clearTimeout(witnessFlushTimer);
      witnessFlushTimer = null;
    }
    bountyIds.forEach((bountyId) => sentWitnessKeys.add(`${message.messageId}:${bountyId}`));
    return {
      bountyIds,
      messageId: message.messageId,
      ...(message.messageTimestampUsec
        ? { messageTimestampUsec: message.messageTimestampUsec }
        : {})
    };
  }

  function releaseWitness(observation: BountyHuntingMessageObservation): void {
    observation.bountyIds.forEach((bountyId) => {
      sentWitnessKeys.delete(`${observation.messageId}:${bountyId}`);
    });
  }

  function requeueWitness(observation: BountyHuntingMessageObservation): void {
    if (options.getGame().status !== 'active' || !observation.bountyIds.length) return;
    observation.bountyIds.forEach((bountyId) => {
      sentWitnessKeys.add(`${observation.messageId}:${bountyId}`);
    });
    queueWitness(observation.messageId, observation.bountyIds, observation.messageTimestampUsec);
  }

  function getMatchingOpenBountyIds(
    game: PublicBountyHuntingGame,
    message: BountyHuntingObservedMessage
  ): string[] {
    return game.bounties
      .filter((bounty) => !bounty.claim && findBountyHuntingMatchingBounty([bounty], message))
      .map((bounty) => bounty.id);
  }

  function syncIndicators(): void {
    indicators.sync(getIndicatorState());
  }

  function getIndicatorState() {
    const game = options.getGame();
    return {
      currentUserId: options.getCurrentUserId(),
      game,
      pendingMessageId: game.pendingClaimMessageId || lastShot?.messageId || ''
    };
  }

  function isRetryableError(error: PlaygroundActionError, action: string): boolean {
    if (RETRYABLE_ERROR_CODES.has(error.code)) return true;
    return (
      (action === 'startRound' && error.code === 'countdown_active') ||
      (action === 'timeout' && error.code === 'time_remaining') ||
      (action === 'finish' && error.code === 'round_over_visible')
    );
  }

  function scheduleActionRetry(request: GameActionClientMessage): void {
    const generation = actionRetryGeneration;
    window.setTimeout(() => {
      if (!options.isActive() || actionRetryGeneration !== generation) return;
      options.onAction(request.gameId, request.action, request.payload);
    }, ACTION_RETRY_MS);
  }

  return {
    close,
    getMessage: (messageId) => feed?.getMessage(messageId) || null,
    handleActionError,
    handleMessageElement,
    reset,
    start,
    update
  };
}

function getMissCooldownUntil(game: PublicBountyHuntingGame): number {
  const cooldownUntil = Number(game.missCooldownUntil);
  return Number.isFinite(cooldownUntil) && cooldownUntil > 0 ? cooldownUntil : 0;
}

function consumeShotClick(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

function isShotClick(event: MouseEvent): event is MouseEvent & { target: Element } {
  if (
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !(event.target instanceof Element)
  ) {
    return false;
  }
  return !event.target.closest(IGNORED_SHOT_TARGET_SELECTOR);
}
