import { createGamesIcon } from '../../../../shared/icons';
import { t } from '../../../../shared/i18n';
import { jsx, el } from '../../../../shared/jsx-dom';
import {
  STICK_AROUND_COUNTDOWN_MS,
  STICK_AROUND_INPUT_RATE_MS
} from '../../../../shared/playground/stick-around';
import { CHAT_MESSAGE_SELECTOR } from '../../../../youtube/selectors';
import { findChatScroller, keepChatAtLiveEdge } from '../../../../youtube/chat-scroll';
import type { RichTextSegment } from '../../../../youtube/rich-text';
import type { CloseGamePanel, SendGameAction } from '../adapter';
import { createGameOverlayShell, type GameOverlayShell } from '../overlay-shell';
import { createGameSoundController, type GameSoundController } from '../sound';
import {
  createStickAroundChatTrafficObserver,
  type StickAroundChatTrafficObserver
} from './chat-traffic';
import { getStickAroundAssets, STICK_AROUND_FONT_BYTESIZED } from './assets';
import {
  createStickAroundSimulation,
  getStickAroundFighterAnimation,
  getStickAroundArenaDimensions,
  hydrateStickAroundSimulationSnapshot,
  isStickAroundCurrentUserPlayer,
  replaceStickAroundSimulation,
  stepStickAroundVisualEffects,
  STICK_AROUND_FIGHTER_WIDTH,
  STICK_AROUND_FIGHTER_HEIGHT,
  STICK_AROUND_SIDE_POSITION_LIMIT,
  STICK_AROUND_STARTING_STOCKS,
  type StickAroundBubble,
  type StickAroundFighter,
  type StickAroundParticle,
  type StickAroundPlatform,
  type StickAroundSimulation
} from './simulation';
import type {
  PublicStickAroundGame,
  StickAroundAnimationFrame,
  StickAroundAssets,
  StickAroundControls
} from './types';

const CANVAS_MIN_WIDTH = 240;
const CANVAS_MIN_HEIGHT = 220;
const SPRITE_DRAW_SIZE = 58;
const BUBBLE_RADIUS = 16;
const BUBBLE_TEXT_HORIZONTAL_PADDING = 22;
const BUBBLE_TEXT_LINE_HEIGHT_RATIO = 0.78;
const BUBBLE_TEXT_MAX_FONT_SIZE = 22;
const BUBBLE_TEXT_MAX_LINES = 4;
const BUBBLE_TEXT_MIN_FONT_SIZE = 10;
const BUBBLE_TEXT_VERTICAL_PADDING = 3;
const BUBBLE_EMOJI_SIZE_RATIO = 0.9;
const READY_BUTTON_HEIGHT = 32;
const READY_BUTTON_HIT_TARGET_PADDING_X = 12;
const READY_BUTTON_HIT_TARGET_PADDING_Y = 8;
const READY_BUTTON_WIDTH = 124;
const CHAT_FEED_SURFACE_SELECTOR = '.ytcq-lite-root, yt-live-chat-item-list-renderer';
const STICK_AROUND_INTERACTIVE_POINTER_TARGET_SELECTOR = '.ytcq-game-overlay-header';
const STICK_AROUND_FONT_STACK = `"${STICK_AROUND_FONT_BYTESIZED}", Arial, sans-serif`;
const STICK_AROUND_JUMP_SOUND_PATH = 'games/stick-around/jump.mp3';
const STICK_AROUND_LAND_SOUND_PATH = 'games/stick-around/land.mp3';
const STICK_AROUND_SOFT_PUNCH_SOUND_PATH = 'games/stick-around/soft-punch.mp3';
const STICK_AROUND_STRONG_PUNCH_SOUND_PATH = 'games/stick-around/strong-punch.mp3';
const STICK_AROUND_SOUND_PATHS = [
  STICK_AROUND_JUMP_SOUND_PATH,
  STICK_AROUND_LAND_SOUND_PATH,
  STICK_AROUND_SOFT_PUNCH_SOUND_PATH,
  STICK_AROUND_STRONG_PUNCH_SOUND_PATH
] as const;
const SERVER_CLOCK_CORRECTION_DEAD_ZONE_MS = 8;
const SERVER_CLOCK_MAX_CORRECTION_MS = 3;
const STICK_AROUND_DISPLAY_SMOOTHING = 0.5;
const STICK_AROUND_LOCAL_DISPLAY_SMOOTHING = 0.84;
const STICK_AROUND_LOCAL_INPUT_LEAD_X = 0;
const STICK_AROUND_LOCAL_JUMP_LEAD_Y = 9;
const STICK_AROUND_LOCAL_RUN_VELOCITY_LEAD = 0;
const STICK_AROUND_MAX_VISUAL_EXTRAPOLATION_MS = 100;
const STICK_AROUND_VISUAL_BUBBLE_GRAVITY = 160;
const STICK_AROUND_SNAP_DISTANCE = 96;
const STICK_AROUND_RENDER_SIDE_LIMIT =
  STICK_AROUND_SIDE_POSITION_LIMIT + STICK_AROUND_LOCAL_INPUT_LEAD_X;

interface StickAroundOverlayRuntime {
  assets: StickAroundAssets;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  controls: StickAroundControls;
  currentUserId: string;
  feedSurface: HTMLElement;
  emojiImages: Map<string, HTMLImageElement>;
  game: PublicStickAroundGame;
  inputDirty: boolean;
  inputSeq: number;
  lastInputSentAt: number;
  lastGameNow: number;
  listeners: AbortController;
  onPanelChange: () => void;
  readyHitbox: StickAroundRect | null;
  root: HTMLElement;
  shell: GameOverlayShell;
  serverClockOffsetMs: number;
  serverClockSynced: boolean;
  simulation: StickAroundSimulation;
  soundController: GameSoundController;
  startRoundSent: boolean;
  status: HTMLElement;
  targetSimulation: StickAroundSimulation;
  traffic: StickAroundChatTrafficObserver;
}

interface StickAroundSoundFighterSnapshot {
  damage: number;
  grounded: boolean;
  stocks: number;
  vy: number;
}

interface StickAroundCanvasViewport {
  offsetX: number;
  offsetY: number;
  scale: number;
}

interface StickAroundRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

type StickAroundBubbleLineItem =
  | {
      text: string;
      type: 'text';
      width: number;
    }
  | {
      alt: string;
      image: HTMLImageElement | null;
      size: number;
      type: 'emoji';
      width: number;
    };

interface StickAroundBubbleLine {
  items: StickAroundBubbleLineItem[];
  width: number;
}

interface StickAroundBubbleTextLayout {
  fontSize: number;
  lineHeight: number;
  lines: StickAroundBubbleLine[];
}

type StickAroundBubbleToken =
  | {
      text: string;
      type: 'text';
    }
  | {
      segment: Extract<RichTextSegment, { type: 'emoji' }>;
      type: 'emoji';
    };

let activeStickAroundOverlay: StickAroundOverlayRuntime | null = null;
const BLOCKED_POINTER_EVENTS = [
  'auxclick',
  'click',
  'contextmenu',
  'dblclick',
  'mousedown',
  'mouseup',
  'pointerdown',
  'pointerup',
  'touchmove',
  'wheel'
] as const;

export function openStickAroundOverlay(
  game: PublicStickAroundGame,
  currentUserId: string,
  sendGameAction: SendGameAction,
  onPanelChange: () => void,
  closePanel: CloseGamePanel
): boolean {
  closeStickAroundOverlay({ notify: false });

  const feedSurface = findChatFeedSurface();
  if (!feedSurface) return false;

  const listeners = new AbortController();
  const shell = createGameOverlayShell({
    ariaLabel: t('gamesStickAround'),
    classNamePrefix: 'ytcq-stick-around',
    closeLabel: t('gamesHide'),
    icon: createGamesIcon(),
    onClose: () => closePanel(),
    signal: listeners.signal,
    subtitle: getStickAroundOverlayOpponentLabel(game, currentUserId),
    title: t('gamesStickAround')
  });

  const canvas = el<HTMLCanvasElement>(
    <canvas class="ytcq-stick-around-canvas" aria-label={t('gamesStickAround')} />
  );

  const soundController = createGameSoundController({
    className: 'ytcq-stick-around-sound-toggle',
    preloadPaths: STICK_AROUND_SOUND_PATHS,
    signal: listeners.signal
  });
  shell.closeButton.before(soundController.button);
  shell.body.append(canvas);

  const context = canvas.getContext('2d');
  if (!context) {
    listeners.abort();
    return false;
  }

  feedSurface.classList.add('ytcq-stick-around-feed-surface');
  const { root } = shell;
  feedSurface.append(root);
  const openedAt = Date.now();
  const serverClockOffsetMs = getStickAroundServerClockOffset(game, openedAt);
  const initialGameNow = openedAt + serverClockOffsetMs;
  resizeCanvasToSurface(canvas, feedSurface);
  const arena = getStickAroundArenaDimensions(game);
  const simulation = game.simulation
    ? hydrateStickAroundSimulationSnapshot(game.simulation)
    : createStickAroundSimulation(game, arena.width, arena.height, initialGameNow);
  const targetSimulation = game.simulation
    ? hydrateStickAroundSimulationSnapshot(game.simulation)
    : createStickAroundSimulation(game, arena.width, arena.height, initialGameNow);
  const runtime: StickAroundOverlayRuntime = {
    assets: {
      animations: {},
      darkLogo: null,
      darkSpritesheet: null,
      fontsReady: false,
      logo: null,
      spritesheet: null
    },
    canvas,
    context,
    controls: {
      jump: false,
      left: false,
      right: false
    },
    currentUserId,
    emojiImages: new Map(),
    feedSurface,
    game,
    inputDirty: true,
    inputSeq: getStickAroundInitialInputSeq(game, currentUserId),
    lastInputSentAt: 0,
    lastGameNow: initialGameNow,
    listeners,
    onPanelChange,
    readyHitbox: null,
    root,
    shell,
    serverClockOffsetMs,
    serverClockSynced: typeof game.serverNow === 'number',
    simulation,
    soundController,
    startRoundSent: false,
    status: shell.subtitleElement,
    targetSimulation,
    traffic: createStickAroundChatTrafficObserver((observation) => {
      if (activeStickAroundOverlay !== runtime || runtime.game.status !== 'active') return;
      sendGameAction(runtime.game.gameId, 'observeChatTraffic', {
        count: observation.count,
        messageIds: observation.messageIds,
        windowStartedAt: observation.windowStartedAt
      });
    })
  };
  activeStickAroundOverlay = runtime;
  keepChatAtLiveEdge();

  BLOCKED_POINTER_EVENTS.forEach((type) => {
    root.addEventListener(type, blockStickAroundFeedPointerEvent, {
      signal: runtime.listeners.signal
    });
  });
  addStickAroundReadyHitboxListeners(root, runtime, sendGameAction);
  root.addEventListener('mousemove', (event) => updateStickAroundReadyCursor(event, runtime), {
    signal: runtime.listeners.signal
  });
  root.addEventListener('mouseleave', () => resetStickAroundReadyCursor(runtime), {
    signal: runtime.listeners.signal
  });
  document.addEventListener('keydown', (event) => handleStickAroundKey(event, runtime, true), {
    capture: true,
    signal: runtime.listeners.signal
  });
  document.addEventListener('keyup', (event) => handleStickAroundKey(event, runtime, false), {
    capture: true,
    signal: runtime.listeners.signal
  });
  window.addEventListener('resize', () => resizeStickAroundOverlay(runtime), {
    signal: runtime.listeners.signal
  });

  void getStickAroundAssets()
    .then((assets) => {
      if (activeStickAroundOverlay !== runtime) return;
      runtime.assets = assets;
    })
    .catch(() => undefined);

  renderStickAroundOverlay(runtime, initialGameNow);
  scheduleNextFrame(runtime, sendGameAction);
  onPanelChange();
  return true;
}

export function updateStickAroundOverlay(game: PublicStickAroundGame, currentUserId: string): void {
  const runtime = activeStickAroundOverlay;
  if (!runtime || runtime.game.gameId !== game.gameId) return;
  const receivedAt = Date.now();
  const previousStatus = runtime.game.status;
  runtime.game = game;
  runtime.currentUserId = currentUserId;
  syncStickAroundServerClock(runtime, game, receivedAt);
  if (game.status !== 'countdown') runtime.startRoundSent = false;
  if (game.status === 'active' && previousStatus !== 'active') {
    runtime.traffic.reset();
  }
  syncStickAroundAuthoritativeSimulation(runtime, game);
  keepChatAtLiveEdge();
  renderStickAroundOverlay(runtime, getStickAroundServerNow(runtime, receivedAt));
}

export function closeStickAroundOverlay({ notify = true }: { notify?: boolean } = {}): void {
  const runtime = activeStickAroundOverlay;
  if (!runtime) return;
  activeStickAroundOverlay = null;
  runtime.listeners.abort();
  runtime.traffic.close();
  runtime.root.remove();
  runtime.feedSurface.classList.remove('ytcq-stick-around-feed-surface');
  if (notify) runtime.onPanelChange();
}

export function isStickAroundOverlayConnected(): boolean {
  return Boolean(activeStickAroundOverlay?.root.isConnected);
}

export function getStickAroundOverlayStatusOverlay():
  | GameOverlayShell['statusOverlay']
  | undefined {
  return activeStickAroundOverlay?.shell.statusOverlay;
}

function scheduleNextFrame(
  runtime: StickAroundOverlayRuntime,
  sendGameAction: SendGameAction
): void {
  window.requestAnimationFrame(() => {
    if (activeStickAroundOverlay !== runtime) return;
    tickStickAroundOverlay(runtime, sendGameAction, Date.now());
    scheduleNextFrame(runtime, sendGameAction);
  });
}

function tickStickAroundOverlay(
  runtime: StickAroundOverlayRuntime,
  sendGameAction: SendGameAction,
  localNow: number
): void {
  const serverNow = getStickAroundServerNow(runtime, localNow);
  keepChatAtLiveEdge();
  resizeStickAroundOverlay(runtime);
  maybeStartRound(runtime, sendGameAction, serverNow);
  if (runtime.game.status === 'active') {
    sendInputSnapshot(runtime, sendGameAction, localNow, runtime.inputDirty);
    smoothStickAroundDisplay(runtime, serverNow);
  } else if (shouldAnimateStickAroundEffects(runtime)) {
    stepStickAroundVisualEffects(runtime.simulation, serverNow);
  }
  renderStickAroundOverlay(runtime, serverNow);
}

function getStickAroundServerClockOffset(game: PublicStickAroundGame, localNow: number): number {
  return typeof game.serverNow === 'number' ? game.serverNow - localNow : 0;
}

function getStickAroundServerNow(runtime: StickAroundOverlayRuntime, localNow: number): number {
  const nextGameNow = localNow + runtime.serverClockOffsetMs;
  runtime.lastGameNow = Math.max(runtime.lastGameNow, nextGameNow);
  return runtime.lastGameNow;
}

function syncStickAroundServerClock(
  runtime: StickAroundOverlayRuntime,
  game: PublicStickAroundGame,
  localNow: number
): void {
  if (typeof game.serverNow !== 'number') return;
  const nextOffset = getStickAroundServerClockOffset(game, localNow);
  if (!runtime.serverClockSynced) {
    runtime.serverClockOffsetMs = nextOffset;
    runtime.serverClockSynced = true;
    return;
  }

  const offsetDelta = nextOffset - runtime.serverClockOffsetMs;
  if (Math.abs(offsetDelta) <= SERVER_CLOCK_CORRECTION_DEAD_ZONE_MS) return;
  runtime.serverClockOffsetMs += clampNumber(
    offsetDelta,
    -SERVER_CLOCK_MAX_CORRECTION_MS,
    SERVER_CLOCK_MAX_CORRECTION_MS
  );
}

function shouldAnimateStickAroundEffects(runtime: StickAroundOverlayRuntime): boolean {
  return (
    (runtime.game.status === 'finished' || runtime.game.status === 'desynced') &&
    (runtime.simulation.shake > 0 || runtime.simulation.particles.length > 0)
  );
}

function maybeStartRound(
  runtime: StickAroundOverlayRuntime,
  sendGameAction: SendGameAction,
  now: number
): void {
  if (runtime.game.status !== 'countdown' || runtime.startRoundSent) return;
  if (now < runtime.game.phaseStartedAt + STICK_AROUND_COUNTDOWN_MS) return;
  runtime.startRoundSent = true;
  sendGameAction(runtime.game.gameId, 'startRound');
}

function sendInputSnapshot(
  runtime: StickAroundOverlayRuntime,
  sendGameAction: SendGameAction,
  now: number,
  force = false
): void {
  if (!isStickAroundCurrentUserPlayer(runtime.game, runtime.currentUserId)) return;
  if (!force && now - runtime.lastInputSentAt < STICK_AROUND_INPUT_RATE_MS) return;
  runtime.lastInputSentAt = now;
  runtime.inputDirty = false;
  runtime.inputSeq += 1;
  sendGameAction(runtime.game.gameId, 'input', {
    frame: runtime.simulation.frame,
    jump: runtime.controls.jump,
    left: runtime.controls.left,
    right: runtime.controls.right,
    seq: runtime.inputSeq
  });
}

function getStickAroundInitialInputSeq(game: PublicStickAroundGame, currentUserId: string): number {
  const currentInputSeq = game.inputs[currentUserId]?.seq;
  return Number.isInteger(currentInputSeq) ? Math.max(0, currentInputSeq) : 0;
}

function syncStickAroundAuthoritativeSimulation(
  runtime: StickAroundOverlayRuntime,
  game: PublicStickAroundGame
): void {
  if (!game.simulation) return;
  const before = snapshotStickAroundSoundState(runtime.targetSimulation);
  const previousFrame = runtime.targetSimulation.frame;
  replaceStickAroundSimulation(runtime.targetSimulation, game.simulation);
  applyLocalBubbleTextToSimulation(runtime.targetSimulation, runtime);
  if (runtime.game.status !== 'active' || runtime.simulation.frame === 0) {
    replaceStickAroundSimulation(runtime.simulation, game.simulation);
  }
  applyLocalBubbleText(runtime);
  if (runtime.targetSimulation.frame !== previousFrame) {
    playStickAroundSimulationSounds(runtime, before, runtime.targetSimulation);
  }
}

function smoothStickAroundDisplay(runtime: StickAroundOverlayRuntime, now: number): void {
  smoothSimulationToward(runtime.simulation, runtime.targetSimulation, runtime, now);
  applyLocalBubbleText(runtime);
}

function applyLocalBubbleText(runtime: StickAroundOverlayRuntime): void {
  applyLocalBubbleTextToSimulation(runtime.simulation, runtime);
}

function applyLocalBubbleTextToSimulation(
  simulation: StickAroundSimulation,
  runtime: StickAroundOverlayRuntime
): void {
  const messageTexts = runtime.traffic.getMessageTexts();
  simulation.bubbles.forEach((bubble) => {
    const text = bubble.messageId ? messageTexts.get(bubble.messageId) : '';
    if (text) bubble.text = text.slice(0, 80);
  });
}

function smoothSimulationToward(
  display: StickAroundSimulation,
  target: StickAroundSimulation,
  runtime: StickAroundOverlayRuntime,
  now: number
): void {
  if (
    display.width !== target.width ||
    display.height !== target.height ||
    display.roundSeed !== target.roundSeed
  ) {
    copySimulation(display, target);
    return;
  }

  const extrapolationSeconds = getVisualExtrapolationSeconds(target, now);
  display.frame = target.frame;
  display.lastTime = now;
  display.platforms = target.platforms.map((platform) => ({ ...platform }));
  display.roundSeed = target.roundSeed;
  display.spawnedHazardIds = new Set(target.spawnedHazardIds);
  display.flash = Math.max(target.flash, display.flash * 0.86);
  display.shake = Math.max(target.shake, display.shake * 0.82);

  display.fighters = Object.fromEntries(
    Object.entries(target.fighters).map(([userId, targetFighter]) => {
      const current = display.fighters[userId];
      return [
        userId,
        current
          ? smoothFighter(current, targetFighter, runtime, target.width, extrapolationSeconds)
          : getExtrapolatedFighter(targetFighter, extrapolationSeconds)
      ];
    })
  );

  const currentBubbles = new Map(display.bubbles.map((bubble) => [bubble.id, bubble]));
  display.bubbles = target.bubbles.map((targetBubble) => {
    const current = currentBubbles.get(targetBubble.id);
    return current
      ? smoothBubble(current, targetBubble, extrapolationSeconds)
      : getExtrapolatedBubble(targetBubble, extrapolationSeconds);
  });

  display.particles = target.particles.map((particle) => ({ ...particle }));
}

function copySimulation(display: StickAroundSimulation, target: StickAroundSimulation): void {
  display.bubbles = target.bubbles.map(cloneBubble);
  display.flash = target.flash;
  display.fighters = Object.fromEntries(
    Object.entries(target.fighters).map(([userId, fighter]) => [userId, { ...fighter }])
  );
  display.frame = target.frame;
  display.height = target.height;
  display.lastTime = target.lastTime;
  display.particles = target.particles.map((particle) => ({ ...particle }));
  display.platforms = target.platforms.map((platform) => ({ ...platform }));
  display.roundSeed = target.roundSeed;
  display.shake = target.shake;
  display.spawnedHazardIds = new Set(target.spawnedHazardIds);
  display.width = target.width;
}

function smoothFighter(
  current: StickAroundFighter,
  target: StickAroundFighter,
  runtime: StickAroundOverlayRuntime,
  simulationWidth: number,
  extrapolationSeconds: number
): StickAroundFighter {
  const distance = Math.hypot(target.x - current.x, target.y - current.y);
  if (distance > STICK_AROUND_SNAP_DISTANCE || target.stocks !== current.stocks)
    return { ...target };
  const localControls = target.userId === runtime.currentUserId ? runtime.controls : null;
  const horizontalInput = localControls
    ? Number(localControls.right) - Number(localControls.left)
    : 0;
  const alpha = localControls
    ? STICK_AROUND_LOCAL_DISPLAY_SMOOTHING
    : STICK_AROUND_DISPLAY_SMOOTHING;
  const extrapolated = getExtrapolatedFighter(target, extrapolationSeconds);
  const xTarget = localControls
    ? clampNumber(
        extrapolated.x + horizontalInput * STICK_AROUND_LOCAL_INPUT_LEAD_X,
        -STICK_AROUND_RENDER_SIDE_LIMIT,
        simulationWidth - STICK_AROUND_FIGHTER_WIDTH + STICK_AROUND_RENDER_SIDE_LIMIT
      )
    : extrapolated.x;
  const yTarget =
    localControls?.jump && target.grounded
      ? extrapolated.y - STICK_AROUND_LOCAL_JUMP_LEAD_Y
      : extrapolated.y;
  const facing = horizontalInput > 0 ? 1 : horizontalInput < 0 ? -1 : target.facing;
  const vxTarget = target.vx + horizontalInput * STICK_AROUND_LOCAL_RUN_VELOCITY_LEAD;
  return {
    ...target,
    facing,
    vx: smoothNumber(current.vx, vxTarget, alpha),
    vy: smoothNumber(current.vy, extrapolated.vy, alpha),
    x: smoothNumber(current.x, xTarget, alpha),
    y: smoothNumber(current.y, yTarget, alpha)
  };
}

function smoothBubble(
  current: StickAroundBubble,
  target: StickAroundBubble,
  extrapolationSeconds: number
): StickAroundBubble {
  const distance = Math.hypot(target.x - current.x, target.y - current.y);
  if (distance > STICK_AROUND_SNAP_DISTANCE) return cloneBubble(target);
  const extrapolated = getExtrapolatedBubble(target, extrapolationSeconds);
  return {
    ...target,
    angle: smoothNumber(current.angle, extrapolated.angle, STICK_AROUND_DISPLAY_SMOOTHING),
    hitUserIds: new Set(target.hitUserIds),
    vx: smoothNumber(current.vx, extrapolated.vx, STICK_AROUND_DISPLAY_SMOOTHING),
    vy: smoothNumber(current.vy, extrapolated.vy, STICK_AROUND_DISPLAY_SMOOTHING),
    x: smoothNumber(current.x, extrapolated.x, STICK_AROUND_DISPLAY_SMOOTHING),
    y: smoothNumber(current.y, extrapolated.y, STICK_AROUND_DISPLAY_SMOOTHING)
  };
}

function getVisualExtrapolationSeconds(target: StickAroundSimulation, now: number): number {
  return clampNumber(now - target.lastTime, 0, STICK_AROUND_MAX_VISUAL_EXTRAPOLATION_MS) / 1000;
}

function getExtrapolatedFighter(
  fighter: StickAroundFighter,
  extrapolationSeconds: number
): StickAroundFighter {
  if (extrapolationSeconds <= 0 || fighter.stocks <= 0) return { ...fighter };
  return {
    ...fighter,
    x: fighter.x + fighter.vx * extrapolationSeconds,
    y: fighter.y + fighter.vy * extrapolationSeconds
  };
}

function getExtrapolatedBubble(
  bubble: StickAroundBubble,
  extrapolationSeconds: number
): StickAroundBubble {
  const clone = cloneBubble(bubble);
  if (extrapolationSeconds <= 0) return clone;
  clone.angle += bubble.spin * extrapolationSeconds;
  clone.vy += STICK_AROUND_VISUAL_BUBBLE_GRAVITY * extrapolationSeconds;
  clone.x += bubble.vx * extrapolationSeconds;
  clone.y +=
    bubble.vy * extrapolationSeconds +
    (STICK_AROUND_VISUAL_BUBBLE_GRAVITY * extrapolationSeconds * extrapolationSeconds) / 2;
  return clone;
}

function cloneBubble(bubble: StickAroundBubble): StickAroundBubble {
  return {
    ...bubble,
    hitUserIds: new Set(bubble.hitUserIds)
  };
}

function smoothNumber(current: number, target: number, alpha: number): number {
  return current + (target - current) * alpha;
}

function snapshotStickAroundSoundState(
  simulation: StickAroundSimulation
): Map<string, StickAroundSoundFighterSnapshot> {
  return new Map(
    Object.entries(simulation.fighters).map(([userId, fighter]) => [
      userId,
      {
        damage: fighter.damage,
        grounded: fighter.grounded,
        stocks: fighter.stocks,
        vy: fighter.vy
      }
    ])
  );
}

function playStickAroundSimulationSounds(
  runtime: StickAroundOverlayRuntime,
  before: ReadonlyMap<string, StickAroundSoundFighterSnapshot>,
  after: StickAroundSimulation = runtime.simulation
): void {
  let landed = false;
  let jumped = false;
  let softHit = false;
  let strongHit = false;

  Object.entries(after.fighters).forEach(([userId, fighter]) => {
    const previous = before.get(userId);
    if (!previous) return;
    if (previous.stocks > fighter.stocks) {
      strongHit = true;
      return;
    }
    if (!previous.grounded && fighter.grounded) landed = true;
    if (previous.grounded && !fighter.grounded && fighter.vy < previous.vy - 120) jumped = true;
    if (fighter.damage > previous.damage) {
      if (fighter.damage - previous.damage >= 18) {
        strongHit = true;
      } else {
        softHit = true;
      }
    }
  });

  if (jumped) runtime.soundController.play(STICK_AROUND_JUMP_SOUND_PATH);
  if (landed) runtime.soundController.play(STICK_AROUND_LAND_SOUND_PATH);
  if (strongHit) {
    runtime.soundController.play(STICK_AROUND_STRONG_PUNCH_SOUND_PATH);
  } else if (softHit) {
    runtime.soundController.play(STICK_AROUND_SOFT_PUNCH_SOUND_PATH);
  }
}

function renderStickAroundOverlay(runtime: StickAroundOverlayRuntime, now = Date.now()): void {
  const { canvas, context, simulation } = runtime;
  updateHud(runtime);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  const canvasScale = getCanvasScale(canvas);
  const viewport = getStickAroundCanvasViewport(canvas, simulation);
  context.scale(canvasScale, canvasScale);
  context.imageSmoothingEnabled = false;
  const theme = getStickAroundOverlayTheme(runtime.feedSurface);
  runtime.root.classList.toggle('ytcq-game-overlay-theme-light', theme === 'light');
  runtime.root.classList.toggle('ytcq-game-overlay-theme-dark', theme === 'dark');
  const fighterColor = getStickAroundFighterColor(theme);

  context.save();
  applyCanvasViewportTransform(context, viewport);
  context.save();
  applyWorldShake(context, simulation);
  drawArena(context, simulation, fighterColor, theme);
  runtime.readyHitbox = null;
  if (runtime.game.status === 'ready') {
    const logoBottomY = drawWaitingLogo(context, runtime.assets, simulation, fighterColor);
    drawReadyButton(
      context,
      getStickAroundReadyLabel(runtime),
      logoBottomY,
      fighterColor,
      simulation
    );
    runtime.readyHitbox = getReadyButtonHitbox(simulation, logoBottomY, viewport);
  } else {
    resetStickAroundReadyCursor(runtime);
  }
  simulation.bubbles.forEach((bubble) => drawBubble(context, bubble, runtime));
  Object.values(simulation.fighters).forEach((fighter) =>
    drawFighter(context, runtime.assets, fighter, now, fighterColor)
  );
  simulation.particles.forEach((particle) => drawParticle(context, particle));
  drawNamesAndStats(context, simulation);
  context.restore();

  const statusText = getCanvasStatusText(runtime, now);
  if (statusText) drawCanvasStatus(context, simulation, statusText, fighterColor);
  if (simulation.flash > 0) drawScreenFlash(context, simulation, theme);
  context.restore();
  context.restore();
}

function applyCanvasViewportTransform(
  context: CanvasRenderingContext2D,
  viewport: StickAroundCanvasViewport
): void {
  context.translate(viewport.offsetX, viewport.offsetY);
  context.scale(viewport.scale, viewport.scale);
}

function applyWorldShake(
  context: CanvasRenderingContext2D,
  simulation: StickAroundSimulation
): void {
  if (simulation.shake <= 0) return;
  const random = createRenderRandom(simulation.frame * 997 + Math.round(simulation.shake * 100));
  const x = (random() * 2 - 1) * simulation.shake;
  const y = (random() * 2 - 1) * simulation.shake;
  context.translate(x, y);
}

function drawArena(
  context: CanvasRenderingContext2D,
  simulation: StickAroundSimulation,
  fighterColor: string,
  theme: StickAroundOverlayTheme
): void {
  const groundY = Math.max(0, simulation.height - 2);
  context.fillStyle = 'rgba(255, 64, 68, 0.14)';
  context.fillRect(0, Math.max(0, simulation.height - 5), simulation.width, 5);
  context.fillStyle =
    fighterColor === '#ffffff' ? 'rgba(255, 255, 255, 0.34)' : 'rgba(0, 0, 0, 0.34)';
  context.fillRect(0, groundY, simulation.width, 2);
  simulation.platforms.forEach((platform) => drawPlatform(context, platform, theme));
}

function drawPlatform(
  context: CanvasRenderingContext2D,
  platform: StickAroundPlatform,
  theme: StickAroundOverlayTheme
): void {
  context.save();
  context.fillStyle = theme === 'light' ? 'rgba(0, 0, 0, 0.11)' : 'rgba(255, 255, 255, 0.14)';
  context.strokeStyle = theme === 'light' ? 'rgba(0, 0, 0, 0.28)' : 'rgba(255, 255, 255, 0.34)';
  context.lineWidth = 1.5;
  context.fillRect(platform.x, platform.y, platform.width, platform.height);
  context.strokeRect(platform.x, platform.y, platform.width, platform.height);
  context.restore();
}

function drawScreenFlash(
  context: CanvasRenderingContext2D,
  simulation: StickAroundSimulation,
  theme: StickAroundOverlayTheme
): void {
  context.save();
  context.fillStyle =
    theme === 'light'
      ? `rgba(0, 0, 0, ${Math.min(0.12, simulation.flash * 0.5)})`
      : `rgba(255, 255, 255, ${Math.min(0.22, simulation.flash)})`;
  context.fillRect(0, 0, simulation.width, simulation.height);
  context.restore();
}

function drawBubble(
  context: CanvasRenderingContext2D,
  bubble: StickAroundBubble,
  runtime: StickAroundOverlayRuntime
): void {
  context.save();
  const layout = getBubbleTextLayout(context, bubble, runtime);
  context.translate(bubble.x + bubble.width / 2, bubble.y + bubble.height / 2);
  context.rotate(bubble.angle);
  context.fillStyle = '#ff4044';
  context.strokeStyle = 'rgba(120, 0, 8, 0.42)';
  context.lineWidth = 2;
  drawRoundedRect(
    context,
    -bubble.width / 2,
    -bubble.height / 2,
    bubble.width,
    bubble.height,
    Math.min(BUBBLE_RADIUS, bubble.height / 2)
  );

  context.font = getBubbleTextFont(layout.fontSize);
  context.fillStyle = '#ffffff';
  context.textBaseline = 'middle';
  const startY = -((layout.lines.length - 1) * layout.lineHeight) / 2;
  layout.lines.forEach((line, index) => {
    drawBubbleLine(context, line, startY + index * layout.lineHeight);
  });
  context.restore();
}

function drawParticle(context: CanvasRenderingContext2D, particle: StickAroundParticle): void {
  context.save();
  context.globalAlpha = Math.max(0, Math.min(1, particle.life / particle.maxLife));
  context.fillStyle = particle.color;
  context.fillRect(particle.x, particle.y, particle.size, particle.size);
  context.restore();
}

function getBubbleTextLayout(
  context: CanvasRenderingContext2D,
  bubble: StickAroundBubble,
  runtime: StickAroundOverlayRuntime
): StickAroundBubbleTextLayout {
  const tokens = getBubbleCanvasTokens(bubble, runtime);
  const maxWidth = Math.max(1, bubble.width - BUBBLE_TEXT_HORIZONTAL_PADDING);
  let fallback: StickAroundBubbleTextLayout | null = null;
  for (
    let fontSize = getBubbleTextMaxFontSize(bubble);
    fontSize >= BUBBLE_TEXT_MIN_FONT_SIZE;
    fontSize -= 1
  ) {
    const layout = createBubbleTextLayout(context, bubble, tokens, maxWidth, fontSize, runtime);
    fallback = layout;
    if (getBubbleLineText(layout.lines).trim() === getBubbleTokenText(tokens).trim()) return layout;
  }

  return (
    fallback ||
    createBubbleTextLayout(context, bubble, tokens, maxWidth, BUBBLE_TEXT_MIN_FONT_SIZE, runtime)
  );
}

function createBubbleTextLayout(
  context: CanvasRenderingContext2D,
  bubble: StickAroundBubble,
  tokens: StickAroundBubbleToken[],
  maxWidth: number,
  fontSize: number,
  runtime: StickAroundOverlayRuntime
): StickAroundBubbleTextLayout {
  context.font = getBubbleTextFont(fontSize);
  const lineHeight = getBubbleTextLineHeight(fontSize);
  return {
    fontSize,
    lineHeight,
    lines: wrapBubbleTokens(
      context,
      tokens,
      maxWidth,
      getBubbleTextMaxLines(bubble, lineHeight),
      runtime,
      getBubbleEmojiSize(fontSize)
    )
  };
}

function getBubbleTextMaxLines(bubble: StickAroundBubble, lineHeight: number): number {
  const availableHeight = Math.max(lineHeight, bubble.height - BUBBLE_TEXT_VERTICAL_PADDING);
  return clampNumber(Math.floor(availableHeight / lineHeight), 1, BUBBLE_TEXT_MAX_LINES);
}

function getBubbleTextMaxFontSize(bubble: StickAroundBubble): number {
  const heightBound = Math.floor((bubble.height - BUBBLE_TEXT_VERTICAL_PADDING * 2) * 0.5);
  return clampNumber(heightBound, BUBBLE_TEXT_MIN_FONT_SIZE, BUBBLE_TEXT_MAX_FONT_SIZE);
}

function getBubbleTextLineHeight(fontSize: number): number {
  return Math.max(8, Math.round(fontSize * BUBBLE_TEXT_LINE_HEIGHT_RATIO));
}

function getBubbleEmojiSize(fontSize: number): number {
  return Math.max(9, Math.round(fontSize * BUBBLE_EMOJI_SIZE_RATIO));
}

function getBubbleTextFont(fontSize: number): string {
  return `600 ${fontSize}px ${STICK_AROUND_FONT_STACK}`;
}

function drawBubbleLine(
  context: CanvasRenderingContext2D,
  line: StickAroundBubbleLine,
  y: number
): void {
  let cursor = -line.width / 2;
  context.textAlign = 'left';
  line.items.forEach((item) => {
    if (item.type === 'text') {
      context.fillText(item.text, cursor, y);
      cursor += item.width;
      return;
    }

    if (item.image?.complete && item.image.naturalWidth > 0) {
      const previousImageSmoothing = context.imageSmoothingEnabled;
      context.imageSmoothingEnabled = true;
      context.drawImage(item.image, cursor, y - item.size / 2, item.size, item.size);
      context.imageSmoothingEnabled = previousImageSmoothing;
    } else if (item.alt) {
      context.fillText(fitText(context, item.alt, item.size), cursor, y, item.size);
    }
    cursor += item.width;
  });
}

function getBubbleCanvasTokens(
  bubble: StickAroundBubble,
  runtime: StickAroundOverlayRuntime
): StickAroundBubbleToken[] {
  const richSegments = bubble.messageId
    ? runtime.traffic.getMessageRichTextSegments().get(bubble.messageId)
    : null;
  const segments = richSegments?.length
    ? richSegments
    : [
        {
          text: bubble.text || 'chat',
          type: 'text' as const
        }
      ];
  const tokens: StickAroundBubbleToken[] = [];
  segments.forEach((segment) => {
    if (segment.type === 'emoji') {
      tokens.push({ segment, type: 'emoji' });
      return;
    }
    appendBubbleTextTokens(tokens, segment.text);
  });
  return tokens.length ? tokens : [{ text: 'chat', type: 'text' }];
}

function appendBubbleTextTokens(tokens: StickAroundBubbleToken[], text: string): void {
  text
    .replace(/\s+/g, ' ')
    .split(/( )/)
    .forEach((part) => {
      if (!part) return;
      if (part === ' ' && !tokens.length) return;
      tokens.push({ text: part, type: 'text' });
    });
}

function drawWaitingLogo(
  context: CanvasRenderingContext2D,
  assets: StickAroundAssets,
  simulation: StickAroundSimulation,
  fighterColor: string
): number {
  const logo = getThemedStickAroundLogo(assets, fighterColor);
  if (!logo) {
    context.fillStyle = fighterColor;
    context.font = `700 24px ${STICK_AROUND_FONT_STACK}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const y = simulation.height / 2 - 28;
    context.fillText(t('gamesStickAround'), simulation.width / 2, y);
    return y + 18;
  }

  const maxLogoWidth = Math.min(260, simulation.width * 0.68);
  const maxLogoHeight = Math.min(190, simulation.height * 0.52);
  const scale = Math.min(maxLogoWidth / logo.naturalWidth, maxLogoHeight / logo.naturalHeight);
  const width = Math.round(logo.naturalWidth * scale);
  const height = Math.round(logo.naturalHeight * scale);
  context.save();
  context.globalAlpha = 0.92;
  context.drawImage(
    logo,
    Math.round((simulation.width - width) / 2),
    Math.round((simulation.height - height) / 2),
    width,
    height
  );
  context.restore();
  return Math.round((simulation.height - height) / 2) + height;
}

function getThemedStickAroundLogo(
  assets: StickAroundAssets,
  fighterColor: string
): HTMLImageElement | null {
  return fighterColor === '#ffffff' ? assets.darkLogo : assets.logo;
}

function drawReadyButton(
  context: CanvasRenderingContext2D,
  label: string,
  logoBottomY: number,
  fighterColor: string,
  simulation: StickAroundSimulation
): void {
  const text = label.toUpperCase();
  const y = getReadyButtonY(logoBottomY);
  const centerX = Math.round(simulation.width / 2);
  context.save();
  context.fillStyle = fighterColor;
  context.strokeStyle = fighterColor;
  context.lineWidth = 1.5;
  context.font = `700 13px ${STICK_AROUND_FONT_STACK}`;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  const textWidth = Math.ceil(context.measureText(text).width);
  context.fillText(text, centerX, y + 7, READY_BUTTON_WIDTH);
  context.beginPath();
  context.moveTo(centerX - textWidth / 2, y + 24);
  context.lineTo(centerX + textWidth / 2, y + 24);
  context.stroke();
  context.restore();
}

function getReadyButtonHitbox(
  simulation: StickAroundSimulation,
  logoBottomY: number,
  viewport: StickAroundCanvasViewport
): StickAroundRect {
  const y = getReadyButtonY(logoBottomY);
  const width = READY_BUTTON_WIDTH + READY_BUTTON_HIT_TARGET_PADDING_X * 2;
  const height = READY_BUTTON_HEIGHT + READY_BUTTON_HIT_TARGET_PADDING_Y * 2;
  return {
    height: Math.round(height * viewport.scale),
    width: Math.round(width * viewport.scale),
    x: Math.round(
      viewport.offsetX + (simulation.width / 2) * viewport.scale - (width * viewport.scale) / 2
    ),
    y: Math.round(viewport.offsetY + (y - READY_BUTTON_HIT_TARGET_PADDING_Y) * viewport.scale)
  };
}

function getReadyButtonY(logoBottomY: number): number {
  return Math.round(logoBottomY + 14);
}

function drawCanvasStatus(
  context: CanvasRenderingContext2D,
  simulation: StickAroundSimulation,
  text: string,
  fighterColor: string
): void {
  const maxWidth = Math.min(340, Math.max(180, simulation.width - 28));
  context.save();
  context.font = `700 22px ${STICK_AROUND_FONT_STACK}`;
  const label = fitText(context, text, maxWidth);
  const y = Math.round(simulation.height * 0.42);
  context.lineWidth = 6;
  context.strokeStyle =
    fighterColor === '#ffffff' ? 'rgba(0, 0, 0, 0.55)' : 'rgba(255, 255, 255, 0.62)';
  context.fillStyle = fighterColor;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.strokeText(label, simulation.width / 2, y, maxWidth);
  context.fillText(label, simulation.width / 2, y, maxWidth);
  context.restore();
}

function drawFighter(
  context: CanvasRenderingContext2D,
  assets: StickAroundAssets,
  fighter: StickAroundFighter,
  now: number,
  color: string
): void {
  const animation = getStickAroundFighterAnimation(fighter, now);
  const frame = selectAnimationFrame(assets.animations[animation] || assets.animations.idle, now);
  const drawX = Math.round(fighter.x + 15 - SPRITE_DRAW_SIZE / 2);
  const drawY = Math.round(fighter.y + STICK_AROUND_FIGHTER_HEIGHT - SPRITE_DRAW_SIZE);
  const spritesheet = getThemedStickAroundSpritesheet(assets, color);
  if (spritesheet && frame) {
    context.save();
    if (fighter.facing < 0) {
      context.translate(drawX + SPRITE_DRAW_SIZE, drawY);
      context.scale(-1, 1);
      drawStickAroundSpriteFrame(context, spritesheet, frame, 0, 0);
    } else {
      drawStickAroundSpriteFrame(context, spritesheet, frame, drawX, drawY);
    }
    context.restore();
  } else {
    drawFallbackFighter(context, fighter, color);
  }
}

function getThemedStickAroundSpritesheet(
  assets: StickAroundAssets,
  color: string
): HTMLImageElement | null {
  return color === '#ffffff' ? assets.darkSpritesheet : assets.spritesheet;
}

function drawStickAroundSpriteFrame(
  context: CanvasRenderingContext2D,
  spritesheet: HTMLImageElement,
  frame: StickAroundAnimationFrame,
  x: number,
  y: number
): void {
  const source = {
    height: frame.frame.h,
    width: frame.frame.w,
    x: frame.frame.x,
    y: frame.frame.y
  };
  const destination = {
    height: SPRITE_DRAW_SIZE,
    width: SPRITE_DRAW_SIZE,
    x,
    y
  };
  context.drawImage(
    spritesheet,
    source.x,
    source.y,
    source.width,
    source.height,
    destination.x,
    destination.y,
    destination.width,
    destination.height
  );
}

function drawFallbackFighter(
  context: CanvasRenderingContext2D,
  fighter: StickAroundFighter,
  color: string
): void {
  const x = fighter.x + 15;
  const y = fighter.y + STICK_AROUND_FIGHTER_HEIGHT;
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.lineCap = 'round';
  context.beginPath();
  context.arc(x, y - 36, 6, 0, Math.PI * 2);
  context.moveTo(x, y - 30);
  context.lineTo(x, y - 15);
  context.moveTo(x, y - 25);
  context.lineTo(x - 12, y - 18);
  context.moveTo(x, y - 25);
  context.lineTo(x + 12, y - 27);
  context.moveTo(x, y - 15);
  context.lineTo(x - 10, y);
  context.moveTo(x, y - 15);
  context.lineTo(x + 10, y);
  context.stroke();
}

function drawNamesAndStats(
  context: CanvasRenderingContext2D,
  simulation: StickAroundSimulation
): void {
  Object.values(simulation.fighters).forEach((fighter) => {
    const x = fighter.x + 15;
    const y = Math.max(14, fighter.y - 30);
    context.fillStyle = 'rgba(0, 0, 0, 0.58)';
    context.fillRect(x - 38, y, 76, 20);
    context.fillStyle = '#ffffff';
    context.font = `600 11px ${STICK_AROUND_FONT_STACK}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(fitText(context, fighter.label, 68), x, y + 10, 68);

    drawStockBars(context, fighter, x, y + 25);

    context.fillStyle = '#ff4044';
    context.font = `700 10px ${STICK_AROUND_FONT_STACK}`;
    context.fillText(`${Math.round(fighter.damage)}%`, x, y + 38);
  });
}

function drawStockBars(
  context: CanvasRenderingContext2D,
  fighter: StickAroundFighter,
  centerX: number,
  y: number
): void {
  const barWidth = 13;
  const barHeight = 4;
  const gap = 3;
  const totalWidth =
    STICK_AROUND_STARTING_STOCKS * barWidth + (STICK_AROUND_STARTING_STOCKS - 1) * gap;
  const startX = centerX - totalWidth / 2;
  context.fillStyle = 'rgba(0, 0, 0, 0.5)';
  context.fillRect(startX - 2, y - 2, totalWidth + 4, barHeight + 4);
  context.fillStyle = '#ff4044';
  for (let index = 0; index < fighter.stocks; index += 1) {
    context.fillRect(startX + index * (barWidth + gap), y, barWidth, barHeight);
  }
}

function updateHud(runtime: StickAroundOverlayRuntime): void {
  runtime.status.textContent = getStickAroundOverlayOpponentLabel(
    runtime.game,
    runtime.currentUserId
  );
}

function getStickAroundReadyLabel(runtime: StickAroundOverlayRuntime): string {
  const role = runtime.game.players.host.userId === runtime.currentUserId ? 'host' : 'guest';
  return runtime.game.readyPlayers[role]
    ? t('gamesStickAroundWaiting')
    : t('gamesStickAroundReady');
}

function getCanvasStatusText(runtime: StickAroundOverlayRuntime, now: number): string | null {
  const { game } = runtime;
  if (game.status === 'ready') return null;
  if (game.status === 'countdown') {
    const seconds = Math.max(
      1,
      Math.ceil((game.phaseStartedAt + STICK_AROUND_COUNTDOWN_MS - now) / 1000)
    );
    return t('gamesStickAroundStarting', { seconds });
  }
  if (game.status === 'finished') return getWinnerStatusText(game, game.winnerUserId);
  if (game.status === 'desynced') return t('gamesStickAroundDesynced');
  return null;
}

function getWinnerStatusText(
  game: PublicStickAroundGame,
  winnerUserId: string | null | undefined
): string {
  const winner = Object.values(game.players).find((player) => player.userId === winnerUserId);
  return winner
    ? t('gamesStickAroundWinner', { winner: winner.displayName || 'Player' })
    : t('gamesStickAroundTie');
}

function getStickAroundOverlayOpponentLabel(
  game: PublicStickAroundGame,
  currentUserId: string
): string {
  const opponent =
    game.players.host.userId === currentUserId ? game.players.guest : game.players.host;
  return opponent.displayName || t('gamesStickAroundPlayer');
}

function handleStickAroundKey(
  event: KeyboardEvent,
  runtime: StickAroundOverlayRuntime,
  pressed: boolean
): void {
  if (runtime.game.status !== 'active' || isTypingTarget(event.target)) return;
  const key = event.key.toLowerCase();
  const before = { ...runtime.controls };
  if (key === 'arrowleft' || key === 'a') runtime.controls.left = pressed;
  if (key === 'arrowright' || key === 'd') runtime.controls.right = pressed;
  if (key === 'arrowup' || key === 'w' || key === ' ') runtime.controls.jump = pressed;
  if (
    before.left !== runtime.controls.left ||
    before.right !== runtime.controls.right ||
    before.jump !== runtime.controls.jump
  ) {
    runtime.inputDirty = true;
    event.preventDefault();
    event.stopPropagation();
  }
}

function addStickAroundReadyHitboxListeners(
  root: HTMLElement,
  runtime: StickAroundOverlayRuntime,
  sendGameAction: SendGameAction
): void {
  const options = {
    capture: true,
    signal: runtime.listeners.signal
  };
  const handleRelease = (event: Event): void => {
    if (!isStickAroundReadyHitboxEvent(event, runtime)) return;
    sendGameAction(runtime.game.gameId, 'ready');
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  if (typeof window.PointerEvent === 'function') {
    root.addEventListener('pointerup', handleRelease, options);
    return;
  }

  root.addEventListener('mouseup', handleRelease, options);
  root.addEventListener('touchend', handleRelease, options);
}

function updateStickAroundReadyCursor(event: MouseEvent, runtime: StickAroundOverlayRuntime): void {
  runtime.root.style.cursor = isStickAroundReadyHitboxEvent(event, runtime) ? 'pointer' : 'default';
}

function resetStickAroundReadyCursor(runtime: StickAroundOverlayRuntime): void {
  runtime.root.style.cursor = 'default';
}

function isStickAroundReadyHitboxEvent(event: Event, runtime: StickAroundOverlayRuntime): boolean {
  if (
    runtime.game.status !== 'ready' ||
    !runtime.readyHitbox ||
    runtime.shell.statusOverlay.isBlocking()
  )
    return false;

  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(STICK_AROUND_INTERACTIVE_POINTER_TARGET_SELECTOR)) return false;

  const point = getStickAroundOverlayPointerPoint(event, runtime.root);
  if (!point) return false;

  return isPointInStickAroundRect(point, runtime.readyHitbox);
}

function getStickAroundOverlayPointerPoint(
  event: Event,
  root: HTMLElement
): { x: number; y: number } | null {
  const rect = root.getBoundingClientRect();
  if (event instanceof MouseEvent) {
    if (event.button !== 0) return null;
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }
  if (typeof TouchEvent !== 'undefined' && event instanceof TouchEvent) {
    const touch = event.changedTouches[0];
    return touch
      ? {
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top
        }
      : null;
  }
  return null;
}

function isPointInStickAroundRect(point: { x: number; y: number }, rect: StickAroundRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function blockStickAroundFeedPointerEvent(event: Event): void {
  const target = event.target instanceof Element ? event.target : null;
  const isScrollEvent = event.type === 'wheel' || event.type === 'touchmove';
  if (!isScrollEvent && target?.closest(STICK_AROUND_INTERACTIVE_POINTER_TARGET_SELECTOR)) {
    event.stopPropagation();
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) ||
    Boolean(target.closest('[contenteditable="true"]'))
  );
}

function resizeStickAroundOverlay(runtime: StickAroundOverlayRuntime): void {
  resizeCanvasToSurface(runtime.canvas, runtime.feedSurface);
}

function resizeCanvasToSurface(
  canvas: HTMLCanvasElement,
  surface: HTMLElement
): { height: number; width: number } {
  const rect = surface.getBoundingClientRect();
  const cssWidth = Math.max(
    CANVAS_MIN_WIDTH,
    Math.round(rect.width || surface.clientWidth || CANVAS_MIN_WIDTH)
  );
  const cssHeight = Math.max(
    CANVAS_MIN_HEIGHT,
    Math.round(rect.height || surface.clientHeight || CANVAS_MIN_HEIGHT)
  );
  const pixelRatio = getCanvasScale(canvas);
  const width = Math.round(cssWidth * pixelRatio);
  const height = Math.round(cssHeight * pixelRatio);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  return {
    height: cssHeight,
    width: cssWidth
  };
}

function getStickAroundCanvasViewport(
  canvas: HTMLCanvasElement,
  simulation: StickAroundSimulation
): StickAroundCanvasViewport {
  const canvasScale = getCanvasScale(canvas);
  const width = canvas.width / canvasScale;
  const height = canvas.height / canvasScale;
  const scale = Math.max(0.1, Math.min(1, width / simulation.width, height / simulation.height));
  return {
    offsetX: Math.round((width - simulation.width * scale) / 2),
    offsetY: Math.round((height - simulation.height * scale) / 2),
    scale
  };
}

function getCanvasScale(_canvas: HTMLCanvasElement): number {
  return Math.max(1, Math.min(2, window.devicePixelRatio || 1));
}

type StickAroundOverlayTheme = 'dark' | 'light';

export function getStickAroundThemeFighterColor(surface: HTMLElement): '#111111' | '#ffffff' {
  return getStickAroundFighterColor(getStickAroundOverlayTheme(surface));
}

function getStickAroundFighterColor(theme: StickAroundOverlayTheme): '#111111' | '#ffffff' {
  return theme === 'light' ? '#111111' : '#ffffff';
}

function getStickAroundOverlayTheme(surface: HTMLElement): StickAroundOverlayTheme {
  if (document.documentElement.hasAttribute('dark')) return 'dark';
  if (document.documentElement.hasAttribute('light')) return 'light';

  const surfaceStyle = getComputedStyle(surface);
  const bodyStyle = getComputedStyle(document.body);
  const textColor =
    surfaceStyle.getPropertyValue('--yt-spec-text-primary') ||
    surfaceStyle.getPropertyValue('--yt-live-chat-primary-text-color') ||
    surfaceStyle.color ||
    bodyStyle.color;
  const rgb = parseCssColor(textColor);
  if (rgb) return getColorLuminance(rgb) > 0.5 ? 'dark' : 'light';
  return document.documentElement.hasAttribute('dark') ? 'dark' : 'light';
}

function parseCssColor(value: string): { b: number; g: number; r: number } | null {
  const color = value.trim();
  const rgbMatch = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(color);
  if (rgbMatch) {
    return {
      b: Number(rgbMatch[3]),
      g: Number(rgbMatch[2]),
      r: Number(rgbMatch[1])
    };
  }

  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!hexMatch) return null;
  const hex = hexMatch[1];
  if (hex.length === 3) {
    return {
      b: Number.parseInt(`${hex[2]}${hex[2]}`, 16),
      g: Number.parseInt(`${hex[1]}${hex[1]}`, 16),
      r: Number.parseInt(`${hex[0]}${hex[0]}`, 16)
    };
  }

  return {
    b: Number.parseInt(hex.slice(4, 6), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    r: Number.parseInt(hex.slice(0, 2), 16)
  };
}

function getColorLuminance({ b, g, r }: { b: number; g: number; r: number }): number {
  const [red, green, blue] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function selectAnimationFrame(
  frames: StickAroundAnimationFrame[] | undefined,
  now: number
): StickAroundAnimationFrame | null {
  if (!frames?.length) return null;
  const totalDuration = frames.reduce((total, frame) => total + frame.duration, 0);
  let cursor = now % Math.max(1, totalDuration);
  for (const frame of frames) {
    cursor -= frame.duration;
    if (cursor <= 0) return frame;
  }
  return frames[frames.length - 1];
}

function findChatFeedSurface(): HTMLElement | null {
  const feedSurface = document.querySelector<HTMLElement>(CHAT_FEED_SURFACE_SELECTOR);
  if (feedSurface) return feedSurface;
  const scroller = findChatScroller();
  if (scroller) return scroller;
  const message = document.querySelector<HTMLElement>(CHAT_MESSAGE_SELECTOR);
  return (
    message?.closest<HTMLElement>(CHAT_FEED_SURFACE_SELECTOR) || message?.parentElement || null
  );
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  { forceEllipsis = false }: { forceEllipsis?: boolean } = {}
): string {
  if (!forceEllipsis && context.measureText(text).width <= maxWidth) return text;
  const suffix = '...';
  if (maxWidth <= 0) return '';
  let next = text;
  while (next.length > 0 && context.measureText(`${next}${suffix}`).width > maxWidth) {
    next = next.slice(0, -1);
  }
  if (!next && context.measureText(suffix).width > maxWidth) return '';
  return `${next}${suffix}`;
}

function wrapBubbleTokens(
  context: CanvasRenderingContext2D,
  tokens: StickAroundBubbleToken[],
  maxWidth: number,
  maxLines: number,
  runtime: StickAroundOverlayRuntime,
  emojiSize: number
): StickAroundBubbleLine[] {
  const lines: StickAroundBubbleLine[] = [];
  let current: StickAroundBubbleLine = createEmptyBubbleLine();
  let truncated = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (isBubbleSpaceToken(token) && !current.items.length) continue;

    let item = createBubbleLineItem(context, token, runtime, emojiSize);
    if (!item) continue;

    if (!current.items.length && item.type === 'text' && item.width > maxWidth) {
      item = createBubbleTextItem(
        context,
        fitText(context, item.text, maxWidth, { forceEllipsis: true })
      );
      appendBubbleLineItem(current, item);
      truncated = true;
      break;
    }

    if (current.width + item.width <= maxWidth || !current.items.length) {
      appendBubbleLineItem(current, item);
      continue;
    }

    pushBubbleLine(lines, current);
    if (lines.length === maxLines) {
      truncated = true;
      break;
    }
    current = createEmptyBubbleLine();
    if (isBubbleSpaceToken(token)) continue;
    item = createBubbleLineItem(context, token, runtime, emojiSize);
    if (!item) continue;
    if (item.type === 'text' && item.width > maxWidth) {
      item = createBubbleTextItem(
        context,
        fitText(context, item.text, maxWidth, { forceEllipsis: true })
      );
      truncated = true;
      appendBubbleLineItem(current, item);
      break;
    }
    appendBubbleLineItem(current, item);
  }

  if (lines.length < maxLines) pushBubbleLine(lines, current);
  if (
    lines.length === maxLines &&
    getBubbleLineText(lines).trim() !== getBubbleTokenText(tokens).trim()
  ) {
    truncated = true;
  }
  if (!lines.length) {
    return [
      {
        items: [createBubbleTextItem(context, 'chat')],
        width: context.measureText('chat').width
      }
    ];
  }
  if (truncated && !doesBubbleLineEndWithEllipsis(lines[lines.length - 1])) {
    lines[lines.length - 1] = ellipsizeBubbleLine(context, lines[lines.length - 1], maxWidth);
  }
  return lines;
}

function createEmptyBubbleLine(): StickAroundBubbleLine {
  return {
    items: [],
    width: 0
  };
}

function createBubbleLineItem(
  context: CanvasRenderingContext2D,
  token: StickAroundBubbleToken,
  runtime: StickAroundOverlayRuntime,
  emojiSize: number
): StickAroundBubbleLineItem | null {
  if (token.type === 'text') return createBubbleTextItem(context, token.text);
  const image = getBubbleEmojiImage(runtime, token.segment);
  return {
    alt: token.segment.alt,
    image,
    size: emojiSize,
    type: 'emoji',
    width: emojiSize
  };
}

function createBubbleTextItem(
  context: CanvasRenderingContext2D,
  text: string
): StickAroundBubbleLineItem {
  return {
    text,
    type: 'text',
    width: context.measureText(text).width
  };
}

function getBubbleEmojiImage(
  runtime: StickAroundOverlayRuntime,
  segment: Extract<RichTextSegment, { type: 'emoji' }>
): HTMLImageElement | null {
  if (!segment.src) return null;
  const existing = runtime.emojiImages.get(segment.src);
  if (existing) return existing;
  const image = new Image();
  image.decoding = 'async';
  image.src = segment.src;
  runtime.emojiImages.set(segment.src, image);
  return image;
}

function appendBubbleLineItem(line: StickAroundBubbleLine, item: StickAroundBubbleLineItem): void {
  line.items.push(item);
  line.width += item.width;
}

function pushBubbleLine(lines: StickAroundBubbleLine[], line: StickAroundBubbleLine): void {
  trimTrailingBubbleSpaces(line);
  if (line.items.length) lines.push(line);
}

function trimTrailingBubbleSpaces(line: StickAroundBubbleLine): void {
  let last = line.items.at(-1);
  while (last?.type === 'text' && last.text.trim() === '') {
    const item = line.items.pop();
    if (item) line.width -= item.width;
    last = line.items.at(-1);
  }
}

function ellipsizeBubbleLine(
  context: CanvasRenderingContext2D,
  line: StickAroundBubbleLine,
  maxWidth: number
): StickAroundBubbleLine {
  const nextLine: StickAroundBubbleLine = {
    items: line.items.map((item) => ({ ...item })),
    width: line.width
  };
  trimTrailingBubbleSpaces(nextLine);
  const ellipsis = createBubbleTextItem(context, '...');
  while (nextLine.items.length && nextLine.width + ellipsis.width > maxWidth) {
    const item = nextLine.items.pop();
    if (item) nextLine.width -= item.width;
    trimTrailingBubbleSpaces(nextLine);
  }
  if (ellipsis.width <= maxWidth) appendBubbleLineItem(nextLine, ellipsis);
  return nextLine.items.length
    ? nextLine
    : {
        items: [
          createBubbleTextItem(context, fitText(context, '...', maxWidth, { forceEllipsis: true }))
        ],
        width: Math.min(context.measureText('...').width, maxWidth)
      };
}

function doesBubbleLineEndWithEllipsis(line: StickAroundBubbleLine | undefined): boolean {
  const item = line?.items.at(-1);
  return item?.type === 'text' && item.text.endsWith('...');
}

function isBubbleSpaceToken(token: StickAroundBubbleToken): boolean {
  return token.type === 'text' && token.text.trim() === '';
}

function getBubbleTokenText(tokens: StickAroundBubbleToken[]): string {
  return tokens.map((token) => (token.type === 'text' ? token.text : token.segment.alt)).join('');
}

function getBubbleLineText(lines: StickAroundBubbleLine[]): string {
  return lines
    .flatMap((line) => line.items.map((item) => (item.type === 'text' ? item.text : item.alt)))
    .join('');
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, width, height, radius);
  } else {
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
  }
  context.closePath();
  context.fill();
  context.stroke();
}

function createRenderRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = Math.imul(value ^ (value >>> 15), 1 | value);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
