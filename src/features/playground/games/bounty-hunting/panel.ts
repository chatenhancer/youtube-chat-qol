/**
 * Bounty Hunting game panel.
 *
 * Draws the western bounty board as a square canvas, prepares host-side bounty
 * candidates from live chat, and lets players claim open bounties by clicking
 * matching live chat messages.
 */
import { registerFeatureLifecycle } from '../../../../content/lifecycle';
import { isCurrentUserAuthorName } from '../../../mention-detection';
import {
  t,
  tWithEnglishFallbackWhenUnsupported,
  type MessageKey,
  type MessageParams
} from '../../../../shared/i18n';
import { ytcqCreateElement } from '../../../../shared/managed-dom';
import { drawPlaygroundCanvasAvatar } from '../../../../shared/playground/avatar';
import { getPlaygroundAvatarPresentation } from '../../../../shared/playground/identity';
import {
  BOUNTY_HUNTING_COUNTDOWN_MS,
  BOUNTY_HUNTING_BOUNTY_COUNT,
  BOUNTY_HUNTING_BOUNTY_DESCRIPTION_KEYS,
  BOUNTY_HUNTING_ROUND_MS,
  BOUNTY_HUNTING_ROUND_OVER_MS,
  type BountyHuntingClaim,
  type BountyHuntingBountyDescriptionKey,
  type PublicBountyHuntingBounty
} from '../../../../shared/playground/bounty-hunting';
import {
  getAuthorName,
  getMessageContentNodes,
  getMessageStableId,
  getMessageText
} from '../../../../youtube/messages';
import { CHAT_MESSAGE_SELECTOR, CHAT_SCROLLER_SELECTOR } from '../../../../youtube/selectors';
import {
  cancelScheduledFrame,
  getNow,
  isPointInRect,
  scheduleFrame
} from '../replay-trivia/canvas';
import type { GamePanelControls } from '../adapter';
import { drawGameLoadingSpinner } from '../loading-spinner';
import type { GamePanelShell } from '../panel-shell';
import { createGameSoundController } from '../sound';
import {
  BOUNTY_HUNTING_FONT_BARNUM,
  BOUNTY_HUNTING_FONT_BARTLE,
  BOUNTY_HUNTING_FONT_TEX_MEX,
  EMPTY_BOUNTY_HUNTING_ASSETS,
  getBountyHuntingAssets
} from './assets';
import {
  collectBountyHuntingTopFanAuthorKeys,
  countBountyHuntingObservedCandidateTypes,
  createBountyHuntingBountiesFromMessages,
  findBountyHuntingMatchingBounty,
  getBountyHuntingObservedMessage,
  getBountyHuntingTopFanAuthorKeyFromParticipant
} from './candidates';
import {
  canRenderBountyHuntingBarnumText,
  canRenderBountyHuntingBartleText,
  canRenderBountyHuntingTexMexText,
  formatBountyHuntingTexMexTitleText
} from './font-support';
import type {
  PublicBountyHuntingGame,
  Rect,
  BountyHuntingClosePanel,
  BountyHuntingFallbackRuntime,
  BountyHuntingObservedMessage,
  BountyHuntingPanelRuntime,
  BountyHuntingPlayerRole
} from './types';

const LAYOUT_WIDTH = 448;
const LAYOUT_HEIGHT = 448;
const COMPACT_LAYOUT_HEIGHT = 128;
const CANVAS_WIDTH = LAYOUT_WIDTH;
const CANVAS_HEIGHT = LAYOUT_HEIGHT;
const CANVAS_DISPLAY_SCALE = 0.75;
const CANVAS_DISPLAY_WIDTH = LAYOUT_WIDTH * CANVAS_DISPLAY_SCALE;
const PREPARATION_MAX_MS = 6_000;
const PREPARATION_MIN_MS = 2_000;
const PREPARATION_RECHECK_MS = 1_000;
const BUTTON_RECT: Rect = { height: 58, width: 164, x: 142, y: 394 };
const BOUNTY_AMOUNT_X = 114;
const BOUNTY_DESCRIPTION_X = 124;
const BOUNTY_DESCRIPTION_STAMP_GAP = 8;
const BOUNTY_LIST_X = 45;
const BOUNTY_LIST_Y = 146;
const BOUNTY_ROW_HEIGHT = 39;
const BOUNTY_ROW_GAP = 3;
const BOUNTY_ROW_WIDTH = 358;
const BOUNTY_STAMP_X_OFFSET = 0;
const CLAIMED_BOUNTY_ROW_ALPHA = 0.66;
const COMPACT_BOUNTY_COLUMNS = 3;
const COMPACT_BOUNTY_CHIP_GAP = 6;
const COMPACT_BOUNTY_CHIP_HEIGHT = 26;
const COMPACT_BOUNTY_CHIP_WIDTH = 140;
const COMPACT_BOUNTY_CHIP_X = 8;
const COMPACT_BOUNTY_CHIP_Y = 67;
const COMPACT_BOUNTY_CLAIMED_STAMP_HEIGHT = 34;
const COMPACT_BOUNTY_CLAIMED_STAMP_WIDTH = 48;
const COMPACT_BOUNTY_OPEN_STAMP_HEIGHT = 38;
const COMPACT_BOUNTY_OPEN_STAMP_WIDTH = 44;
const COMPACT_READY_BUTTON_RECT: Rect = { height: 38, width: 116, x: 166, y: 13 };
const LIVE_SCORE_AVATAR_RADIUS = 17;
const LIVE_SCORE_LEFT_TEXT_X = 104;
const LIVE_SCORE_MONEY_Y = 126;
const LIVE_SCORE_NAME_Y = 106;
const LIVE_SCORE_RIGHT_TEXT_X = 344;
const LIVE_SCORE_Y_OFFSET = -8;
const LOADING_SCREEN_OFFSET_Y = -28;
const LEDGER_AVATAR_X = 92;
const LEDGER_BOUNTIES_X = 304;
const LEDGER_CLOSE_BUTTON_Y = 386;
const LEDGER_DIVIDER_X = 92;
const LEDGER_DIVIDER_WIDTH = 328;
const LEDGER_HEADER_LINE_HEIGHT = 17;
const LEDGER_HEADER_TOP_Y = 96;
const LEDGER_HEADER_X = 304;
const LEDGER_LABEL_X = 136;
const LEDGER_MONEY_X = 382;
const LEDGER_RANK_STAR_HEIGHT = 45;
const LEDGER_RANK_STAR_WIDTH = 43;
const LEDGER_RANK_STAR_X_OFFSET = 44;
const LEDGER_RANK_STAR_Y_OFFSET = 44;
const LEDGER_RANK_TEXT_FONT_SIZE = 22;
const LEDGER_RANK_TEXT_X_OFFSET = 22;
const LEDGER_RANK_TEXT_Y_OFFSET = 20;
const LEDGER_ROW_DIVIDER_OFFSET_Y = 33;
const LEDGER_ROW_Y = [164, 234] as const;
const LEDGER_RIBBON_Y = 282;
const LEDGER_TITLE_FONT_SIZE = 56;
const LEDGER_TITLE_Y = 18;
const LEDGER_WINNER_Y = 318;
const READY_BUTTON_FLASH_MS = 520;
const CLAIMED_MESSAGE_FEEDBACK_MS = 2_800;
const ROUND_OVER_FALLBACK_TITLE_Y = 169;
const ROUND_OVER_BUTTON_LABEL_COLOR = '#F4DAA5';
const ROUND_OVER_BUTTON_Y = 382;
const ROUND_OVER_TITLE_IMAGE_HEIGHT = 296;
const ROUND_OVER_TITLE_IMAGE_WIDTH = 382;
const ROUND_OVER_TITLE_IMAGE_X = 33;
const ROUND_OVER_TITLE_IMAGE_Y = 28;
const TIMER_START_PULSE_MS = 720;
const WITNESS_FLUSH_MS = 500;
const WITNESS_OBSERVATIONS_PER_FLUSH = 20;
const READY_STACK_AVATAR_OFFSET_X = 12;
const READY_STACK_AVATAR_OVERLAP = 12;
const READY_STACK_AVATAR_RADIUS = 10;
const BOUNTY_HUNTING_PLAYER_ROLES: BountyHuntingPlayerRole[] = ['host', 'guest'];
const BOUNTY_HUNTING_DESCRIPTION_KEYS = new Set<string>(BOUNTY_HUNTING_BOUNTY_DESCRIPTION_KEYS);
const BOUNTY_HUNTING_CLAIMED_FEED_CLASS = 'ytcq-bounty-hunting-claimed-feed';
const BOUNTY_HUNTING_CLAIMED_FEED_ITEM_CLASS = 'ytcq-bounty-hunting-claimed-feed-item';
const BOUNTY_HUNTING_CLAIMED_FEED_AVATAR_CLASS = 'ytcq-bounty-hunting-claimed-feed-avatar';
const BOUNTY_HUNTING_CLAIMED_FEED_BODY_CLASS = 'ytcq-bounty-hunting-claimed-feed-body';
const BOUNTY_HUNTING_CLAIMED_FEED_META_CLASS = 'ytcq-bounty-hunting-claimed-feed-meta';
const BOUNTY_HUNTING_CLAIMED_FEED_CLAIMER_CLASS = 'ytcq-bounty-hunting-claimed-feed-claimer';
const BOUNTY_HUNTING_CLAIMED_FEED_DETAIL_CLASS = 'ytcq-bounty-hunting-claimed-feed-detail';
const BOUNTY_HUNTING_CLAIMED_FEED_DETAIL_LABEL_CLASS = 'ytcq-bounty-hunting-claimed-feed-detail-label';
const BOUNTY_HUNTING_CLAIMED_FEED_DETAIL_VALUE_CLASS = 'ytcq-bounty-hunting-claimed-feed-detail-value';
const BOUNTY_HUNTING_CLAIMED_FEED_TEXT_CLASS = 'ytcq-bounty-hunting-claimed-feed-text';
const BOUNTY_HUNTING_READY_SOUND_PATH = 'games/bounty-hunting/ready-gun-cock.mp3';
const BOUNTY_HUNTING_ROUND_OVER_SOUND_PATH = 'games/bounty-hunting/sting.mp3';
const BOUNTY_HUNTING_FINAL_TICK_SOUND_PATH = 'games/bounty-hunting/final-10-clock-tick.mp3';
const BOUNTY_HUNTING_ROUND_START_SOUND_PATH = 'games/bounty-hunting/round-start-cue.mp3';
const BOUNTY_HUNTING_CLAIM_SOUND_PATHS = [
  'games/bounty-hunting/claim-ricochet-01.mp3',
  'games/bounty-hunting/claim-ricochet-02.mp3',
  'games/bounty-hunting/claim-ricochet-03.mp3',
  'games/bounty-hunting/claim-ricochet-04.mp3',
  'games/bounty-hunting/claim-ricochet-05.mp3',
  'games/bounty-hunting/claim-ricochet-06.mp3',
  'games/bounty-hunting/claim-ricochet-07.mp3',
  'games/bounty-hunting/claim-ricochet-08.mp3',
  'games/bounty-hunting/claim-ricochet-09.mp3',
  'games/bounty-hunting/claim-ricochet-10.mp3'
] as const;
const PAPER_TEXT = '#352c24';
const RED_TEXT = '#8f1d25';
const GREEN_STAMP = '#26833c';
const SHADOW = 'rgba(0, 0, 0, 0.28)';
const BARNUM_STACK = `"${BOUNTY_HUNTING_FONT_BARNUM}", Georgia, serif`;
const BARTLE_STACK = `"${BOUNTY_HUNTING_FONT_BARTLE}", Impact, sans-serif`;
const TEX_MEX_STACK = `"${BOUNTY_HUNTING_FONT_TEX_MEX}", Impact, sans-serif`;

function tBountyHuntingBarnum(key: MessageKey, params: MessageParams = {}): string {
  return tWithEnglishFallbackWhenUnsupported(key, canRenderBountyHuntingBarnumText, params);
}

function tBountyHuntingBartle(key: MessageKey, params: MessageParams = {}): string {
  return tWithEnglishFallbackWhenUnsupported(key, canRenderBountyHuntingBartleText, params);
}

function tBountyHuntingTexMex(key: MessageKey, params: MessageParams = {}): string {
  return formatBountyHuntingTexMexTitleText(
    tWithEnglishFallbackWhenUnsupported(key, canRenderBountyHuntingTexMexText, params)
  );
}

let activeBountyHuntingPanel: BountyHuntingPanelRuntime | null = null;
let activeBountyHuntingFallback: BountyHuntingFallbackRuntime | null = null;

registerFeatureLifecycle({
  message: { collect: handleBountyHuntingLifecycleMessage },
  mutation: {
    collect({ changedMessages }) {
      changedMessages.forEach(handleBountyHuntingLifecycleMessage);
    }
  },
  participant: { enhance: handleBountyHuntingLifecycleParticipant }
});

export function openBountyHuntingGamePanel(
  shell: GamePanelShell,
  game: PublicBountyHuntingGame,
  currentUserId: string,
  onAction: (gameId: string, action: string, payload?: Record<string, unknown>) => void,
  onVisibilityChanged: (() => void) | undefined,
  closePanel: BountyHuntingClosePanel,
  panelControls: GamePanelControls | null = null
): void {
  closeBountyHuntingGamePanel({ notify: false });

  const listeners = new AbortController();
  const soundController = createGameSoundController({
    className: 'ytcq-bounty-hunting-game-sound-toggle',
    preloadPaths: [
      BOUNTY_HUNTING_READY_SOUND_PATH,
      BOUNTY_HUNTING_ROUND_OVER_SOUND_PATH,
      BOUNTY_HUNTING_FINAL_TICK_SOUND_PATH,
      BOUNTY_HUNTING_ROUND_START_SOUND_PATH,
      ...BOUNTY_HUNTING_CLAIM_SOUND_PATHS
    ],
    signal: listeners.signal
  });
  const { body, compactButton, statusOverlay, subtitleElement } = shell;
  compactButton.before(soundController.button);
  subtitleElement.textContent = getBountyHuntingOpponentLabel(game, currentUserId);

  const canvas = ytcqCreateElement('canvas');
  canvas.className = 'ytcq-bounty-hunting-canvas';
  canvas.setAttribute('aria-label', t('gamesBountyHunting'));
  canvas.setAttribute('role', 'application');
  canvas.tabIndex = 0;
  body.append(canvas);

  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext('2d');
  } catch {
    context = null;
  }

  if (!context || !canRenderBountyHuntingCanvas(context)) {
    const fallback = ytcqCreateElement('div');
    fallback.className = 'ytcq-bounty-hunting-game-fallback';
    fallback.textContent = t('gamesBountyHuntingCanvasUnavailable');
    body.replaceChildren(fallback, statusOverlay.element);
    activeBountyHuntingFallback = {
      content: fallback,
      listeners,
      onVisibilityChanged: onVisibilityChanged || null,
      soundController
    };
    onVisibilityChanged?.();
    return;
  }

  activeBountyHuntingPanel = {
    assets: EMPTY_BOUNTY_HUNTING_ASSETS,
    canvas,
    claimSoundIndex: 0,
    claimedMessageFeedbackTimers: new Map(),
    closePanel,
    compactMode: false,
    context,
    currentUserId,
    finalTickPlayedForGameId: null,
    finishSent: false,
    frameId: null,
    game,
    hitboxes: [],
    hoveredAction: null,
    listeners,
    onAction,
    onVisibilityChanged: onVisibilityChanged || null,
    panelControls,
    pendingWitnesses: new Map(),
    pixelRatio: configureBountyHuntingCanvas(canvas),
    preparationMessages: new Map(),
    preparationStarted: false,
    preparationTimer: null,
    readyButtonFlashUntil: 0,
    roundOverStingPlayedForGameId: null,
    sentClaimKeys: new Set(),
    sentWitnessKeys: new Set(),
    soundController,
    startRoundSent: false,
    statusOverlay,
    subtitleElement,
    timerStartPulseUntil: 0,
    timeoutSent: false,
    topFanAuthorKeys: collectBountyHuntingTopFanAuthorKeys(),
    witnessFlushTimer: null
  };

  canvas.addEventListener('click', handleBountyHuntingCanvasClick, { signal: listeners.signal });
  canvas.addEventListener('mousemove', handleBountyHuntingCanvasMouseMove, { signal: listeners.signal });
  canvas.addEventListener('mouseleave', handleBountyHuntingCanvasMouseLeave, { signal: listeners.signal });
  canvas.addEventListener('keydown', handleBountyHuntingCanvasKeydown, { signal: listeners.signal });
  document.addEventListener('click', handleBountyHuntingDocumentClick, {
    capture: true,
    signal: listeners.signal
  });

  maybeStartBountyHuntingPreparation(activeBountyHuntingPanel);
  maybeObserveVisibleBountyHuntingMessages(activeBountyHuntingPanel);
  renderBountyHuntingGame(getNow());
  maybePlayBountyHuntingRoundOverSting(activeBountyHuntingPanel);
  startBountyHuntingLoop();
  onVisibilityChanged?.();

  void getBountyHuntingAssets().then((assets) => {
    if (!activeBountyHuntingPanel || activeBountyHuntingPanel.canvas !== canvas) return;
    activeBountyHuntingPanel.assets = assets;
    renderBountyHuntingGame(getNow());
  }).catch(() => undefined);
}

export function closeBountyHuntingGamePanel({ notify = true }: { notify?: boolean } = {}): void {
  const fallback = activeBountyHuntingFallback;
  if (fallback) {
    fallback.listeners.abort();
    fallback.content.remove();
    fallback.soundController.button.remove();
    activeBountyHuntingFallback = null;
    if (notify) fallback.onVisibilityChanged?.();
  }

  const runtime = activeBountyHuntingPanel;
  if (!runtime) return;
  if (runtime.frameId !== null) cancelScheduledFrame(runtime.frameId);
  if (runtime.preparationTimer !== null) window.clearTimeout(runtime.preparationTimer);
  clearBountyHuntingWitnessQueue(runtime);
  clearBountyHuntingClaimedMessageFeedback(runtime);
  runtime.statusOverlay.clear();
  runtime.listeners.abort();
  runtime.canvas.remove();
  runtime.soundController.button.remove();
  activeBountyHuntingPanel = null;
  if (notify) runtime.onVisibilityChanged?.();
}

export function isBountyHuntingGamePanelOpen(): boolean {
  return Boolean(activeBountyHuntingPanel || activeBountyHuntingFallback);
}

export function getActiveBountyHuntingGameId(): string {
  return activeBountyHuntingPanel?.game.gameId || '';
}

export function setBountyHuntingCompactMode(compact: boolean): void {
  const runtime = activeBountyHuntingPanel;
  if (!runtime || runtime.compactMode === compact) return;
  runtime.compactMode = compact;
  runtime.hoveredAction = null;
  runtime.canvas.style.cursor = 'default';
  runtime.pixelRatio = configureBountyHuntingCanvas(runtime.canvas, compact);
  renderBountyHuntingGame(getNow());
  runtime.onVisibilityChanged?.();
}

export function updateBountyHuntingGamePanel(game: PublicBountyHuntingGame, currentUserId: string): void {
  const runtime = activeBountyHuntingPanel;
  if (!runtime || runtime.game.gameId !== game.gameId) return;

  const previousGame = runtime.game;
  const previousStatus = runtime.game.status;
  const newClaims = getNewBountyHuntingClaims(previousGame, game);
  runtime.game = game;
  runtime.currentUserId = currentUserId;
  runtime.subtitleElement.textContent = getBountyHuntingOpponentLabel(game, currentUserId);

  if (previousStatus !== game.status) {
    runtime.startRoundSent = false;
    runtime.timeoutSent = false;
    runtime.finishSent = false;
    if (game.status === 'active') {
      moveBountyHuntingPanelToActiveRoundPosition(runtime);
      runtime.timerStartPulseUntil = getNow() + TIMER_START_PULSE_MS;
      runtime.soundController.play(BOUNTY_HUNTING_ROUND_START_SOUND_PATH);
    } else if (game.status === 'roundOver') {
      moveBountyHuntingPanelToRoundOverPosition(runtime);
      clearBountyHuntingWitnessQueue(runtime);
    } else {
      clearBountyHuntingWitnessQueue(runtime);
    }
  }
  if (newClaims.length > 0) {
    playBountyHuntingClaimFeedback(runtime);
    newClaims.forEach((claim) => {
      showBountyHuntingClaimedMessageFeedback(runtime, claim);
    });
  }
  if (hasNewBountyHuntingReadyPlayer(previousGame, game)) {
    playBountyHuntingReadyFeedback(runtime);
  }
  maybePlayBountyHuntingRoundOverSting(runtime);

  maybeStartBountyHuntingPreparation(runtime);
  maybeObserveVisibleBountyHuntingMessages(runtime);
  renderBountyHuntingGame(getNow());
}

function moveBountyHuntingPanelToActiveRoundPosition(runtime: BountyHuntingPanelRuntime): void {
  runtime.panelControls?.setCompactMode(true);
  runtime.panelControls?.setPosition({ placement: 'top-center' });
}

function moveBountyHuntingPanelToRoundOverPosition(runtime: BountyHuntingPanelRuntime): void {
  runtime.panelControls?.setCompactMode(false);
}

function handleBountyHuntingLifecycleMessage(message: HTMLElement): void {
  const runtime = activeBountyHuntingPanel;
  if (!runtime || !message.isConnected) return;
  const observed = getBountyHuntingObservedMessage(message, {
    topFanAuthorKeys: runtime.topFanAuthorKeys
  });
  if (!observed) return;

  if (runtime.game.status === 'preparing' && runtime.currentUserId === runtime.game.bountyProviderUserId) {
    runtime.preparationMessages.set(observed.messageId, observed);
    return;
  }

  maybeSendBountyHuntingWitness(runtime, observed);
}

function handleBountyHuntingLifecycleParticipant(participant: HTMLElement): void {
  const runtime = activeBountyHuntingPanel;
  if (!runtime || !participant.isConnected) return;
  const key = getBountyHuntingTopFanAuthorKeyFromParticipant(participant);
  if (key) runtime.topFanAuthorKeys.add(key);
}

function maybeStartBountyHuntingPreparation(runtime: BountyHuntingPanelRuntime): void {
  if (runtime.preparationStarted) return;
  if (runtime.game.status !== 'preparing') return;
  if (runtime.currentUserId !== runtime.game.bountyProviderUserId) return;

  runtime.preparationStarted = true;
  collectVisibleBountyHuntingMessages(runtime);
  scheduleBountyHuntingPreparationCheck(runtime, Date.now(), PREPARATION_MIN_MS);
}

function scheduleBountyHuntingPreparationCheck(
  runtime: BountyHuntingPanelRuntime,
  startedAt: number,
  delay: number
): void {
  runtime.preparationTimer = window.setTimeout(() => {
    runtime.preparationTimer = null;
    if (!activeBountyHuntingPanel || activeBountyHuntingPanel.canvas !== runtime.canvas) return;
    if (runtime.game.status !== 'preparing') return;
    collectVisibleBountyHuntingMessages(runtime);
    const elapsedMs = Date.now() - startedAt;
    if (
      elapsedMs < PREPARATION_MAX_MS &&
      countBountyHuntingObservedCandidateTypes([...runtime.preparationMessages.values()]) < BOUNTY_HUNTING_BOUNTY_COUNT
    ) {
      scheduleBountyHuntingPreparationCheck(
        runtime,
        startedAt,
        Math.min(PREPARATION_RECHECK_MS, PREPARATION_MAX_MS - elapsedMs)
      );
      return;
    }

    runtime.onAction(runtime.game.gameId, 'submitBounties', {
      bounties: createBountyHuntingBountiesFromMessages([...runtime.preparationMessages.values()])
    });
  }, delay);
}

function collectVisibleBountyHuntingMessages(runtime: BountyHuntingPanelRuntime): void {
  refreshBountyHuntingTopFanAuthorKeys(runtime);
  document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR).forEach((message) => {
    const observed = getBountyHuntingObservedMessage(message, {
      topFanAuthorKeys: runtime.topFanAuthorKeys
    });
    if (observed) runtime.preparationMessages.set(observed.messageId, observed);
  });
}

function maybeObserveVisibleBountyHuntingMessages(runtime: BountyHuntingPanelRuntime): void {
  if (runtime.game.status !== 'active') return;
  refreshBountyHuntingTopFanAuthorKeys(runtime);
  document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR).forEach((message) => {
    const observed = getBountyHuntingObservedMessage(message, {
      topFanAuthorKeys: runtime.topFanAuthorKeys
    });
    if (observed) maybeSendBountyHuntingWitness(runtime, observed);
  });
  flushBountyHuntingWitnesses(runtime);
}

function refreshBountyHuntingTopFanAuthorKeys(runtime: BountyHuntingPanelRuntime): void {
  collectBountyHuntingTopFanAuthorKeys().forEach((key) => runtime.topFanAuthorKeys.add(key));
}

function maybeSendBountyHuntingWitness(
  runtime: BountyHuntingPanelRuntime,
  message: BountyHuntingObservedMessage
): void {
  if (runtime.game.status !== 'active') return;
  if (Date.now() >= runtime.game.phaseStartedAt + BOUNTY_HUNTING_ROUND_MS) return;
  if (message.messageId.startsWith('local:')) return;

  const bountyIds = runtime.game.bounties
    .filter((bounty) => !bounty.claim && findBountyHuntingMatchingBounty([bounty], message))
    .map((bounty) => bounty.id)
    .filter((bountyId) => !runtime.sentWitnessKeys.has(`${message.messageId}:${bountyId}`));
  if (!bountyIds.length) return;

  bountyIds.forEach((bountyId) => runtime.sentWitnessKeys.add(`${message.messageId}:${bountyId}`));
  queueBountyHuntingWitness(runtime, message.messageId, bountyIds);
}

function queueBountyHuntingWitness(
  runtime: BountyHuntingPanelRuntime,
  messageId: string,
  bountyIds: string[]
): void {
  const existing = runtime.pendingWitnesses.get(messageId) || new Set<string>();
  bountyIds.forEach((bountyId) => existing.add(bountyId));
  runtime.pendingWitnesses.set(messageId, existing);
  scheduleBountyHuntingWitnessFlush(runtime);
}

function scheduleBountyHuntingWitnessFlush(runtime: BountyHuntingPanelRuntime): void {
  if (runtime.witnessFlushTimer !== null) return;
  runtime.witnessFlushTimer = window.setTimeout(() => {
    runtime.witnessFlushTimer = null;
    flushBountyHuntingWitnesses(runtime);
  }, WITNESS_FLUSH_MS);
}

function flushBountyHuntingWitnesses(runtime: BountyHuntingPanelRuntime): void {
  if (!runtime.pendingWitnesses.size) return;
  if (runtime.game.status !== 'active') {
    clearBountyHuntingWitnessQueue(runtime);
    return;
  }

  const observations: Array<{ bountyIds: string[]; messageId: string }> = [];
  for (const [messageId, witness] of runtime.pendingWitnesses) {
    observations.push({
      bountyIds: [...witness],
      messageId
    });
    runtime.pendingWitnesses.delete(messageId);
    if (observations.length >= WITNESS_OBSERVATIONS_PER_FLUSH) break;
  }

  if (!observations.length) return;
  runtime.onAction(runtime.game.gameId, 'observeBountyMessage', {
    observations
  });
  if (runtime.pendingWitnesses.size) scheduleBountyHuntingWitnessFlush(runtime);
}

function clearBountyHuntingWitnessQueue(runtime: BountyHuntingPanelRuntime): void {
  runtime.pendingWitnesses.clear();
  if (runtime.witnessFlushTimer === null) return;
  window.clearTimeout(runtime.witnessFlushTimer);
  runtime.witnessFlushTimer = null;
}

function maybeClaimBountyHuntingBounty(
  runtime: BountyHuntingPanelRuntime,
  message: BountyHuntingObservedMessage
): void {
  if (runtime.game.status !== 'active') return;
  if (Date.now() >= runtime.game.phaseStartedAt + BOUNTY_HUNTING_ROUND_MS) return;
  if (message.messageId.startsWith('local:')) return;

  const openBounties = runtime.game.bounties.filter((bounty) => !bounty.claim);
  const bounty = findBountyHuntingMatchingBounty(openBounties, message);
  if (!bounty) return;

  const claimKey = `${message.messageId}:${bounty.id}`;
  if (runtime.sentClaimKeys.has(claimKey)) return;
  runtime.sentClaimKeys.add(claimKey);
  runtime.onAction(runtime.game.gameId, 'claimBounty', {
    bountyId: bounty.id,
    messageId: message.messageId
  });
}

function handleBountyHuntingDocumentClick(event: MouseEvent): void {
  const runtime = activeBountyHuntingPanel;
  if (!runtime || runtime.statusOverlay.isBlocking()) return;
  if (!(event.target instanceof Element)) return;

  const message = event.target.closest<HTMLElement>(CHAT_MESSAGE_SELECTOR);
  if (!message) return;
  if (isCurrentUserBountyHuntingMessage(message)) return;
  const observed = getBountyHuntingObservedMessage(message, {
    topFanAuthorKeys: runtime.topFanAuthorKeys
  });
  if (observed) maybeClaimBountyHuntingBounty(runtime, observed);
}

function isCurrentUserBountyHuntingMessage(message: HTMLElement): boolean {
  const authorName = getAuthorName(message);
  return Boolean(authorName && isCurrentUserAuthorName(authorName));
}

function handleBountyHuntingCanvasClick(event: MouseEvent): void {
  const runtime = activeBountyHuntingPanel;
  if (!runtime || runtime.statusOverlay.isBlocking()) return;

  const action = getBountyHuntingCanvasAction(runtime, event);
  if (!action) return;
  if (action === 'ready') {
    if (runtime.game.status !== 'ready') return;
    const role = getBountyHuntingCurrentRole(runtime.game, runtime.currentUserId);
    if (role) {
      const nextReady = !runtime.game.readyPlayers[role];
      if (nextReady) playBountyHuntingReadyFeedback(runtime);
      runtime.game = {
        ...runtime.game,
        readyPlayers: {
          ...runtime.game.readyPlayers,
          [role]: nextReady
        }
      };
      runtime.onAction(runtime.game.gameId, 'ready');
      renderBountyHuntingGame(getNow());
    }
    return;
  }

  runtime.onAction(runtime.game.gameId, 'leave');
  runtime.closePanel();
}

function flashBountyHuntingReadyButton(runtime: BountyHuntingPanelRuntime, now = getNow()): void {
  runtime.readyButtonFlashUntil = now + READY_BUTTON_FLASH_MS;
}

function playBountyHuntingReadyFeedback(runtime: BountyHuntingPanelRuntime): void {
  flashBountyHuntingReadyButton(runtime);
  runtime.soundController.play(BOUNTY_HUNTING_READY_SOUND_PATH);
}

function playBountyHuntingClaimFeedback(runtime: BountyHuntingPanelRuntime): void {
  const soundPath = BOUNTY_HUNTING_CLAIM_SOUND_PATHS[runtime.claimSoundIndex % BOUNTY_HUNTING_CLAIM_SOUND_PATHS.length];
  runtime.claimSoundIndex = (runtime.claimSoundIndex + 1) % BOUNTY_HUNTING_CLAIM_SOUND_PATHS.length;
  runtime.soundController.play(soundPath);
}

function showBountyHuntingClaimedMessageFeedback(
  runtime: BountyHuntingPanelRuntime,
  claim: BountyHuntingClaim
): void {
  const message = findBountyHuntingChatMessageById(claim.messageId);
  if (!message) return;

  const feed = getBountyHuntingClaimedMessageFeed(message);
  const item = createBountyHuntingClaimedMessageFeedbackItem(runtime, claim, message);
  feed.append(item);

  const timer = window.setTimeout(() => {
    removeBountyHuntingClaimedMessageFeedback(runtime, item);
  }, CLAIMED_MESSAGE_FEEDBACK_MS);
  runtime.claimedMessageFeedbackTimers.set(item, timer);
}

function createBountyHuntingClaimedMessageFeedbackItem(
  runtime: BountyHuntingPanelRuntime,
  claim: BountyHuntingClaim,
  message: HTMLElement
): HTMLElement {
  const player = runtime.game.players[claim.role];
  const bounty = runtime.game.bounties.find((candidate) => candidate.id === claim.bountyId);
  const bountyLabel = bounty ? getBountyHuntingCompactBountyLabel(bounty) : t('gamesBountyHuntingClaimed');
  const bountyAmount = bounty ? `$${bounty.amount}` : '';
  const presentation = getPlaygroundAvatarPresentation(player);
  const item = ytcqCreateElement('div');
  item.className = BOUNTY_HUNTING_CLAIMED_FEED_ITEM_CLASS;
  item.setAttribute('role', 'status');

  const text = ytcqCreateElement('span');
  text.className = BOUNTY_HUNTING_CLAIMED_FEED_TEXT_CLASS;
  const contentNodes = getMessageContentNodes(message);
  if (contentNodes.length) {
    text.replaceChildren(...contentNodes);
  } else {
    text.textContent = getMessageText(message) || t('gamesBountyHuntingClaimed');
  }

  const body = ytcqCreateElement('span');
  body.className = BOUNTY_HUNTING_CLAIMED_FEED_BODY_CLASS;

  const avatar = ytcqCreateElement('span');
  avatar.className = BOUNTY_HUNTING_CLAIMED_FEED_AVATAR_CLASS;
  avatar.style.backgroundColor = presentation.backgroundColor;
  avatar.style.color = presentation.foregroundColor;
  avatar.textContent = presentation.initial;
  avatar.title = player.displayName;

  const meta = ytcqCreateElement('span');
  meta.className = BOUNTY_HUNTING_CLAIMED_FEED_META_CLASS;

  const claimer = ytcqCreateElement('span');
  claimer.className = BOUNTY_HUNTING_CLAIMED_FEED_CLAIMER_CLASS;
  claimer.textContent = player.displayName;

  meta.append(
    claimer,
    createBountyHuntingClaimedFeedDetail(t('gamesBountyHuntingBountyLabel'), bountyLabel),
    createBountyHuntingClaimedFeedDetail(t('gamesBountyHuntingAmountLabel'), bountyAmount)
  );

  body.append(avatar, meta);
  item.append(text, body);
  return item;
}

function createBountyHuntingClaimedFeedDetail(labelText: string, valueText: string): HTMLElement {
  const detail = ytcqCreateElement('span');
  detail.className = BOUNTY_HUNTING_CLAIMED_FEED_DETAIL_CLASS;
  detail.setAttribute('aria-label', `${labelText}: ${valueText}`);

  const label = ytcqCreateElement('span');
  label.className = BOUNTY_HUNTING_CLAIMED_FEED_DETAIL_LABEL_CLASS;
  label.textContent = `${labelText}: `;

  const value = ytcqCreateElement('span');
  value.className = BOUNTY_HUNTING_CLAIMED_FEED_DETAIL_VALUE_CLASS;
  value.textContent = valueText;

  detail.append(label, value);
  return detail;
}

function getBountyHuntingClaimedMessageFeed(message: HTMLElement): HTMLElement {
  const scroller = message
    .closest('yt-live-chat-item-list-renderer')
    ?.querySelector<HTMLElement>('#item-scroller') ||
    document.querySelector<HTMLElement>(CHAT_SCROLLER_SELECTOR);
  let feed = document.querySelector<HTMLElement>(`.${BOUNTY_HUNTING_CLAIMED_FEED_CLASS}`);
  if (!feed) {
    feed = ytcqCreateElement('div');
    feed.className = BOUNTY_HUNTING_CLAIMED_FEED_CLASS;
    feed.setAttribute('aria-live', 'polite');
    document.body.append(feed);
  }
  if (scroller) positionBountyHuntingClaimedMessageFeed(feed, scroller);
  return feed;
}

function positionBountyHuntingClaimedMessageFeed(feed: HTMLElement, scroller: HTMLElement): void {
  const rect = scroller.getBoundingClientRect();
  const sideInset = 12;
  feed.style.left = `${Math.max(0, Math.round(rect.left + sideInset))}px`;
  feed.style.right = `${Math.max(sideInset, Math.round(window.innerWidth - rect.right + sideInset))}px`;
  feed.style.bottom = `${Math.max(sideInset, Math.round(window.innerHeight - rect.bottom + sideInset))}px`;
}

function findBountyHuntingChatMessageById(messageId: string): HTMLElement | null {
  for (const message of document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR)) {
    if (getMessageStableId(message) === messageId) return message;
  }
  return null;
}

function clearBountyHuntingClaimedMessageFeedback(runtime: BountyHuntingPanelRuntime): void {
  [...runtime.claimedMessageFeedbackTimers.keys()].forEach((message) => {
    removeBountyHuntingClaimedMessageFeedback(runtime, message);
  });
  document.querySelectorAll<HTMLElement>(`.${BOUNTY_HUNTING_CLAIMED_FEED_CLASS}`).forEach((feed) => feed.remove());
}

function removeBountyHuntingClaimedMessageFeedback(
  runtime: BountyHuntingPanelRuntime,
  item: HTMLElement
): void {
  const timer = runtime.claimedMessageFeedbackTimers.get(item);
  if (timer !== undefined) window.clearTimeout(timer);
  runtime.claimedMessageFeedbackTimers.delete(item);
  const feed = item.parentElement;
  item.remove();
  if (feed?.classList.contains(BOUNTY_HUNTING_CLAIMED_FEED_CLASS) && !feed.childElementCount) {
    feed.remove();
  }
}

function maybePlayBountyHuntingRoundOverSting(runtime: BountyHuntingPanelRuntime): void {
  if (runtime.game.status !== 'roundOver') return;
  if (runtime.roundOverStingPlayedForGameId === runtime.game.gameId) return;
  runtime.roundOverStingPlayedForGameId = runtime.game.gameId;
  runtime.soundController.play(BOUNTY_HUNTING_ROUND_OVER_SOUND_PATH);
}

function handleBountyHuntingCanvasKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const runtime = activeBountyHuntingPanel;
  if (!runtime) return;
  const hitbox = runtime.hitboxes.find((candidate) => candidate.action === 'ready' || candidate.action === 'close');
  if (!hitbox) return;
  event.preventDefault();
  const canvasRect = runtime.canvas.getBoundingClientRect();
  const point = getBountyHuntingClientPoint(runtime.canvas, {
    x: hitbox.rect.x + hitbox.rect.width / 2,
    y: hitbox.rect.y + hitbox.rect.height / 2
  });
  handleBountyHuntingCanvasClick(new MouseEvent('click', {
    clientX: canvasRect.left + point.x,
    clientY: canvasRect.top + point.y
  }));
}

function handleBountyHuntingCanvasMouseMove(event: MouseEvent): void {
  const runtime = activeBountyHuntingPanel;
  if (!runtime) return;
  const action = getBountyHuntingCanvasAction(runtime, event);
  if (action === runtime.hoveredAction) return;
  runtime.hoveredAction = action;
  runtime.canvas.style.cursor = action ? 'pointer' : 'default';
  renderBountyHuntingGame(getNow());
}

function handleBountyHuntingCanvasMouseLeave(): void {
  const runtime = activeBountyHuntingPanel;
  if (!runtime) return;
  runtime.hoveredAction = null;
  runtime.canvas.style.cursor = 'default';
  renderBountyHuntingGame(getNow());
}

function getBountyHuntingCanvasAction(runtime: BountyHuntingPanelRuntime, event: MouseEvent): 'close' | 'ready' | null {
  const point = getBountyHuntingCanvasPoint(runtime.canvas, event);
  return runtime.hitboxes.find((hitbox) => isPointInRect(point, hitbox.rect))?.action || null;
}

function startBountyHuntingLoop(): void {
  const runtime = activeBountyHuntingPanel;
  if (!runtime || runtime.frameId !== null) return;
  const tick = (now: number): void => {
    const active = activeBountyHuntingPanel;
    if (!active) return;
    active.pixelRatio = syncBountyHuntingCanvasPixelRatio(active.canvas, active.pixelRatio, active.compactMode);
    maybeSendBountyHuntingTimerActions(active);
    renderBountyHuntingGame(now);
    active.frameId = scheduleFrame(tick);
  };
  runtime.frameId = scheduleFrame(tick);
}

function maybeSendBountyHuntingTimerActions(runtime: BountyHuntingPanelRuntime): void {
  if (runtime.game.status === 'countdown' && !runtime.startRoundSent) {
    if (Date.now() - runtime.game.phaseStartedAt >= BOUNTY_HUNTING_COUNTDOWN_MS) {
      runtime.startRoundSent = true;
      runtime.onAction(runtime.game.gameId, 'startRound');
    }
  }

  if (runtime.game.status === 'active' && !runtime.timeoutSent) {
    maybePlayBountyHuntingFinalTick(runtime);
    if (Date.now() - runtime.game.phaseStartedAt >= BOUNTY_HUNTING_ROUND_MS) {
      runtime.timeoutSent = true;
      runtime.onAction(runtime.game.gameId, 'timeout');
    }
  }

  if (runtime.game.status === 'roundOver' && !runtime.finishSent) {
    if (Date.now() - runtime.game.phaseStartedAt >= BOUNTY_HUNTING_ROUND_OVER_MS) {
      runtime.finishSent = true;
      runtime.onAction(runtime.game.gameId, 'finish');
    }
  }
}

function maybePlayBountyHuntingFinalTick(runtime: BountyHuntingPanelRuntime): void {
  if (runtime.finalTickPlayedForGameId === runtime.game.gameId) return;
  const remainingMs = runtime.game.phaseStartedAt + BOUNTY_HUNTING_ROUND_MS - Date.now();
  if (remainingMs > 10_000 || remainingMs <= 0) return;
  runtime.finalTickPlayedForGameId = runtime.game.gameId;
  runtime.soundController.play(BOUNTY_HUNTING_FINAL_TICK_SOUND_PATH);
}

function renderBountyHuntingGame(now: number): void {
  const runtime = activeBountyHuntingPanel;
  if (!runtime) return;

  const context = runtime.context;
  context.setTransform(
    runtime.pixelRatio,
    0,
    0,
    runtime.pixelRatio,
    0,
    0
  );
  context.clearRect(0, 0, LAYOUT_WIDTH, LAYOUT_HEIGHT);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  runtime.hitboxes = [];

  if (runtime.compactMode) {
    drawBountyHuntingCompact(runtime, now);
    return;
  }

  switch (runtime.game.status) {
    case 'preparing':
      drawBountyHuntingLoading(runtime, now);
      break;
    case 'ready':
    case 'active':
    case 'countdown':
      drawBountyHuntingWanted(runtime, now);
      break;
    case 'roundOver':
      drawBountyHuntingRoundOver(runtime);
      break;
    case 'finished':
      drawBountyHuntingLedger(runtime);
      break;
  }
}

function drawBountyHuntingCompact(runtime: BountyHuntingPanelRuntime, now: number): void {
  const { context, game } = runtime;
  const currentRole = getBountyHuntingCurrentRole(game, runtime.currentUserId) || 'host';
  const opponentRole = currentRole === 'host' ? 'guest' : 'host';

  drawBountyHuntingCompactBackground(runtime);
  drawBountyHuntingAvatar(runtime, opponentRole, 31, 32, 14);
  drawBountyHuntingAvatar(runtime, currentRole, 417, 32, 14);

  context.textBaseline = 'middle';
  context.textAlign = 'left';
  context.fillStyle = PAPER_TEXT;
  context.font = `700 16px ${BARNUM_STACK}`;
  drawFittedText(context, tBountyHuntingBarnum('gamesBountyHuntingThem'), 52, 24, 63, 16, {
    fontStack: BARNUM_STACK,
    weight: 700
  });
  drawBountyHuntingMoneyText(context, game.scores[opponentRole] || 0, 52, 43, {
    align: 'left',
    amountFont: `1000 18px ${BARNUM_STACK}`,
    color: '#2f8d2e',
    dollarFont: `1000 13px ${BARNUM_STACK}`
  });

  context.textAlign = 'right';
  context.fillStyle = PAPER_TEXT;
  context.font = `700 16px ${BARNUM_STACK}`;
  drawFittedText(context, tBountyHuntingBarnum('gamesBountyHuntingYou'), 396, 24, 63, 16, {
    align: 'right',
    fontStack: BARNUM_STACK,
    weight: 700
  });
  drawBountyHuntingMoneyText(context, game.scores[currentRole] || 0, 396, 43, {
    align: 'right',
    amountFont: `1000 18px ${BARNUM_STACK}`,
    color: '#2f8d2e',
    dollarFont: `1000 13px ${BARNUM_STACK}`
  });

  drawBountyHuntingCompactStatus(runtime, now);
  drawBountyHuntingCompactBounties(runtime);
}

function drawBountyHuntingCompactBackground(runtime: BountyHuntingPanelRuntime): void {
  const { assets, context } = runtime;
  if (assets.liveScoreBg && runtime.game.status !== 'preparing') {
    context.drawImage(assets.liveScoreBg, 0, -1, LAYOUT_WIDTH, COMPACT_LAYOUT_HEIGHT + 2);
    return;
  }
  if (assets.paperBg) {
    context.drawImage(assets.paperBg, 0, 75, LAYOUT_WIDTH, COMPACT_LAYOUT_HEIGHT, 0, 0, LAYOUT_WIDTH, COMPACT_LAYOUT_HEIGHT);
    return;
  }
  drawRoundedRect(context, 0, 0, LAYOUT_WIDTH, COMPACT_LAYOUT_HEIGHT, 8, '#ead8ad', '#8c6d35');
}

function drawBountyHuntingCompactStatus(runtime: BountyHuntingPanelRuntime, now: number): void {
  const { context, game } = runtime;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  if (game.status === 'countdown') {
    const remainingMs = Math.max(0, game.phaseStartedAt + BOUNTY_HUNTING_COUNTDOWN_MS - Date.now());
    const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
    drawCenteredText(context, String(seconds), 224, 28, {
      color: RED_TEXT,
      font: `400 32px ${TEX_MEX_STACK}`,
      shadow: false
    });
    drawCenteredFittedText(context, tBountyHuntingBarnum('gamesBountyHuntingStarting'), 224, 49, 94, {
      color: PAPER_TEXT,
      font: `700 10px ${BARNUM_STACK}`,
      minFontSize: 8,
      shadow: false
    });
    return;
  }

  if (game.status === 'preparing') {
    drawCenteredFittedText(context, tBountyHuntingBartle('gamesBountyHuntingLoadingStatus'), 224, 32, 116, {
      color: PAPER_TEXT,
      font: `800 18px ${BARTLE_STACK}`,
      minFontSize: 11,
      shadow: false
    });
    return;
  }

  if (game.status === 'roundOver') {
    drawCenteredFittedText(context, tBountyHuntingBarnum('gamesBountyHuntingRoundOver'), 224, 32, 150, {
      color: PAPER_TEXT,
      font: `700 22px ${BARNUM_STACK}`,
      minFontSize: 13,
      shadow: false
    });
    return;
  }

  if (game.status === 'finished') {
    drawCenteredFittedText(context, getBountyHuntingWinnerText(runtime), 224, 32, 172, {
      color: PAPER_TEXT,
      font: `700 22px ${BARNUM_STACK}`,
      minFontSize: 13,
      shadow: false
    });
    return;
  }

  if (game.status === 'ready') {
    drawBountyHuntingCompactReadyButton(runtime, now);
    return;
  }

  const timerPulseAmount = getBountyHuntingTimerStartPulseAmount(runtime, now);
  const timerFontSize = 20 + Math.round(timerPulseAmount * 7);
  const timerColor = game.status === 'active' ? RED_TEXT : PAPER_TEXT;
  if (timerPulseAmount > 0) {
    context.save();
    context.globalAlpha = 0.28 + timerPulseAmount * 0.46;
    context.shadowBlur = 20 * timerPulseAmount;
    context.shadowColor = 'rgba(255, 236, 158, 0.95)';
    drawCenteredText(context, getBountyHuntingTimerText(game), 224, 26, {
      color: '#f7d88a',
      font: `800 ${timerFontSize + 3}px ${BARTLE_STACK}`,
      shadow: false
    });
    context.restore();
  }
  drawCenteredText(context, getBountyHuntingTimerText(game), 224, 26, {
    color: timerColor,
    font: `800 ${timerFontSize}px ${BARTLE_STACK}`,
    shadow: false
  });
  drawCenteredFittedText(context, tBountyHuntingBarnum('gamesBountyHuntingTimeRemaining'), 224, 46, 122, {
    color: PAPER_TEXT,
    font: `700 10px ${BARNUM_STACK}`,
    minFontSize: 8,
    shadow: false
  });
}

function drawBountyHuntingCompactReadyButton(runtime: BountyHuntingPanelRuntime, now: number): void {
  const { assets, context } = runtime;
  const image = assets.buttonBg;
  const hover = runtime.hoveredAction === 'ready';
  context.save();
  if (hover) context.globalAlpha = 0.86;
  if (image) {
    context.drawImage(image, COMPACT_READY_BUTTON_RECT.x, COMPACT_READY_BUTTON_RECT.y, COMPACT_READY_BUTTON_RECT.width, COMPACT_READY_BUTTON_RECT.height);
  } else {
    drawRoundedRect(
      context,
      COMPACT_READY_BUTTON_RECT.x,
      COMPACT_READY_BUTTON_RECT.y + 4,
      COMPACT_READY_BUTTON_RECT.width,
      COMPACT_READY_BUTTON_RECT.height - 9,
      999,
      '#b8a177',
      '#7f6a42'
    );
  }
  context.restore();

  const flashAmount = getBountyHuntingReadyButtonFlashAmount(runtime, now);
  if (flashAmount > 0) drawBountyHuntingButtonFlash(context, COMPACT_READY_BUTTON_RECT, flashAmount, image);

  drawCenteredText(
    context,
    tBountyHuntingBartle('gamesBountyHuntingReady'),
    COMPACT_READY_BUTTON_RECT.x + COMPACT_READY_BUTTON_RECT.width / 2,
    COMPACT_READY_BUTTON_RECT.y + COMPACT_READY_BUTTON_RECT.height / 2,
    {
      color: PAPER_TEXT,
      font: `800 12px ${BARTLE_STACK}`,
      maxWidth: COMPACT_READY_BUTTON_RECT.width - 36,
      minFontSize: 8,
      shadow: false
    }
  );
  drawBountyHuntingReadyStack(runtime, COMPACT_READY_BUTTON_RECT);
  runtime.hitboxes.push({ action: 'ready', rect: COMPACT_READY_BUTTON_RECT });
}

function drawBountyHuntingCompactBounties(runtime: BountyHuntingPanelRuntime): void {
  if (runtime.game.status === 'preparing') return;
  const displayBounties = getBountyHuntingDisplayBounties(runtime.game.bounties);
  displayBounties.forEach((bounty, index) => drawBountyHuntingCompactBounty(runtime, bounty, index));
}

function drawBountyHuntingCompactBounty(
  runtime: BountyHuntingPanelRuntime,
  bounty: PublicBountyHuntingBounty,
  index: number
): void {
  const { context } = runtime;
  const column = index % COMPACT_BOUNTY_COLUMNS;
  const row = Math.floor(index / COMPACT_BOUNTY_COLUMNS);
  const x = COMPACT_BOUNTY_CHIP_X + column * (COMPACT_BOUNTY_CHIP_WIDTH + COMPACT_BOUNTY_CHIP_GAP);
  const y = COMPACT_BOUNTY_CHIP_Y + row * (COMPACT_BOUNTY_CHIP_HEIGHT + COMPACT_BOUNTY_CHIP_GAP);
  const claimed = Boolean(bounty.claim);

  context.save();
  context.globalAlpha = claimed ? 0.66 : 1;
  drawRoundedRect(
    context,
    x,
    y,
    COMPACT_BOUNTY_CHIP_WIDTH,
    COMPACT_BOUNTY_CHIP_HEIGHT,
    3,
    claimed ? 'rgba(240, 218, 174, 0.48)' : 'rgba(255, 250, 235, 0.62)',
    claimed ? '#8a6f4a' : '#8c6d35'
  );

  drawBountyHuntingMoneyText(context, bounty.amount, x + 7, y + 15, {
    align: 'left',
    amountFont: `1000 15px ${BARNUM_STACK}`,
    color: RED_TEXT,
    dollarFont: `1000 10px ${BARNUM_STACK}`
  });

  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillStyle = PAPER_TEXT;
  context.font = '400 10px Roboto, Arial, sans-serif';
  drawFittedText(
    context,
    getBountyHuntingCompactBountyLabel(bounty),
    x + 47,
    y + 14,
    76,
    10
  );

  context.restore();

  drawBountyHuntingCompactBountyStamp(runtime, claimed, x, y);

  if (bounty.claim) {
    drawBountyHuntingAvatar(runtime, bounty.claim.role, x + COMPACT_BOUNTY_CHIP_WIDTH - 8, y + COMPACT_BOUNTY_CHIP_HEIGHT - 4, 7);
  }
}

function drawBountyHuntingCompactBountyStamp(
  runtime: BountyHuntingPanelRuntime,
  claimed: boolean,
  x: number,
  y: number
): void {
  const { assets, context } = runtime;
  context.save();
  if (claimed) {
    context.translate(x + 118, y + 11);
    context.rotate(-0.2);
    if (assets.bountyClaimedStamp) {
      context.drawImage(
        assets.bountyClaimedStamp,
        -COMPACT_BOUNTY_CLAIMED_STAMP_WIDTH / 2,
        -COMPACT_BOUNTY_CLAIMED_STAMP_HEIGHT / 2,
        COMPACT_BOUNTY_CLAIMED_STAMP_WIDTH,
        COMPACT_BOUNTY_CLAIMED_STAMP_HEIGHT
      );
    } else {
      drawCompactBountyStampFallback(context, tBountyHuntingBarnum('gamesBountyHuntingClaimed'), -24, -8, '#a8302d');
    }
  } else if (assets.bountyOpenStamp) {
    context.drawImage(
      assets.bountyOpenStamp,
      x + 94,
      y - 7,
      COMPACT_BOUNTY_OPEN_STAMP_WIDTH,
      COMPACT_BOUNTY_OPEN_STAMP_HEIGHT
    );
  } else {
    drawCompactBountyStampFallback(
      context,
      tBountyHuntingBarnum('gamesBountyHuntingOpen'),
      x + COMPACT_BOUNTY_CHIP_WIDTH - 39,
      y + 6,
      GREEN_STAMP
    );
  }
  context.restore();
}

function drawCompactBountyStampFallback(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string
): void {
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = color;
  context.font = `700 9px ${BARNUM_STACK}`;
  drawCenteredFittedText(context, text, x + 21, y + 8, 38, {
    color,
    font: `700 9px ${BARNUM_STACK}`,
    minFontSize: 7,
    shadow: false
  });
}

function getBountyHuntingCompactBountyLabel(bounty: PublicBountyHuntingBounty): string {
  switch (bounty.matcher.kind) {
    case 'allCaps':
      return t('gamesBountyHuntingCompactAllCaps');
    case 'channelMemberAuthor':
      return t('gamesBountyHuntingCompactMember');
    case 'channelOwnerAuthor':
      return t('gamesBountyHuntingCompactOwner');
    case 'customEmoji':
      return t('gamesBountyHuntingCompactCustomEmoji');
    case 'emojiCount':
      return t('gamesBountyHuntingCompactEmojiCount', { count: bounty.matcher.min });
    case 'mention':
      return t('gamesBountyHuntingCompactMention');
    case 'moderatorAuthor':
      return t('gamesBountyHuntingCompactModerator');
    case 'number':
      return t('gamesBountyHuntingCompactNumber');
    case 'onlyEmojis':
      return t('gamesBountyHuntingCompactOnlyEmojis');
    case 'question':
      return t('gamesBountyHuntingCompactQuestion');
    case 'superChat':
      return t('gamesBountyHuntingCompactSuperChat');
    case 'topFanAuthor':
      return t('gamesBountyHuntingCompactTopFan');
    case 'verifiedAuthor':
      return t('gamesBountyHuntingCompactVerified');
  }
}

function drawBountyHuntingLoading(runtime: BountyHuntingPanelRuntime, now: number): void {
  const { context } = runtime;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, LAYOUT_WIDTH, LAYOUT_HEIGHT);

  if (runtime.assets.logo) {
    context.drawImage(runtime.assets.logo, 118, 50 + LOADING_SCREEN_OFFSET_Y, 212, 318);
  } else {
    drawBountyHuntingLoadingLogoFallback(context);
  }

  drawCenteredFittedText(context, t('gamesBountyHuntingLoading'), 224, 398 + LOADING_SCREEN_OFFSET_Y, 220, {
    color: '#444',
    font: '400 22px Roboto, Arial, sans-serif',
    minFontSize: 14,
    shadow: false
  });
  drawGameLoadingSpinner(context, {
    color: '#f20d0d',
    lineWidth: 3,
    now,
    radius: 9,
    trackColor: 'rgba(242, 13, 13, 0.14)',
    x: 224,
    y: 424 + LOADING_SCREEN_OFFSET_Y
  });
}

function drawBountyHuntingLoadingLogoFallback(context: CanvasRenderingContext2D): void {
  drawCenteredText(context, 'THE', 224, 85 + LOADING_SCREEN_OFFSET_Y, {
    color: '#f20d0d',
    font: `700 43px ${BARNUM_STACK}`,
    shadow: false
  });
  drawCenteredText(context, 'Wild', 224, 132 + LOADING_SCREEN_OFFSET_Y, {
    color: '#f20d0d',
    font: `700 71px ${BARNUM_STACK}`,
    shadow: false
  });
  drawCenteredText(context, 'WILD', 224, 190 + LOADING_SCREEN_OFFSET_Y, {
    color: '#f20d0d',
    font: `800 76px ${BARNUM_STACK}`,
    shadow: false
  });
  drawCenteredText(context, 'CHAT', 224, 274 + LOADING_SCREEN_OFFSET_Y, {
    color: '#f20d0d',
    font: `800 112px ${BARNUM_STACK}`,
    shadow: false
  });
  drawCenteredText(context, 'RELOADED', 224, 328 + LOADING_SCREEN_OFFSET_Y, {
    color: '#050505',
    font: `800 33px ${TEX_MEX_STACK}`,
    shadow: false
  });
}

function drawBountyHuntingWanted(runtime: BountyHuntingPanelRuntime, now: number): void {
  drawBountyHuntingPaper(runtime);
  const title = tBountyHuntingTexMex('gamesBountyHuntingWanted');
  drawBountyHuntingTitle(runtime, title, 18, 90, TEX_MEX_STACK, {
    decorOffsetY: 7,
    maxTextWidth: 230,
    minFontSize: 42,
    textOffsetY: 8,
    weight: 400
  });
  drawBountyHuntingLiveScore(runtime, now);
  const displayBounties = getBountyHuntingDisplayBounties(runtime.game.bounties);
  displayBounties.forEach((bounty, index) => drawBountyHuntingBounty(runtime, bounty, index));
  displayBounties.forEach((bounty, index) => drawBountyHuntingBountyClaimAvatar(runtime, bounty, index));
  drawBountyHuntingActionButton(
    runtime,
    tBountyHuntingBartle('gamesBountyHuntingReady'),
    runtime.game.status === 'ready' ? 'ready' : null,
    {
      flashAmount: getBountyHuntingReadyButtonFlashAmount(runtime, now),
      readyStack: true
    }
  );
  if (runtime.game.status === 'countdown') drawBountyHuntingCountdown(runtime);
}

function getBountyHuntingDisplayBounties(
  bounties: readonly PublicBountyHuntingBounty[]
): PublicBountyHuntingBounty[] {
  return bounties
    .map((bounty, index) => ({ bounty, index }))
    .sort((left, right) => left.bounty.amount - right.bounty.amount || left.index - right.index)
    .map(({ bounty }) => bounty);
}

function drawBountyHuntingCountdown(runtime: BountyHuntingPanelRuntime): void {
  const { context, game } = runtime;
  const remainingMs = Math.max(0, game.phaseStartedAt + BOUNTY_HUNTING_COUNTDOWN_MS - Date.now());
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  context.save();
  context.globalAlpha = 0.82;
  context.fillStyle = '#2f261e';
  context.beginPath();
  context.arc(224, 224, 57, 0, Math.PI * 2);
  context.fill();
  context.restore();
  drawCenteredText(context, String(seconds), 224, 228, {
    color: '#f2ddb6',
    font: `400 82px ${TEX_MEX_STACK}`
  });
}

function drawBountyHuntingRoundOver(runtime: BountyHuntingPanelRuntime): void {
  const { assets, context } = runtime;
  if (assets.roundOverBg) {
    context.drawImage(assets.roundOverBg, 0, 0, LAYOUT_WIDTH, LAYOUT_HEIGHT);
  } else {
    drawBountyHuntingPaper(runtime);
  }

  if (assets.roundOverTitle) {
    context.drawImage(
      assets.roundOverTitle,
      ROUND_OVER_TITLE_IMAGE_X,
      ROUND_OVER_TITLE_IMAGE_Y,
      ROUND_OVER_TITLE_IMAGE_WIDTH,
      ROUND_OVER_TITLE_IMAGE_HEIGHT
    );
  } else {
    const title = tBountyHuntingBarnum('gamesBountyHuntingRoundOver');
    drawCenteredFittedText(context, title, 224, ROUND_OVER_FALLBACK_TITLE_Y, 330, {
      color: '#f6deb2',
      font: `700 72px ${BARNUM_STACK}`,
      minFontSize: 36
    });
  }
  drawBountyHuntingActionButton(runtime, tBountyHuntingBartle('gamesBountyHuntingLoadingStatus'), null, {
    darker: true,
    labelColor: ROUND_OVER_BUTTON_LABEL_COLOR,
    y: ROUND_OVER_BUTTON_Y
  });
}

function drawBountyHuntingLedger(runtime: BountyHuntingPanelRuntime): void {
  const { context } = runtime;
  drawBountyHuntingPaper(runtime);
  const title = tBountyHuntingTexMex('gamesBountyHuntingLedger');
  drawBountyHuntingTitle(runtime, title, LEDGER_TITLE_Y, LEDGER_TITLE_FONT_SIZE, TEX_MEX_STACK, {
    decorOffsetY: 7,
    maxTextWidth: 230,
    minFontSize: 30,
    textOffsetY: 8,
    weight: 400
  });

  context.fillStyle = RED_TEXT;
  context.font = `700 13px ${BARNUM_STACK}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  drawFittedTextBlock(
    context,
    tBountyHuntingBarnum('gamesBountyHuntingBountiesClaimed'),
    LEDGER_HEADER_X,
    LEDGER_HEADER_TOP_Y,
    74,
    {
      color: RED_TEXT,
      font: `700 13px ${BARNUM_STACK}`,
      lineHeight: LEDGER_HEADER_LINE_HEIGHT,
      maxLines: 2,
      minFontSize: 9
    }
  );
  drawFittedTextBlock(
    context,
    tBountyHuntingBarnum('gamesBountyHuntingMoneyEarned'),
    LEDGER_MONEY_X,
    LEDGER_HEADER_TOP_Y,
    74,
    {
      color: RED_TEXT,
      font: `700 13px ${BARNUM_STACK}`,
      lineHeight: LEDGER_HEADER_LINE_HEIGHT,
      maxLines: 2,
      minFontSize: 9
    }
  );

  const rows = getBountyHuntingLedgerRows(runtime);
  rows.forEach((row, index) => {
    const y = LEDGER_ROW_Y[index];
    drawBountyHuntingDivider(runtime, y - LEDGER_ROW_DIVIDER_OFFSET_Y);
    drawBountyHuntingRankedAvatar(runtime, row.role, index + 1, LEDGER_AVATAR_X, y - 3);
    context.fillStyle = PAPER_TEXT;
    context.textAlign = 'left';
    context.font = `700 34px ${BARNUM_STACK}`;
    drawFittedText(context, row.label, LEDGER_LABEL_X, y, 118, 34, {
      fontStack: BARNUM_STACK,
      minFontSize: 20,
      weight: 700
    });
    context.textAlign = 'center';
    context.font = `1000 36px ${BARNUM_STACK}`;
    context.fillText(String(row.claims), LEDGER_BOUNTIES_X, y);
    drawBountyHuntingMoneyText(context, row.money, LEDGER_MONEY_X, y, {
      align: 'center',
      amountFont: `1000 36px ${BARNUM_STACK}`,
      color: PAPER_TEXT,
      dollarFont: `1000 24px ${BARNUM_STACK}`
    });
  });

  if (runtime.assets.woodenRibbon) {
    context.drawImage(runtime.assets.woodenRibbon, 42, LEDGER_RIBBON_Y, 364, 72);
  } else {
    drawRoundedRect(context, 42, LEDGER_RIBBON_Y + 10, 364, 52, 8, '#7f3d20', '#512411');
  }
  drawCenteredFittedText(context, getBountyHuntingWinnerText(runtime), 224, LEDGER_WINNER_Y, 300, {
    color: '#e9ddbf',
    font: `700 29px ${BARNUM_STACK}`,
    minFontSize: 18
  });

  drawBountyHuntingActionButton(
    runtime,
    tBountyHuntingBartle('gamesBountyHuntingClose'),
    'close',
    { y: LEDGER_CLOSE_BUTTON_Y }
  );
}

function drawBountyHuntingPaper(runtime: BountyHuntingPanelRuntime): void {
  const { assets, context } = runtime;
  if (assets.paperBg) {
    context.drawImage(assets.paperBg, 0, 0, LAYOUT_WIDTH, LAYOUT_HEIGHT);
    return;
  }

  context.fillStyle = '#e8d1a2';
  context.fillRect(0, 0, LAYOUT_WIDTH, LAYOUT_HEIGHT);
  context.strokeStyle = '#8d6a34';
  context.lineWidth = 2;
  context.strokeRect(18, 18, LAYOUT_WIDTH - 36, LAYOUT_HEIGHT - 36);
}

function drawBountyHuntingTitle(
  runtime: BountyHuntingPanelRuntime,
  text: string,
  y: number,
  fontSize: number,
  fontStack = BARNUM_STACK,
  options: {
    decorOffsetY?: number;
    maxTextWidth?: number;
    minFontSize?: number;
    textOffsetY?: number;
    weight?: number;
  } = {}
): void {
  const { assets, context } = runtime;
  const fontWeight = options.weight ?? 800;
  const font = `${fontWeight} ${fontSize}px ${fontStack}`;
  const fittedTitle = getFittedCanvasText(
    context,
    text,
    font,
    options.maxTextWidth ?? 232,
    options.minFontSize ?? 28
  );
  const decorWidth = 98;
  const decorGap = 32;
  const decorEdgeInset = 8;
  const decorY = y - 4 + (options.decorOffsetY ?? 0);
  context.save();
  context.font = fittedTitle.font;
  const titleWidth = context.measureText(fittedTitle.text).width;
  context.restore();
  const leftDecorX = Math.max(
    decorEdgeInset,
    Math.round((LAYOUT_WIDTH / 2) - (titleWidth / 2) - decorGap - decorWidth)
  );
  const rightDecorX = Math.min(
    LAYOUT_WIDTH - decorWidth - decorEdgeInset,
    Math.round((LAYOUT_WIDTH / 2) + (titleWidth / 2) + decorGap)
  );
  if (assets.titleDecorLeft) context.drawImage(assets.titleDecorLeft, leftDecorX, decorY, decorWidth, 44);
  if (assets.titleDecorRight) context.drawImage(assets.titleDecorRight, rightDecorX, decorY, decorWidth, 44);
  drawCenteredText(context, fittedTitle.text, 224, y + 20 + (options.textOffsetY ?? 0), {
    color: PAPER_TEXT,
    font: fittedTitle.font,
    shadow: false
  });
}

function drawBountyHuntingLiveScore(runtime: BountyHuntingPanelRuntime, now: number): void {
  const { assets, context, game } = runtime;
  const currentRole = getBountyHuntingCurrentRole(game, runtime.currentUserId) || 'host';
  const opponentRole = currentRole === 'host' ? 'guest' : 'host';
  const offsetY = LIVE_SCORE_Y_OFFSET;
  if (assets.liveScoreBg) {
    context.drawImage(assets.liveScoreBg, 37, 83 + offsetY, 374, 66);
  } else {
    drawRoundedRect(context, 37, 83 + offsetY, 374, 66, 0, 'rgba(255, 250, 235, 0.62)', '#8c6d35');
  }

  drawBountyHuntingAvatar(runtime, opponentRole, 79, 116 + offsetY, LIVE_SCORE_AVATAR_RADIUS);
  drawBountyHuntingAvatar(runtime, currentRole, 369, 116 + offsetY, LIVE_SCORE_AVATAR_RADIUS);

  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillStyle = PAPER_TEXT;
  context.font = `700 18px ${BARNUM_STACK}`;
  drawFittedText(
    context,
    tBountyHuntingBarnum('gamesBountyHuntingThem'),
    LIVE_SCORE_LEFT_TEXT_X,
    LIVE_SCORE_NAME_Y + offsetY,
    75,
    18,
    {
      fontStack: BARNUM_STACK,
      weight: 700
    }
  );
  drawBountyHuntingMoneyText(context, game.scores[opponentRole] || 0, LIVE_SCORE_LEFT_TEXT_X, LIVE_SCORE_MONEY_Y + offsetY, {
    align: 'left',
    amountFont: `1000 20px ${BARNUM_STACK}`,
    color: '#2f8d2e',
    dollarFont: `1000 15px ${BARNUM_STACK}`
  });

  context.textAlign = 'right';
  context.fillStyle = PAPER_TEXT;
  context.font = `700 18px ${BARNUM_STACK}`;
  drawFittedText(
    context,
    tBountyHuntingBarnum('gamesBountyHuntingYou'),
    LIVE_SCORE_RIGHT_TEXT_X,
    LIVE_SCORE_NAME_Y + offsetY,
    75,
    18,
    {
      align: 'right',
      fontStack: BARNUM_STACK,
      weight: 700
    }
  );
  drawBountyHuntingMoneyText(context, game.scores[currentRole] || 0, LIVE_SCORE_RIGHT_TEXT_X, LIVE_SCORE_MONEY_Y + offsetY, {
    align: 'right',
    amountFont: `1000 20px ${BARNUM_STACK}`,
    color: '#2f8d2e',
    dollarFont: `1000 15px ${BARNUM_STACK}`
  });

  context.textAlign = 'center';
  const timerPulseAmount = getBountyHuntingTimerStartPulseAmount(runtime, now);
  const timerFontSize = 19 + Math.round(timerPulseAmount * 8);
  context.fillStyle = game.status === 'active' ? RED_TEXT : PAPER_TEXT;
  context.font = `800 ${timerFontSize}px ${BARTLE_STACK}`;
  if (timerPulseAmount > 0) {
    context.save();
    context.globalAlpha = 0.28 + timerPulseAmount * 0.46;
    context.shadowBlur = 20 * timerPulseAmount;
    context.shadowColor = 'rgba(255, 236, 158, 0.95)';
    context.fillStyle = '#f7d88a';
    context.font = `800 ${timerFontSize + 3}px ${BARTLE_STACK}`;
    context.fillText(getBountyHuntingTimerText(game), 224, 111 + offsetY);
    context.restore();
  }
  context.fillText(getBountyHuntingTimerText(game), 224, 111 + offsetY);
  context.font = `700 11px ${BARNUM_STACK}`;
  drawCenteredFittedText(context, tBountyHuntingBarnum('gamesBountyHuntingTimeRemaining'), 224, 129 + offsetY, 122, {
    color: context.fillStyle as string,
    font: `700 11px ${BARNUM_STACK}`,
    minFontSize: 8,
    shadow: false
  });
}

function drawBountyHuntingBounty(
  runtime: BountyHuntingPanelRuntime,
  bounty: PublicBountyHuntingBounty,
  index: number
): void {
  const { assets, context } = runtime;
  const y = BOUNTY_LIST_Y + index * (BOUNTY_ROW_HEIGHT + BOUNTY_ROW_GAP);
  const claimed = Boolean(bounty.claim);
  context.save();
  context.globalAlpha = claimed ? CLAIMED_BOUNTY_ROW_ALPHA : 1;
  if (assets.bountyDescBg) {
    context.drawImage(assets.bountyDescBg, BOUNTY_LIST_X, y, BOUNTY_ROW_WIDTH, BOUNTY_ROW_HEIGHT);
  } else {
    drawRoundedRect(context, BOUNTY_LIST_X, y, BOUNTY_ROW_WIDTH, BOUNTY_ROW_HEIGHT, 0, 'rgba(255, 250, 235, 0.48)', '#896832');
  }

  context.textBaseline = 'middle';
  context.textAlign = 'right';
  drawBountyHuntingMoneyText(context, bounty.amount, BOUNTY_AMOUNT_X, y + 21, {
    align: 'right',
    amountFont: `1000 25px ${BARNUM_STACK}`,
    color: RED_TEXT,
    dollarFont: `1000 17px ${BARNUM_STACK}`
  });

  context.textAlign = 'left';
  context.fillStyle = PAPER_TEXT;
  context.font = '400 13px Roboto, Arial, sans-serif';
  drawFittedText(
    context,
    getBountyHuntingBountyDescription(bounty),
    BOUNTY_DESCRIPTION_X,
    y + 20,
    (332 + BOUNTY_STAMP_X_OFFSET) - BOUNTY_DESCRIPTION_X - BOUNTY_DESCRIPTION_STAMP_GAP,
    13,
    {
      fontStack: 'Roboto, Arial, sans-serif',
      minFontSize: 10,
      weight: 400
    }
  );
  context.restore();

  if (bounty.claim) {
    drawClaimedStamp(runtime, y);
  } else {
    drawOpenStamp(runtime, y);
  }
}

function drawBountyHuntingBountyClaimAvatar(
  runtime: BountyHuntingPanelRuntime,
  bounty: PublicBountyHuntingBounty,
  index: number
): void {
  if (!bounty.claim) return;
  const y = BOUNTY_LIST_Y + index * (BOUNTY_ROW_HEIGHT + BOUNTY_ROW_GAP);
  drawBountyHuntingAvatar(runtime, bounty.claim.role, 386, y + 34, 15);
}

function drawOpenStamp(runtime: BountyHuntingPanelRuntime, y: number): void {
  const { assets, context } = runtime;
  if (assets.bountyOpenStamp) {
    context.drawImage(assets.bountyOpenStamp, 332 + BOUNTY_STAMP_X_OFFSET, y - 11, 70, 62);
    return;
  }
  drawStampFallback(
    context,
    tBountyHuntingBarnum('gamesBountyHuntingOpen'),
    339 + BOUNTY_STAMP_X_OFFSET,
    y + 6,
    GREEN_STAMP
  );
}

function drawClaimedStamp(runtime: BountyHuntingPanelRuntime, y: number): void {
  const { assets, context } = runtime;
  context.save();
  context.translate(360 + BOUNTY_STAMP_X_OFFSET, y + 15);
  context.rotate(-0.22);
  if (assets.bountyClaimedStamp) {
    context.drawImage(assets.bountyClaimedStamp, -30, -23, 60, 46);
  } else {
    drawStampFallback(
      context,
      tBountyHuntingBarnum('gamesBountyHuntingClaimed'),
      -31,
      -13,
      '#b7312d'
    );
  }
  context.restore();
}

function drawStampFallback(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string
): void {
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.strokeRect(x, y, 56, 26);
  context.fillStyle = color;
  context.textAlign = 'center';
  context.font = `700 14px ${BARNUM_STACK}`;
  drawCenteredFittedText(context, text, x + 28, y + 15, 50, {
    color,
    font: `700 14px ${BARNUM_STACK}`,
    minFontSize: 8,
    shadow: false
  });
}

function drawBountyHuntingActionButton(
  runtime: BountyHuntingPanelRuntime,
  label: string,
  action: 'close' | 'ready' | null,
  options: { darker?: boolean; flashAmount?: number; labelColor?: string; readyStack?: boolean; y?: number } = {}
): void {
  const { assets, context } = runtime;
  const rect = { ...BUTTON_RECT, y: options.y ?? BUTTON_RECT.y };
  const image = options.darker ? assets.buttonBgDarker : assets.buttonBg;
  const hover = action && runtime.hoveredAction === action;
  context.save();
  if (hover) context.globalAlpha = 0.86;
  if (image) {
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  } else {
    drawRoundedRect(context, rect.x, rect.y + 6, rect.width, rect.height - 14, 999, '#b8a177', '#7f6a42');
  }
  context.restore();
  if (options.flashAmount && options.flashAmount > 0) {
    drawBountyHuntingButtonFlash(context, rect, options.flashAmount, image);
  }
  drawCenteredText(context, label, rect.x + rect.width / 2, rect.y + 29, {
    color: options.labelColor ?? PAPER_TEXT,
    font: `800 14px ${BARTLE_STACK}`,
    shadow: false
  });
  if (options.readyStack) drawBountyHuntingReadyStack(runtime, rect);
  if (action) runtime.hitboxes.push({ action, rect });
}

function drawBountyHuntingReadyStack(runtime: BountyHuntingPanelRuntime, rect: Rect): void {
  const readyRoles = BOUNTY_HUNTING_PLAYER_ROLES.filter((role) => runtime.game.readyPlayers[role]);
  readyRoles.forEach((role, index) => {
    const stackIndex = readyRoles.length - 1 - index;
    drawBountyHuntingAvatar(
      runtime,
      role,
      rect.x + rect.width - READY_STACK_AVATAR_OFFSET_X - stackIndex * READY_STACK_AVATAR_OVERLAP,
      rect.y + rect.height / 2,
      READY_STACK_AVATAR_RADIUS
    );
  });
}

function drawBountyHuntingButtonFlash(
  context: CanvasRenderingContext2D,
  rect: Rect,
  amount: number,
  image: HTMLImageElement | null
): void {
  context.save();
  context.shadowBlur = 18 * amount;
  context.shadowColor = 'rgba(255, 238, 156, 0.95)';
  if (image) {
    context.globalAlpha = 0.68 + amount * 0.32;
    context.globalCompositeOperation = 'lighter';
    context.filter = `brightness(${1.55 + amount * 1.85}) saturate(${1.2 + amount * 0.55})`;
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    context.globalAlpha = 0.38 + amount * 0.42;
    context.shadowBlur = 0;
    context.filter = `brightness(${2.3 + amount * 1.7}) saturate(1.45)`;
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  } else {
    context.globalAlpha = 0.18 + amount * 0.38;
    drawRoundedRect(context, rect.x, rect.y, rect.width, rect.height, 999, '#fff1a8');
  }
  context.restore();
}

function getBountyHuntingReadyButtonFlashAmount(runtime: BountyHuntingPanelRuntime, now: number): number {
  const remainingMs = runtime.readyButtonFlashUntil - now;
  if (remainingMs <= 0) return 0;
  return Math.min(1, remainingMs / READY_BUTTON_FLASH_MS);
}

function getBountyHuntingTimerStartPulseAmount(runtime: BountyHuntingPanelRuntime, now: number): number {
  const remainingMs = runtime.timerStartPulseUntil - now;
  if (remainingMs <= 0) return 0;
  const progress = 1 - Math.min(1, remainingMs / TIMER_START_PULSE_MS);
  return Math.sin(progress * Math.PI);
}

function hasNewBountyHuntingReadyPlayer(
  previousGame: PublicBountyHuntingGame,
  nextGame: PublicBountyHuntingGame
): boolean {
  return BOUNTY_HUNTING_PLAYER_ROLES.some((role) => !previousGame.readyPlayers[role] && Boolean(nextGame.readyPlayers[role]));
}

function drawBountyHuntingRankedAvatar(
  runtime: BountyHuntingPanelRuntime,
  role: BountyHuntingPlayerRole,
  rank: number,
  x: number,
  y: number
): void {
  drawBountyHuntingAvatar(runtime, role, x, y, 28);
  if (runtime.assets.avatarRing) {
    runtime.context.drawImage(runtime.assets.avatarRing, x - 31, y - 32, 62, 64);
  }
  const star = rank === 1 ? runtime.assets.goldStar : runtime.assets.silverStar;
  if (star) {
    runtime.context.drawImage(
      star,
      x - LEDGER_RANK_STAR_X_OFFSET,
      y - LEDGER_RANK_STAR_Y_OFFSET,
      LEDGER_RANK_STAR_WIDTH,
      LEDGER_RANK_STAR_HEIGHT
    );
  } else {
    drawStarFallback(runtime.context, x - 30, y - 32, rank === 1 ? '#d8a51d' : '#b6b8bc');
  }
  runtime.context.fillStyle = PAPER_TEXT;
  runtime.context.textAlign = 'center';
  runtime.context.font = `800 ${LEDGER_RANK_TEXT_FONT_SIZE}px ${BARNUM_STACK}`;
  runtime.context.fillText(String(rank), x - LEDGER_RANK_TEXT_X_OFFSET, y - LEDGER_RANK_TEXT_Y_OFFSET);
}

function drawBountyHuntingAvatar(
  runtime: BountyHuntingPanelRuntime,
  role: BountyHuntingPlayerRole,
  x: number,
  y: number,
  radius: number
): void {
  const player = runtime.game.players[role];
  drawPlaygroundCanvasAvatar(runtime.context, player, x, y, radius);
}

function drawBountyHuntingDivider(runtime: BountyHuntingPanelRuntime, y: number): void {
  if (runtime.assets.divider) {
    runtime.context.drawImage(runtime.assets.divider, LEDGER_DIVIDER_X, y, LEDGER_DIVIDER_WIDTH, 10);
    return;
  }
  runtime.context.strokeStyle = '#796633';
  runtime.context.lineWidth = 2;
  runtime.context.beginPath();
  runtime.context.moveTo(LEDGER_DIVIDER_X, y + 5);
  runtime.context.lineTo(LEDGER_DIVIDER_X + LEDGER_DIVIDER_WIDTH, y + 5);
  runtime.context.stroke();
}

function drawStarFallback(context: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  context.fillStyle = color;
  context.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + point * Math.PI / 5;
    const radius = point % 2 === 0 ? 21 : 9;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (point === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
  context.fill();
}

function drawCenteredText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: {
    color: string;
    font: string;
    maxWidth?: number;
    minFontSize?: number;
    shadow?: boolean;
  }
): void {
  const fitted = options.maxWidth
    ? getFittedCanvasText(context, text, options.font, options.maxWidth, options.minFontSize ?? 8)
    : { font: options.font, text };
  context.save();
  context.font = fitted.font;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  if (options.shadow !== false) {
    context.shadowBlur = 0;
    context.shadowColor = SHADOW;
    context.shadowOffsetX = 4;
    context.shadowOffsetY = 4;
  }
  context.fillStyle = options.color;
  context.fillText(fitted.text, x, y);
  context.restore();
}

function drawCenteredFittedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  options: {
    color: string;
    font: string;
    minFontSize?: number;
    shadow?: boolean;
  }
): void {
  drawCenteredText(context, text, x, y, {
    ...options,
    maxWidth
  });
}

function drawBountyHuntingMoneyText(
  context: CanvasRenderingContext2D,
  amount: number,
  x: number,
  y: number,
  options: {
    align: CanvasTextAlign;
    amountFont: string;
    color: string;
    dollarFont: string;
  }
): void {
  const amountText = String(amount);
  context.save();
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillStyle = options.color;

  context.font = options.dollarFont;
  const dollarWidth = context.measureText('$').width;
  context.font = options.amountFont;
  const amountWidth = context.measureText(amountText).width;
  const totalWidth = dollarWidth + amountWidth;
  const startX = options.align === 'right'
    ? x - totalWidth
    : options.align === 'center'
      ? x - totalWidth / 2
      : x;
  const dollarY = y - getBountyHuntingDollarSuperscriptOffset(options.amountFont);

  context.font = options.dollarFont;
  context.fillText('$', startX, dollarY);
  context.font = options.amountFont;
  context.fillText(amountText, startX + dollarWidth, y);
  context.restore();
}

function getBountyHuntingDollarSuperscriptOffset(amountFont: string): number {
  return Math.max(4, Math.round(getBountyHuntingFontPixelSize(amountFont) * 0.22));
}

function getBountyHuntingFontPixelSize(font: string): number {
  const match = /(\d+(?:\.\d+)?)px/.exec(font);
  return match ? Number(match[1]) : 20;
}

function drawFittedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  options: {
    align?: CanvasTextAlign;
    fontStack?: string;
    minFontSize?: number;
    weight?: number;
  } = {}
): void {
  const fontStack = options.fontStack ?? 'Roboto, Arial, sans-serif';
  const weight = options.weight ?? 400;
  const fitted = getFittedCanvasText(
    context,
    text,
    `${weight} ${fontSize}px ${fontStack}`,
    maxWidth,
    options.minFontSize ?? 8
  );
  context.save();
  context.font = fitted.font;
  if (options.align) context.textAlign = options.align;
  context.textBaseline = 'middle';
  context.fillText(fitted.text, x, y);
  context.restore();
}

function drawFittedTextBlock(
  context: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  firstLineY: number,
  maxWidth: number,
  options: {
    color: string;
    font: string;
    lineHeight: number;
    maxLines: number;
    minFontSize: number;
  }
): void {
  context.save();
  context.fillStyle = options.color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  const baseFontSize = getBountyHuntingFontPixelSize(options.font);
  let fontSize = baseFontSize;
  let font = options.font;
  let lines = wrapCanvasText(context, text, font, maxWidth, options.maxLines);
  while (
    fontSize > options.minFontSize &&
    (lines.length > options.maxLines || lines.some((line) => getCanvasTextWidth(context, line, font) > maxWidth))
  ) {
    fontSize -= 1;
    font = setCanvasFontPixelSize(options.font, fontSize);
    lines = wrapCanvasText(context, text, font, maxWidth, options.maxLines);
  }

  const visibleLines = lines.slice(0, options.maxLines);
  if (visibleLines.length && lines.length > options.maxLines) {
    visibleLines[visibleLines.length - 1] = ellipsizeCanvasText(
      context,
      visibleLines[visibleLines.length - 1],
      font,
      maxWidth
    );
  }
  context.font = font;
  visibleLines.forEach((line, index) => {
    const fittedLine = getCanvasTextWidth(context, line, font) <= maxWidth
      ? line
      : ellipsizeCanvasText(context, line, font, maxWidth);
    context.fillText(fittedLine, centerX, firstLineY + index * options.lineHeight);
  });
  context.restore();
}

function getFittedCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  font: string,
  maxWidth: number,
  minFontSize: number
): { font: string; text: string } {
  let fontSize = getBountyHuntingFontPixelSize(font);
  let fittedFont = font;
  while (fontSize > minFontSize && getCanvasTextWidth(context, text, fittedFont) > maxWidth) {
    fontSize -= 1;
    fittedFont = setCanvasFontPixelSize(font, fontSize);
  }
  return {
    font: fittedFont,
    text: getCanvasTextWidth(context, text, fittedFont) > maxWidth
      ? ellipsizeCanvasText(context, text, fittedFont, maxWidth)
      : text
  };
}

function getCanvasTextWidth(context: CanvasRenderingContext2D, text: string, font: string): number {
  context.save();
  context.font = font;
  const width = context.measureText(text).width;
  context.restore();
  return width;
}

function setCanvasFontPixelSize(font: string, fontSize: number): string {
  return font.replace(/(\d+(?:\.\d+)?)px/, `${fontSize}px`);
}

function ellipsizeCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  font: string,
  maxWidth: number
): string {
  const ellipsis = '...';
  if (getCanvasTextWidth(context, text, font) <= maxWidth) return text;
  if (getCanvasTextWidth(context, ellipsis, font) > maxWidth) return '';

  let nextText = text;
  while (nextText.length > 1) {
    nextText = nextText.slice(0, -1).trimEnd();
    const candidate = `${nextText}${ellipsis}`;
    if (getCanvasTextWidth(context, candidate, font) <= maxWidth) return candidate;
  }
  return ellipsis;
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  font: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  if (words.length <= 1) return words.length ? words : [''];

  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (getCanvasTextWidth(context, candidate, font) <= maxWidth || !currentLine) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (currentLine && lines.length < maxLines + 1) lines.push(currentLine);
  return lines;
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke?: string
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = 2;
    context.stroke();
  }
}

function getBountyHuntingLedgerRows(runtime: BountyHuntingPanelRuntime): Array<{
  claims: number;
  isCurrentUser: boolean;
  label: string;
  money: number;
  role: BountyHuntingPlayerRole;
}> {
  const currentRole = getBountyHuntingCurrentRole(runtime.game, runtime.currentUserId) || 'host';
  const opponentRole: BountyHuntingPlayerRole = currentRole === 'host' ? 'guest' : 'host';
  return [
    {
      claims: getBountyHuntingRoleClaimCount(runtime.game, currentRole),
      isCurrentUser: true,
      label: getBountyHuntingEmphasisText(tBountyHuntingBarnum('gamesBountyHuntingYou')),
      money: runtime.game.scores[currentRole] || 0,
      role: currentRole
    },
    {
      claims: getBountyHuntingRoleClaimCount(runtime.game, opponentRole),
      isCurrentUser: false,
      label: getBountyHuntingEmphasisText(tBountyHuntingBarnum('gamesBountyHuntingThem')),
      money: runtime.game.scores[opponentRole] || 0,
      role: opponentRole
    }
  ].sort((a, b) => b.money - a.money || b.claims - a.claims || (a.isCurrentUser ? -1 : 1));
}

function getBountyHuntingWinnerLabel(runtime: BountyHuntingPanelRuntime): string {
  let label = tBountyHuntingBarnum('gamesBountyHuntingTie');
  if (runtime.game.winnerUserId) {
    label = runtime.game.winnerUserId === runtime.currentUserId
      ? tBountyHuntingBarnum('gamesBountyHuntingYou')
      : tBountyHuntingBarnum('gamesBountyHuntingThem');
  }
  return getBountyHuntingEmphasisText(label);
}

function getBountyHuntingWinnerText(runtime: BountyHuntingPanelRuntime): string {
  return tBountyHuntingBarnum('gamesBountyHuntingWinner', {
    winner: getBountyHuntingWinnerLabel(runtime)
  });
}

function getBountyHuntingBountyDescription(bounty: PublicBountyHuntingBounty): string {
  if (
    bounty.descriptionKey &&
    BOUNTY_HUNTING_DESCRIPTION_KEYS.has(bounty.descriptionKey)
  ) {
    return t(bounty.descriptionKey as BountyHuntingBountyDescriptionKey & MessageKey);
  }
  return bounty.description;
}

function getBountyHuntingEmphasisText(text: string): string {
  return text.toLocaleUpperCase();
}

function getBountyHuntingTimerText(game: PublicBountyHuntingGame): string {
  const remainingMs = game.status === 'active'
    ? Math.max(0, game.phaseStartedAt + BOUNTY_HUNTING_ROUND_MS - Date.now())
    : BOUNTY_HUNTING_ROUND_MS;
  const seconds = Math.ceil(remainingMs / 1000);
  return `00:${String(seconds).padStart(2, '0')}`;
}

function getNewBountyHuntingClaims(
  previousGame: PublicBountyHuntingGame,
  game: PublicBountyHuntingGame
): BountyHuntingClaim[] {
  const previousClaimKeys = new Set(
    previousGame.bounties
      .map((bounty) => bounty.claim)
      .filter((claim): claim is BountyHuntingClaim => Boolean(claim))
      .map(getBountyHuntingClaimKey)
  );

  return game.bounties
    .map((bounty) => bounty.claim)
    .filter((claim): claim is BountyHuntingClaim => Boolean(claim))
    .filter((claim) => !previousClaimKeys.has(getBountyHuntingClaimKey(claim)));
}

function getBountyHuntingClaimKey(claim: BountyHuntingClaim): string {
  return `${claim.bountyId}:${claim.messageId}:${claim.claimedAt}:${claim.userId}`;
}

function getBountyHuntingRoleClaimCount(game: PublicBountyHuntingGame, role: BountyHuntingPlayerRole): number {
  return game.bounties.filter((bounty) => bounty.claim?.role === role).length;
}

function getBountyHuntingCurrentRole(
  game: PublicBountyHuntingGame,
  currentUserId: string
): BountyHuntingPlayerRole | null {
  if (game.players.host.userId === currentUserId) return 'host';
  if (game.players.guest.userId === currentUserId) return 'guest';
  return null;
}

function getBountyHuntingOpponentLabel(game: PublicBountyHuntingGame, currentUserId: string): string {
  const role = getBountyHuntingCurrentRole(game, currentUserId);
  const opponentRole = role === 'host' ? 'guest' : 'host';
  return game.players[opponentRole]?.displayName || t('gamesBountyHuntingPlayer');
}

function configureBountyHuntingCanvas(canvas: HTMLCanvasElement, compactMode = false): number {
  const pixelRatio = getBountyHuntingPixelRatio();
  const layoutHeight = compactMode ? COMPACT_LAYOUT_HEIGHT : CANVAS_HEIGHT;
  canvas.width = Math.round(CANVAS_WIDTH * pixelRatio);
  canvas.height = Math.round(layoutHeight * pixelRatio);
  canvas.style.width = '100%';
  canvas.style.maxWidth = `${CANVAS_DISPLAY_WIDTH}px`;
  canvas.style.height = 'auto';
  canvas.style.aspectRatio = `${LAYOUT_WIDTH} / ${layoutHeight}`;
  canvas.classList.toggle('ytcq-bounty-hunting-canvas-compact', compactMode);
  return pixelRatio;
}

function syncBountyHuntingCanvasPixelRatio(
  canvas: HTMLCanvasElement,
  pixelRatio: number,
  compactMode: boolean
): number {
  const nextPixelRatio = getBountyHuntingPixelRatio();
  if (pixelRatio !== nextPixelRatio) configureBountyHuntingCanvas(canvas, compactMode);
  return nextPixelRatio;
}

function getBountyHuntingCanvasPoint(canvas: HTMLCanvasElement, event: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const layoutHeight = getBountyHuntingCanvasLayoutHeight(canvas);
  return {
    x: ((event.clientX - rect.left) / rect.width) * LAYOUT_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * layoutHeight
  };
}

function getBountyHuntingClientPoint(
  canvas: HTMLCanvasElement,
  point: { x: number; y: number }
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const layoutHeight = getBountyHuntingCanvasLayoutHeight(canvas);
  return {
    x: (point.x / LAYOUT_WIDTH) * rect.width,
    y: (point.y / layoutHeight) * rect.height
  };
}

function getBountyHuntingCanvasLayoutHeight(canvas: HTMLCanvasElement): number {
  if (canvas.width > 0 && canvas.height > 0) return (canvas.height / canvas.width) * LAYOUT_WIDTH;
  return LAYOUT_HEIGHT;
}

function canRenderBountyHuntingCanvas(context: CanvasRenderingContext2D): boolean {
  const candidate = context as unknown as Record<string, unknown>;
  return [
    'arc',
    'beginPath',
    'clearRect',
    'closePath',
    'drawImage',
    'fill',
    'fillRect',
    'fillText',
    'lineTo',
    'measureText',
    'moveTo',
    'quadraticCurveTo',
    'restore',
    'rotate',
    'save',
    'setTransform',
    'stroke',
    'strokeRect',
    'translate'
  ].every((method) => typeof candidate[method] === 'function');
}

function getBountyHuntingPixelRatio(): number {
  return Math.max(1, Math.min(2, window.devicePixelRatio || 1));
}
