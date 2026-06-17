/**
 * HELP-A-FRIEND! Trivia realtime game panel.
 *
 * Renders the chat-style canvas, keeps local animation timing smooth, and sends
 * answer/phase intents back to the Playground room state machine.
 */
import { t } from '../../../../shared/i18n';
import { createGamesIcon } from '../../../../shared/icons';
import { ytcqCreateElement } from '../../../../shared/managed-dom';
import type { ReplayTriviaGenerationToken, ReplayTriviaQuestion } from '../../../../shared/playground-trivia';
import { createGamePanelShell } from '../panel-shell';
import { createGamePanelStatusOverlay } from '../panel-feedback';
import type { GamePanelStatusOverlay } from '../panel-feedback';
import { createGameSoundController } from '../sound';
import { generateReplayTriviaQuestions } from './client';
import { EMPTY_REPLAY_TRIVIA_ASSETS, getReplayTriviaAssets } from './assets';
import {
  canRenderReplayTriviaCanvas,
  cancelScheduledFrame,
  configureReplayTriviaCanvas,
  getCanvasPoint,
  getNow,
  isPointInRect,
  scheduleFrame,
  syncReplayTriviaCanvasPixelRatio
} from './canvas';
import {
  ANSWER_GRID_MARGIN_X,
  ANSWER_MAX_LINES,
  ANSWER_MIN_HEIGHT,
  ANSWER_TEXT_INSET_X,
  ANSWER_TEXT_INSET_Y,
  ANSWER_TIME_MS,
  ANSWER_UI_DELAY_MS,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CHAT_INTRO_DELAY_MS,
  CHAT_MESSAGE_ANIMATION_MS,
  CHAT_PROMPT_DELAY_MS,
  CONFETTI_DURATION_MS,
  CONFETTI_PARTICLE_COUNT,
  COUNTDOWN_MS,
  COUNTDOWN_NUMBER_DURATION_MS,
  COUNTDOWN_NUMBER_STAGGER_MS,
  FONT_STACK,
  GAME_TITLE,
  MESSAGE_SOUND_PATH,
  QUESTION_SCENE_OFFSET_Y,
  REVEAL_FRIEND_REPLY_DELAY_MS,
  REVEAL_MS,
  SCORE_FLAP_ANIMATION_MS,
  SCORE_FLAP_GAP,
  SCORE_FLAP_HEIGHT,
  SCORE_FLAP_WIDTH,
  SCORE_MS,
  STAMP_ANIMATION_MS,
  STAMP_IMPACT_SOUND_DELAY_MS,
  STAMP_SOUND_PATH,
  TEXT_SCALE
} from './constants';
import type {
  AnswerOptionLayout,
  AnswerTextLayout,
  BubbleSpriteKind,
  FriendBubbleOptions,
  ReplayTriviaGameStatus,
  PublicReplayTriviaGame,
  Rect,
  ReplayTriviaFallbackState,
  ReplayTriviaCanvasQuestion,
  ReplayTriviaGameState,
  SourceRect
} from './types';

const TROPHY_ICON_CROP: SourceRect = { drawOffsetY: 3, height: 48, width: 38, x: 28, y: 17 };
const WRONG_ICON_CROP: SourceRect = { drawScale: 0.54, height: 31, width: 31, x: 23, y: 15 };
const REPLAY_TRIVIA_SOUND_PATHS = [MESSAGE_SOUND_PATH, STAMP_SOUND_PATH] as const;

interface FriendBubbleTextSegment {
  bold?: boolean;
  text: string;
}

interface FriendBubbleTextLine {
  segments: FriendBubbleTextSegment[];
  width: number;
}

let activeReplayTriviaPanel: ReplayTriviaGameState | null = null;
let activeReplayTriviaFallback: ReplayTriviaFallbackState | null = null;

export function openReplayTriviaGamePanel(
  game: PublicReplayTriviaGame,
  currentUserId: string,
  onAction: (gameId: string, action: string, payload?: Record<string, unknown>) => void,
  onVisibilityChanged?: () => void
): void {
  closeReplayTriviaGamePanel({ notify: false });

  const listeners = new AbortController();
  const soundController = createGameSoundController({
    className: 'ytcq-replay-trivia-game-sound-toggle',
    preloadPaths: REPLAY_TRIVIA_SOUND_PATHS,
    signal: listeners.signal
  });
  const { body, panel } = createGamePanelShell({
    ariaLabel: GAME_TITLE,
    classNamePrefix: 'ytcq-replay-trivia-game',
    closeLabel: t('gamesMinimize'),
    headerActions: [soundController.button],
    icon: createGamesIcon(),
    onClose: () => closeReplayTriviaGamePanel(),
    signal: listeners.signal,
    subtitle: getReplayTriviaOpponentLabel(game, currentUserId),
    title: GAME_TITLE
  });

  const canvas = ytcqCreateElement('canvas');
  canvas.className = 'ytcq-replay-trivia-canvas';
  canvas.setAttribute('aria-label', GAME_TITLE);
  canvas.setAttribute('role', 'application');
  canvas.tabIndex = 0;
  const statusOverlay = createGamePanelStatusOverlay({
    classNamePrefix: 'ytcq-replay-trivia-game'
  });
  body.append(canvas, statusOverlay.element);

  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext('2d');
  } catch {
    context = null;
  }

  if (!context || !canRenderReplayTriviaCanvas(context)) {
    const fallback = ytcqCreateElement('div');
    fallback.className = 'ytcq-replay-trivia-game-fallback';
    fallback.textContent = 'Canvas is unavailable.';
    body.replaceChildren(fallback);
    activeReplayTriviaFallback = {
      listeners,
      onVisibilityChanged: onVisibilityChanged || null,
      panel
    };
    onVisibilityChanged?.();
    return;
  }

  activeReplayTriviaPanel = {
    assets: EMPTY_REPLAY_TRIVIA_ASSETS,
    canvas,
    closeButtonRect: null,
    context,
    currentQuestionIndex: game.currentQuestionIndex,
    currentUserId,
    frameId: null,
    game,
    generationToken: null,
    generationTokenRequested: false,
    hitboxes: [],
    hoveredAnswerIndex: null,
    hoveredCloseButton: false,
    listeners,
    onAction,
    onVisibilityChanged: onVisibilityChanged || null,
    opponentAnswerIndex: null,
    opponentScore: getReplayTriviaRoleScore(game, getOpponentRole(game, currentUserId)),
    panel,
    phase: game.status,
    phaseStartedAt: getNow(),
    pixelRatio: configureReplayTriviaCanvas(canvas),
    playedSoundIds: new Set<string>(),
    preparationError: '',
    questionGenerationStarted: false,
    sentActionIds: new Set<string>(),
    selectedAt: null,
    soundController,
    statusOverlay,
    userAnswerIndex: null,
    userScore: getReplayTriviaRoleScore(game, getCurrentUserRole(game, currentUserId))
  };

  syncReplayTriviaPanelFromGame(activeReplayTriviaPanel, game, currentUserId, { resetPhaseClock: false });
  maybeGenerateReplayTriviaQuestions(activeReplayTriviaPanel);

  canvas.addEventListener('click', handleReplayTriviaCanvasClick, { signal: listeners.signal });
  canvas.addEventListener('keydown', handleReplayTriviaCanvasKeydown, { signal: listeners.signal });
  canvas.addEventListener('mousemove', handleReplayTriviaCanvasMouseMove, { signal: listeners.signal });
  canvas.addEventListener('mouseleave', handleReplayTriviaCanvasMouseLeave, { signal: listeners.signal });

  void getReplayTriviaAssets().then((assets) => {
    if (!activeReplayTriviaPanel || activeReplayTriviaPanel.canvas !== canvas) return;
    activeReplayTriviaPanel.assets = assets;
    renderReplayTriviaGame(getNow());
  }).catch(() => undefined);

  renderReplayTriviaGame(getNow());
  startReplayTriviaLoop();
  onVisibilityChanged?.();
}

export function closeReplayTriviaGamePanel({ notify = true }: { notify?: boolean } = {}): void {
  const fallback = activeReplayTriviaFallback;
  if (fallback) {
    fallback.listeners.abort();
    fallback.panel.remove();
    activeReplayTriviaFallback = null;
    if (notify) fallback.onVisibilityChanged?.();
  }

  const state = activeReplayTriviaPanel;
  if (!state) return;

  if (state.frameId !== null) cancelScheduledFrame(state.frameId);
  state.statusOverlay.clear();
  state.listeners.abort();
  state.panel.remove();
  activeReplayTriviaPanel = null;
  if (notify) state.onVisibilityChanged?.();
}

export function isReplayTriviaGamePanelOpen(): boolean {
  return Boolean(activeReplayTriviaPanel || activeReplayTriviaFallback);
}

export function getActiveReplayTriviaGameId(): string {
  return activeReplayTriviaPanel?.game.gameId || '';
}

export function getReplayTriviaGamePanelOverlay(): GamePanelStatusOverlay | null {
  return activeReplayTriviaPanel?.statusOverlay || null;
}

export function updateReplayTriviaGamePanel(
  game: PublicReplayTriviaGame,
  currentUserId: string,
  generationToken?: ReplayTriviaGenerationToken,
  preparationError?: string
): void {
  if (!activeReplayTriviaPanel || activeReplayTriviaPanel.game.gameId !== game.gameId) return;

  syncReplayTriviaPanelFromGame(activeReplayTriviaPanel, game, currentUserId, {
    generationToken,
    preparationError
  });
  activeReplayTriviaPanel.statusOverlay.clear({ owner: 'game', resetKey: true });
  maybeGenerateReplayTriviaQuestions(activeReplayTriviaPanel);
  renderReplayTriviaGame(getNow());
}

export function isPublicReplayTriviaGame(game: unknown): game is PublicReplayTriviaGame {
  const candidate = game as Partial<PublicReplayTriviaGame> | undefined;
  return Boolean(candidate) &&
    candidate?.gameType === 'replay-trivia' &&
    typeof candidate.gameId === 'string' &&
    typeof candidate.status === 'string' &&
    Boolean(candidate.players?.host?.userId) &&
    Boolean(candidate.players?.guest?.userId);
}

function startReplayTriviaLoop(): void {
  const state = activeReplayTriviaPanel;
  if (!state) return;

  state.frameId = scheduleFrame((now) => {
    if (!activeReplayTriviaPanel) return;
    advanceReplayTriviaGame(now);
    renderReplayTriviaGame(now);
    startReplayTriviaLoop();
  });
}

function syncReplayTriviaPanelFromGame(
  state: ReplayTriviaGameState,
  game: PublicReplayTriviaGame,
  currentUserId: string,
  {
    generationToken,
    preparationError,
    resetPhaseClock = true
  }: {
    generationToken?: ReplayTriviaGenerationToken;
    preparationError?: string;
    resetPhaseClock?: boolean;
  } = {}
): void {
  const previousStatus = state.game.status;
  const previousQuestionIndex = state.game.currentQuestionIndex;
  const phaseChanged = previousStatus !== game.status || previousQuestionIndex !== game.currentQuestionIndex;
  state.game = game;
  state.currentUserId = currentUserId;
  if (generationToken?.gameId === game.gameId && generationToken.generationToken !== state.generationToken?.generationToken) {
    state.generationToken = generationToken;
    state.generationTokenRequested = false;
  }
  state.currentQuestionIndex = game.currentQuestionIndex;
  state.userScore = getReplayTriviaRoleScore(game, getCurrentUserRole(game, currentUserId));
  state.opponentScore = getReplayTriviaRoleScore(game, getOpponentRole(game, currentUserId));
  if (game.status !== 'preparing') {
    state.preparationError = '';
  } else if (preparationError) {
    state.preparationError = getReplayTriviaPreparationError(preparationError);
  }

  if (phaseChanged) {
    setReplayTriviaPhase(state, game.status, resetPhaseClock ? getNow() : state.phaseStartedAt);
    if (previousQuestionIndex !== game.currentQuestionIndex ||
      game.status === 'question' ||
      shouldShowReplayTriviaAnswerChoices(game.status)) {
      state.userAnswerIndex = getPublicReplayTriviaAnswerIndex(game, getCurrentUserRole(game, currentUserId));
      state.opponentAnswerIndex = getPublicReplayTriviaAnswerIndex(game, getOpponentRole(game, currentUserId));
      state.selectedAt = null;
    }
    return;
  }

  state.phase = game.status;
  state.userAnswerIndex = getPublicReplayTriviaAnswerIndex(game, getCurrentUserRole(game, currentUserId)) ??
    state.userAnswerIndex;
  state.opponentAnswerIndex = getPublicReplayTriviaAnswerIndex(game, getOpponentRole(game, currentUserId));
}

function maybeGenerateReplayTriviaQuestions(state: ReplayTriviaGameState): void {
  if (state.game.status !== 'preparing') return;
  if (state.preparationError) return;
  if (state.questionGenerationStarted || state.currentUserId !== state.game.questionProviderUserId) return;

  if (!state.generationToken || state.generationToken.gameId !== state.game.gameId || state.generationToken.expiresAt <= Date.now()) {
    if (!state.generationTokenRequested) {
      state.generationTokenRequested = true;
      state.onAction(state.game.gameId, 'requestGenerationToken');
    }
    return;
  }

  state.questionGenerationStarted = true;
  state.preparationError = '';
  void generateReplayTriviaQuestions({
    gameId: state.game.gameId,
    generationToken: state.generationToken.generationToken,
    questionCount: 10,
    userId: state.currentUserId
  }).then((response) => {
    if (!activeReplayTriviaPanel || activeReplayTriviaPanel.game.gameId !== state.game.gameId) return;
    activeReplayTriviaPanel.onAction(activeReplayTriviaPanel.game.gameId, 'submitQuestions', {
      questions: response.questions.map(toReplayTriviaQuestionPayload)
    });
  }).catch((error) => {
    if (!activeReplayTriviaPanel || activeReplayTriviaPanel.game.gameId !== state.game.gameId) return;
    activeReplayTriviaPanel.preparationError = getReplayTriviaPreparationError(error);
    activeReplayTriviaPanel.generationToken = null;
    activeReplayTriviaPanel.generationTokenRequested = false;
    activeReplayTriviaPanel.questionGenerationStarted = false;
  });
}

function getReplayTriviaPreparationError(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';
  if (!message) return 'Could not load trivia.';
  if (message.includes('Replay Trivia question generation returned an incomplete question pack.') ||
    message.includes('Replay Trivia questions must include')) {
    return 'Could not prepare trivia. Close this game and start a new match.';
  }
  return message;
}

function toReplayTriviaQuestionPayload(question: ReplayTriviaQuestion): Record<string, unknown> {
  return {
    choices: question.choices,
    correctChoiceIndex: question.correctChoiceIndex,
    friendIntro: question.friendIntro,
    id: question.id,
    prompt: question.prompt,
    rightReply: question.rightReply,
    wrongReply: question.wrongReply
  };
}

function sendReplayTriviaActionOnce(
  state: ReplayTriviaGameState,
  id: string,
  action: string,
  payload?: Record<string, unknown>
): void {
  if (state.sentActionIds.has(id)) return;
  state.sentActionIds.add(id);
  state.onAction(state.game.gameId, action, payload);
}

function advanceReplayTriviaGame(now: number): void {
  const state = activeReplayTriviaPanel;
  if (!state) return;
  if (state.currentUserId !== state.game.questionProviderUserId) return;

  const elapsed = now - state.phaseStartedAt;
  if (state.phase === 'countdown' && elapsed >= COUNTDOWN_MS) {
    sendReplayTriviaActionOnce(state, `advance:countdown:${state.currentQuestionIndex}`, 'advance');
    return;
  }

  if (state.phase === 'question' && getQuestionAnswerElapsed(state, now) >= ANSWER_TIME_MS) {
    sendReplayTriviaActionOnce(state, `timeout:${state.currentQuestionIndex}`, 'timeout');
    return;
  }

  if (state.phase === 'reveal' && elapsed >= REVEAL_MS) {
    sendReplayTriviaActionOnce(state, `advance:reveal:${state.currentQuestionIndex}`, 'advance');
    return;
  }

  if (state.phase === 'score' && elapsed >= SCORE_MS) {
    sendReplayTriviaActionOnce(state, `advance:score:${state.currentQuestionIndex}`, 'advance');
  }
}

function setReplayTriviaPhase(state: ReplayTriviaGameState, phase: ReplayTriviaGameStatus, now: number): void {
  state.phase = phase;
  state.phaseStartedAt = now;
  state.hitboxes = [];
  state.closeButtonRect = null;
  state.hoveredCloseButton = false;
  state.playedSoundIds.clear();
  state.sentActionIds.clear();
}

function isQuestionAnswerUiReady(state: ReplayTriviaGameState, now: number): boolean {
  return now - state.phaseStartedAt >= ANSWER_UI_DELAY_MS;
}

function getQuestionAnswerElapsed(state: ReplayTriviaGameState, now: number): number {
  return Math.max(0, now - state.phaseStartedAt - ANSWER_UI_DELAY_MS);
}

function getDelayedProgress(elapsed: number, delay: number, duration: number): number {
  return Math.min(1, Math.max(0, (elapsed - delay) / duration));
}

function playTimedMessageSound(
  state: ReplayTriviaGameState,
  id: string,
  elapsed: number,
  delay: number
): void {
  playTimedSound(state, id, elapsed, delay, MESSAGE_SOUND_PATH);
}

function playTimedSound(
  state: ReplayTriviaGameState,
  id: string,
  elapsed: number,
  delay: number,
  path: string
): void {
  if (elapsed < delay || state.playedSoundIds.has(id)) return;

  state.playedSoundIds.add(id);
  state.soundController.play(path);
}

function handleReplayTriviaCanvasClick(event: MouseEvent): void {
  const state = activeReplayTriviaPanel;
  if (!state) return;
  if (hasPersistentReplayTriviaStatus(state)) return;

  const point = getCanvasPoint(state.canvas, event);
  if (state.phase === 'finished') {
    if (state.closeButtonRect && isPointInRect(point, state.closeButtonRect)) {
      state.onAction(state.game.gameId, 'leave');
      closeReplayTriviaGamePanel();
    }
    return;
  }

  if (state.phase !== 'question') return;
  if (state.userAnswerIndex !== null) return;
  if (!isQuestionAnswerUiReady(state, getNow())) return;

  const answer = state.hitboxes.find((hitbox) => isPointInRect(point, hitbox.rect));
  if (!answer) return;
  selectReplayTriviaAnswer(state, answer.index, getNow());
  renderReplayTriviaGame(getNow());
}

function handleReplayTriviaCanvasKeydown(event: KeyboardEvent): void {
  const state = activeReplayTriviaPanel;
  if (!state) return;
  if (hasPersistentReplayTriviaStatus(state)) return;

  if (state.phase === 'finished' && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    state.onAction(state.game.gameId, 'leave');
    closeReplayTriviaGamePanel();
    return;
  }

  if (state.phase !== 'question') return;
  if (state.userAnswerIndex !== null) return;
  if (!isQuestionAnswerUiReady(state, getNow())) return;

  const answerIndex = ['1', '2', '3', '4'].indexOf(event.key);
  if (answerIndex < 0) return;
  event.preventDefault();
  selectReplayTriviaAnswer(state, answerIndex, getNow());
  renderReplayTriviaGame(getNow());
}

function hasPersistentReplayTriviaStatus(state: ReplayTriviaGameState): boolean {
  return state.statusOverlay.isBlocking();
}

function handleReplayTriviaCanvasMouseMove(event: MouseEvent): void {
  const state = activeReplayTriviaPanel;
  if (!state) return;
  if (hasPersistentReplayTriviaStatus(state)) {
    state.hoveredAnswerIndex = null;
    state.hoveredCloseButton = false;
    state.canvas.style.cursor = 'default';
    return;
  }

  const point = getCanvasPoint(state.canvas, event);
  if (state.phase === 'finished') {
    const hoveredCloseButton = Boolean(state.closeButtonRect && isPointInRect(point, state.closeButtonRect));
    if (hoveredCloseButton === state.hoveredCloseButton) return;

    state.hoveredCloseButton = hoveredCloseButton;
    state.canvas.style.cursor = hoveredCloseButton ? 'pointer' : 'default';
    renderReplayTriviaGame(getNow());
    return;
  }

  if (state.phase !== 'question') return;
  if (state.userAnswerIndex !== null) return;

  const hoveredAnswerIndex = state.hitboxes.find((hitbox) => isPointInRect(point, hitbox.rect))?.index ?? null;
  if (hoveredAnswerIndex === state.hoveredAnswerIndex) return;

  state.hoveredAnswerIndex = hoveredAnswerIndex;
  state.canvas.style.cursor = hoveredAnswerIndex === null ? 'default' : 'pointer';
  renderReplayTriviaGame(getNow());
}

function handleReplayTriviaCanvasMouseLeave(): void {
  const state = activeReplayTriviaPanel;
  if (!state) return;

  state.hoveredAnswerIndex = null;
  state.hoveredCloseButton = false;
  state.canvas.style.cursor = 'default';
  renderReplayTriviaGame(getNow());
}

function selectReplayTriviaAnswer(state: ReplayTriviaGameState, userAnswerIndex: number, now: number): void {
  state.userAnswerIndex = userAnswerIndex;
  state.selectedAt = now;
  state.hoveredAnswerIndex = null;
  state.canvas.style.cursor = 'default';
  state.onAction(state.game.gameId, 'answer', { choiceIndex: userAnswerIndex });
}

function renderReplayTriviaGame(now: number): void {
  const state = activeReplayTriviaPanel;
  if (!state) return;

  state.pixelRatio = syncReplayTriviaCanvasPixelRatio(state.canvas, state.pixelRatio);
  const context = state.context;
  context.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawReplayTriviaSurface(context);

  if (state.phase === 'preparing') {
    drawLoadingState(context, state);
    return;
  }

  if (state.phase === 'countdown') {
    drawCountdown(context, state, now);
    return;
  }

  const chatBottom = drawChatRound(context, state, QUESTION_SCENE_OFFSET_Y, now);
  if (state.phase === 'question') {
    if (isQuestionAnswerUiReady(state, now)) {
      drawAnswerPicker(context, state, now, chatBottom, QUESTION_SCENE_OFFSET_Y);
    } else {
      state.hitboxes = [];
    }
    return;
  }

  drawRevealedAnswers(context, state, QUESTION_SCENE_OFFSET_Y, now);
  if (state.phase === 'score') drawScoreModal(context, state, now);
  if (state.phase === 'finished') drawFinalModal(context, state, now);
}

function drawReplayTriviaSurface(context: CanvasRenderingContext2D): void {
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawLoadingState(context: CanvasRenderingContext2D, state: ReplayTriviaGameState): void {
  drawIntroLogo(context, state);
  context.fillStyle = '#3f3f42';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const text = state.preparationError || (
    state.currentUserId === state.game.questionProviderUserId
      ? 'Loading...'
      : 'Waiting for trivia...'
  );
  context.font = `400 ${fitFontSize(context, text, CANVAS_WIDTH - 80, scaleFontSize(21), scaleFontSize(13), 2, 400)}px ${FONT_STACK}`;
  const lines = wrapText(context, text, CANVAS_WIDTH - 80, 2);
  drawWrappedLines(context, lines, CANVAS_WIDTH / 2, 356 - ((lines.length - 1) * 12), 24);
}

function drawCountdown(
  context: CanvasRenderingContext2D,
  state: ReplayTriviaGameState,
  now: number
): void {
  drawIntroLogo(context, state);
  const elapsed = Math.max(0, now - state.phaseStartedAt);
  [3, 2, 1].forEach((value, index) => {
    const progress = (elapsed - (index * COUNTDOWN_NUMBER_STAGGER_MS)) / COUNTDOWN_NUMBER_DURATION_MS;
    if (progress < 0 || progress >= 1) return;
    drawCountdownNumber(context, value, progress);
  });
}

function drawCountdownNumber(
  context: CanvasRenderingContext2D,
  value: number,
  progress: number
): void {
  const eased = easeOutCubic(progress);
  context.save();
  context.fillStyle = '#ffffff';
  context.strokeStyle = '#000000';
  context.lineWidth = 7;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const fontSize = scaleFontSize(96 - (eased * 40));
  context.font = `800 ${fontSize}px ${FONT_STACK}`;
  const y = 300 + (eased * 58);
  const tiltDirection = value === 2 ? 1 : -1;
  const tilt = tiltDirection * eased * 0.14;
  context.translate(CANVAS_WIDTH / 2, y);
  context.rotate(tilt);
  context.strokeText(String(value), 0, 0);
  context.fillText(String(value), 0, 0);
  context.restore();
}

function drawIntroLogo(context: CanvasRenderingContext2D, state: ReplayTriviaGameState): void {
  const logo = state.assets.logo;
  if (logo) {
    drawContainedImage(context, logo, 18, 38, 412, 268);
    return;
  }

  context.fillStyle = '#e9e9eb';
  fillRoundRect(context, 70, 130, 300, 48, 18, 18, 18, 18);
  context.fillStyle = '#2b96f4';
  fillRoundRect(context, 120, 178, 242, 58, 29, 29, 29, 29);
  context.fillStyle = '#303033';
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.font = `700 ${scaleFontSize(28)}px ${FONT_STACK}`;
  context.fillText('HELP-A-FRIEND!', 102, 164);
  context.fillStyle = '#ffffff';
  context.font = `700 ${scaleFontSize(38)}px ${FONT_STACK}`;
  context.fillText('Trivia', 194, 218);
}

function drawChatRound(
  context: CanvasRenderingContext2D,
  state: ReplayTriviaGameState,
  offsetY: number,
  now: number
): number {
  const question = getCurrentQuestion(state);
  const elapsed = state.phase === 'question' ? now - state.phaseStartedAt : Number.POSITIVE_INFINITY;
  const introProgress = getDelayedProgress(elapsed, CHAT_INTRO_DELAY_MS, CHAT_MESSAGE_ANIMATION_MS);
  const promptProgress = getDelayedProgress(elapsed, CHAT_PROMPT_DELAY_MS, CHAT_MESSAGE_ANIMATION_MS);
  const introY = 30 + offsetY;
  let introHeight = 45;
  let chatBottom = introY;

  if (state.phase === 'question') {
    playTimedMessageSound(state, 'question-intro', elapsed, CHAT_INTRO_DELAY_MS);
  }

  if (introProgress > 0) {
    introHeight = drawAnimatedFriendBubble(context, question.friendIntro, 28, introY, 322, 45, 18, introProgress, {
      image: state.assets.greyBubbleNoTail,
      kind: 'no-tail',
      tail: false
    });
    chatBottom = introY + introHeight;
  }

  const promptY = introY + introHeight + 8;
  let promptHeight = 78;
  if (state.phase === 'question') {
    playTimedMessageSound(state, 'question-prompt', elapsed, CHAT_PROMPT_DELAY_MS);
  }

  if (promptProgress > 0) {
    promptHeight = drawAnimatedFriendBubble(context, question.prompt, 28, promptY, 376, 78, 18, promptProgress, {
      flipImage: true,
      image: state.assets.greyBubbleTail,
      kind: 'right-tail',
      tail: true
    });
    chatBottom = promptY + promptHeight;
  }

  context.fillStyle = '#808080';
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  context.font = `500 ${scaleFontSize(16)}px ${FONT_STACK}`;
  context.fillText(`${state.currentQuestionIndex + 1}/${state.game.totalQuestions}`, CANVAS_WIDTH - 24, 58 + offsetY);

  if (state.phase === 'question' && elapsed >= ANSWER_UI_DELAY_MS) {
    drawPickAnswerPrompt(context, CANVAS_WIDTH / 2, getPickAnswerPromptY(promptY + promptHeight));
  }

  return chatBottom;
}

function drawAnswerPicker(
  context: CanvasRenderingContext2D,
  state: ReplayTriviaGameState,
  now: number,
  chatBottom: number,
  offsetY: number
): void {
  const question = getCurrentQuestion(state);
  const gridX = ANSWER_GRID_MARGIN_X;
  const gridY = getAnswerGridY(chatBottom);
  const cellWidth = (CANVAS_WIDTH - (ANSWER_GRID_MARGIN_X * 2)) / 2;
  const cornerRadius = 18;
  const answerElapsed = getQuestionAnswerElapsed(state, now);
  const progress = Math.min(1, answerElapsed / 420);
  const answerLayouts = createAnswerOptionLayouts(context, question.answers, gridX, gridY, cellWidth);
  state.hitboxes = [];

  answerLayouts.forEach((answer) => {
    state.hitboxes.push({ index: answer.index, rect: answer.rect });

    context.fillStyle = getAnswerFillColor(state, answer.index);
    if (answer.index === 0) {
      fillRoundRect(context, answer.rect.x, answer.rect.y, answer.rect.width, answer.rect.height, cornerRadius, 0, 0, 0);
    } else if (answer.index === 1) {
      fillRoundRect(context, answer.rect.x, answer.rect.y, answer.rect.width, answer.rect.height, 0, cornerRadius, 0, 0);
    } else if (answer.index === 2) {
      fillRoundRect(context, answer.rect.x, answer.rect.y, answer.rect.width, answer.rect.height, 0, 0, 0, cornerRadius);
    } else {
      fillRoundRect(context, answer.rect.x, answer.rect.y, answer.rect.width, answer.rect.height, 0, 0, cornerRadius, 0);
    }

    context.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    context.lineWidth = 1;
    context.strokeRect(answer.rect.x, answer.rect.y, answer.rect.width, answer.rect.height);
    drawCenteredAnswerText(context, answer.text, answer.rect, progress);
  });

  drawSelectedAnswerTarget(context, state);

  const gridBottom = answerLayouts.reduce((bottom, answer) => Math.max(bottom, answer.rect.y + answer.rect.height), gridY);
  const elapsed = Math.min(ANSWER_TIME_MS, answerElapsed);
  const remaining = Math.max(0, Math.ceil((ANSWER_TIME_MS - elapsed) / 1000));
  drawTimer(context, remaining, elapsed / ANSWER_TIME_MS, getTimerY(gridBottom, offsetY));

  drawInputBar(context, state.userAnswerIndex === null ? 'Waiting for your response...' : 'Locked in...', offsetY);
}

function getPickAnswerPromptY(chatBottom: number): number {
  return Math.min(218, chatBottom + 38);
}

function getAnswerGridY(chatBottom: number): number {
  return Math.min(244, getPickAnswerPromptY(chatBottom) + 24);
}

function getTimerY(gridBottom: number, offsetY: number): number {
  return Math.min(376 + offsetY, gridBottom + 28);
}

function drawTimer(
  context: CanvasRenderingContext2D,
  remaining: number,
  progress: number,
  centerY: number
): void {
  const label = `${remaining}s left`;
  context.font = `800 ${scaleFontSize(21)}px ${FONT_STACK}`;
  const labelWidth = context.measureText(label).width;
  const iconRadius = 16;
  const iconInnerRadius = 12.5;
  const gap = 12;
  const groupWidth = (iconRadius * 2) + gap + labelWidth;
  const centerX = (CANVAS_WIDTH - groupWidth) / 2 + iconRadius;
  context.fillStyle = '#000000';
  context.beginPath();
  context.arc(centerX, centerY, iconRadius, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.moveTo(centerX, centerY);
  context.arc(centerX, centerY, iconInnerRadius, -Math.PI / 2, (-Math.PI / 2) + (Math.PI * 2 * (1 - progress)));
  context.closePath();
  context.fill();
  context.fillStyle = '#000000';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(label, centerX + iconRadius + gap, centerY + 1);
}

function getAnswerFillColor(state: ReplayTriviaGameState, answerIndex: number): string {
  if (state.userAnswerIndex === answerIndex) return '#070707';
  if (state.userAnswerIndex !== null) return '#6ab9f7';
  return state.hoveredAnswerIndex === answerIndex ? '#070707' : '#3aa7ff';
}

function drawSelectedAnswerTarget(
  context: CanvasRenderingContext2D,
  state: ReplayTriviaGameState
): void {
  if (state.userAnswerIndex === null || !state.assets.target) return;

  const selected = state.hitboxes.find((hitbox) => hitbox.index === state.userAnswerIndex);
  if (!selected) return;

  const size = 31;
  context.drawImage(
    state.assets.target,
    selected.rect.x + 6,
    selected.rect.y + 6,
    size,
    size
  );
}

function drawRevealedAnswers(
  context: CanvasRenderingContext2D,
  state: ReplayTriviaGameState,
  offsetY: number,
  now: number
): void {
  const question = getCurrentQuestion(state);
  const elapsed = now - state.phaseStartedAt;
  const userAnswer = state.userAnswerIndex === null ? 'No answer' : question.answers[state.userAnswerIndex];
  const opponentAnswer = state.opponentAnswerIndex === null ? 'No answer' : question.answers[state.opponentAnswerIndex];
  const userCorrect = question.correctIndex !== undefined && state.userAnswerIndex === question.correctIndex;
  const opponentCorrect = question.correctIndex !== undefined && state.opponentAnswerIndex === question.correctIndex;

  drawPlayerBubble(context, opponentAnswer, 32, 208 + offsetY, 180, 64, '#00d329', 'left', state.assets.greenBubble);
  drawReactionImage(
    context,
    opponentCorrect ? state.assets.trophy : state.assets.wrong,
    177,
    190 + offsetY,
    36,
    opponentCorrect ? '#FCDF69' : '#FDA9A6',
    opponentCorrect ? TROPHY_ICON_CROP : WRONG_ICON_CROP
  );
  drawPlayerBubble(context, userAnswer, 236, 208 + offsetY, 180, 64, '#2b96f4', 'right', state.assets.blueBubble);
  drawReactionImage(
    context,
    userCorrect ? state.assets.trophy : state.assets.wrong,
    235,
    190 + offsetY,
    36,
    userCorrect ? '#FCDF69' : '#FDA9A6',
    userCorrect ? TROPHY_ICON_CROP : WRONG_ICON_CROP
  );

  const reply = userCorrect ? question.rightReply : question.wrongReply;
  const correctAnswer = question.correctIndex === undefined ? '' : question.answers[question.correctIndex] || '';
  const replyProgress = state.phase === 'reveal'
    ? getDelayedProgress(elapsed, REVEAL_FRIEND_REPLY_DELAY_MS, CHAT_MESSAGE_ANIMATION_MS)
    : 1;
  if (state.phase === 'reveal') {
    playTimedMessageSound(state, 'reveal-reply', elapsed, REVEAL_FRIEND_REPLY_DELAY_MS);
  }
  if (replyProgress > 0) {
    drawAnimatedFriendBubble(context, boldFriendReplyAnswer(reply, correctAnswer), 28, 300 + offsetY, 376, 76, 18, replyProgress, {
      flipImage: true,
      image: state.assets.greyBubbleTail,
      kind: 'right-tail',
      tail: true
    });
  }
  drawInputBar(context, userCorrect ? 'Results are in! Nice save.' : 'Results are in! Better luck next time.', offsetY);
}

function drawScoreModal(
  context: CanvasRenderingContext2D,
  state: ReplayTriviaGameState,
  now: number
): void {
  drawScrim(context);
  const modal = { x: 36, y: 48, width: 376, height: 324 };
  drawFloatingPanel(context, modal.x, modal.y, modal.width, modal.height, 34);
  context.fillStyle = '#111111';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `400 ${scaleFontSize(20)}px ${FONT_STACK}`;
  const question = getCurrentQuestion(state);
  const userCorrect = question.correctIndex !== undefined && state.userAnswerIndex === question.correctIndex;
  const opponentCorrect = question.correctIndex !== undefined && state.opponentAnswerIndex === question.correctIndex;
  const title = userCorrect
    ? 'You got this one right'
    : opponentCorrect
      ? `${getOpponentDisplayName(state)} got this one right`
      : 'Nobody got this one right';
  drawScoreTitle(context, title, getOpponentDisplayName(state), modal.x + (modal.width / 2), modal.y + 42);
  const progress = easeOutCubic(Math.min(1, Math.max(0, (now - state.phaseStartedAt) / SCORE_FLAP_ANIMATION_MS)));
  const previousOpponentScore = state.opponentScore - (opponentCorrect ? 1 : 0);
  const previousUserScore = state.userScore - (userCorrect ? 1 : 0);
  drawScoreCard(
    context,
    modal.x + 54,
    modal.y + 82,
    previousOpponentScore,
    state.opponentScore,
    getOpponentShortLabel(state),
    '#00d329',
    opponentCorrect ? progress : 1
  );
  context.fillStyle = '#000000';
  context.font = `400 ${scaleFontSize(22)}px ${FONT_STACK}`;
  context.fillText('vs.', modal.x + (modal.width / 2), modal.y + 174);
  drawScoreCard(
    context,
    modal.x + 230,
    modal.y + 82,
    previousUserScore,
    state.userScore,
    'You',
    '#2b96f4',
    userCorrect ? progress : 1
  );
}

function drawScoreTitle(
  context: CanvasRenderingContext2D,
  title: string,
  playerPrefix: string,
  x: number,
  y: number
): void {
  if (!title.startsWith(playerPrefix)) {
    context.fillStyle = '#111111';
    context.font = `400 ${fitFontSize(context, title, 260, scaleFontSize(20), scaleFontSize(16), 2, 400)}px ${FONT_STACK}`;
    context.fillText(title, x, y);
    return;
  }

  context.font = `400 ${scaleFontSize(20)}px ${FONT_STACK}`;
  context.textAlign = 'left';
  const suffix = title.slice(playerPrefix.length);
  const prefixWidth = context.measureText(playerPrefix).width;
  const suffixWidth = context.measureText(suffix).width;
  const startX = x - ((prefixWidth + suffixWidth) / 2);
  context.fillStyle = '#00b82c';
  context.fillText(playerPrefix, startX, y);
  context.fillStyle = '#111111';
  context.fillText(suffix, startX + prefixWidth, y);
}

function drawScoreCard(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  previousScore: number,
  score: number,
  label: string,
  color: string,
  progress: number
): void {
  drawScoreFlap(context, x, y);
  if (previousScore !== score) {
    drawScoreFlapRevealSurface(context, x, y, progress);
    drawScoreNumber(context, score, x, y, progress);
    if (progress < 1) drawScoreFlapEdge(context, x, y, progress);
  } else {
    drawScoreNumber(context, score, x, y);
  }

  context.fillStyle = color;
  fillRoundRect(context, x, y + 198, SCORE_FLAP_WIDTH, 26, 13, 13, 13, 13);
  context.fillStyle = '#ffffff';
  context.font = `400 ${scaleFontSize(15)}px ${FONT_STACK}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, x + (SCORE_FLAP_WIDTH / 2), y + 211);
}

function drawScoreFlap(context: CanvasRenderingContext2D, x: number, y: number): void {
  drawScoreFlapHalf(context, x, y);
  drawScoreFlapHalf(context, x, y + SCORE_FLAP_HEIGHT + SCORE_FLAP_GAP);
}

function drawScoreFlapHalf(context: CanvasRenderingContext2D, x: number, y: number): void {
  context.save();
  context.fillStyle = '#ffffff';
  context.shadowColor = 'rgba(0, 0, 0, 0.09)';
  context.shadowBlur = 24;
  context.shadowOffsetY = 6;
  fillRoundRect(context, x, y, SCORE_FLAP_WIDTH, SCORE_FLAP_HEIGHT, 7, 7, 7, 7);
  context.restore();
}

function drawScoreFlapRevealSurface(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number
): void {
  const totalHeight = (SCORE_FLAP_HEIGHT * 2) + SCORE_FLAP_GAP;
  context.save();
  context.beginPath();
  context.rect(x, y, SCORE_FLAP_WIDTH, totalHeight * progress);
  context.clip();
  context.fillStyle = '#ffffff';
  fillRoundRect(context, x, y, SCORE_FLAP_WIDTH, SCORE_FLAP_HEIGHT, 7, 7, 7, 7);
  fillRoundRect(
    context,
    x,
    y + SCORE_FLAP_HEIGHT + SCORE_FLAP_GAP,
    SCORE_FLAP_WIDTH,
    SCORE_FLAP_HEIGHT,
    7,
    7,
    7,
    7
  );
  context.restore();
}

function drawScoreNumber(
  context: CanvasRenderingContext2D,
  score: number,
  x: number,
  y: number,
  visibleProgress = 1
): void {
  const totalHeight = (SCORE_FLAP_HEIGHT * 2) + SCORE_FLAP_GAP;
  context.save();
  context.beginPath();
  context.rect(x, y, SCORE_FLAP_WIDTH, totalHeight * visibleProgress);
  context.clip();
  context.fillStyle = '#000000';
  context.font = `800 ${scaleFontSize(88)}px ${FONT_STACK}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(score), x + (SCORE_FLAP_WIDTH / 2), y + (totalHeight / 2) + 2);
  context.restore();
}

function drawScoreFlapEdge(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number
): void {
  const totalHeight = (SCORE_FLAP_HEIGHT * 2) + SCORE_FLAP_GAP;
  const edgeY = y + (totalHeight * progress);
  context.save();
  context.strokeStyle = 'rgba(0, 0, 0, 0.14)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x + 8, edgeY);
  context.lineTo(x + SCORE_FLAP_WIDTH - 8, edgeY);
  context.stroke();
  context.restore();
}

function drawFinalModal(
  context: CanvasRenderingContext2D,
  state: ReplayTriviaGameState,
  now: number
): void {
  drawScrim(context);
  const modal = { x: 62, y: 52, width: 324, height: 330 };
  const isTie = state.userScore === state.opponentScore;
  const won = state.userScore > state.opponentScore;
  const finalElapsed = now - state.phaseStartedAt;
  const stampProgress = Math.min(1, Math.max(0, finalElapsed / STAMP_ANIMATION_MS));
  playTimedSound(state, 'final-stamp-impact', finalElapsed, STAMP_IMPACT_SOUND_DELAY_MS, STAMP_SOUND_PATH);
  drawFloatingPanel(context, modal.x, modal.y, modal.width, modal.height, 34);

  context.fillStyle = '#111111';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `400 ${scaleFontSize(19)}px ${FONT_STACK}`;
  if (isTie) {
    context.fillText('It\'s a tie!', modal.x + (modal.width / 2), modal.y + 42);
    if (state.assets.tie) {
      drawStampImage(context, state.assets.tie, modal.x + 18, modal.y + 70, 288, 190, stampProgress, -1);
    } else {
      context.strokeStyle = '#ffd400';
      context.lineWidth = 7;
      context.strokeRect(modal.x + 62, modal.y + 118, 176, 82);
      context.fillStyle = '#ffd400';
      context.font = `800 ${scaleFontSize(38)}px ${FONT_STACK}`;
      context.fillText('OKAY! :)', modal.x + (modal.width / 2), modal.y + 160);
    }
  } else if (won) {
    drawWinnerLine(context, 'You', 'won this match!', '#2b96f4', modal.x + (modal.width / 2), modal.y + 42);
    if (state.assets.bestie) {
      drawStampImage(context, state.assets.bestie, modal.x + 18, modal.y + 70, 288, 190, stampProgress, -1);
    } else {
      context.strokeStyle = '#00df32';
      context.lineWidth = 7;
      context.strokeRect(modal.x + 62, modal.y + 118, 176, 82);
      context.fillStyle = '#00df32';
      context.font = `800 ${scaleFontSize(38)}px ${FONT_STACK}`;
      context.fillText('BESTIE', modal.x + (modal.width / 2), modal.y + 160);
    }
  } else {
    drawWinnerLine(context, getOpponentShortLabel(state), 'won this match!', '#00d329', modal.x + (modal.width / 2), modal.y + 42);
    if (state.assets.blocked) {
      drawStampImage(context, state.assets.blocked, modal.x + 18, modal.y + 70, 288, 190, stampProgress, 1);
    } else {
      context.strokeStyle = '#ff1616';
      context.lineWidth = 7;
      context.strokeRect(modal.x + 62, modal.y + 118, 176, 82);
      context.fillStyle = '#ff1616';
      context.font = `800 ${scaleFontSize(38)}px ${FONT_STACK}`;
      context.fillText('BLOCKED', modal.x + (modal.width / 2), modal.y + 160);
    }
  }

  if (won && finalElapsed > STAMP_ANIMATION_MS) {
    drawFinalConfetti(context, finalElapsed - STAMP_ANIMATION_MS);
  }

  state.closeButtonRect = getFinalCloseButtonRect(modal);
  drawCloseGameButton(context, state.closeButtonRect, state.hoveredCloseButton);
}

function getFinalCloseButtonRect(modal: Rect): Rect {
  return {
    height: 34,
    width: 142,
    x: modal.x + ((modal.width - 142) / 2),
    y: modal.y + 282
  };
}

function drawCloseGameButton(
  context: CanvasRenderingContext2D,
  rect: Rect,
  hovered: boolean
): void {
  context.save();
  context.fillStyle = hovered ? '#303035' : '#151518';
  context.shadowColor = 'rgba(0, 0, 0, 0.18)';
  context.shadowBlur = 14;
  context.shadowOffsetY = 3;
  fillRoundRect(context, rect.x, rect.y, rect.width, rect.height, 17, 17, 17, 17);
  context.restore();

  context.fillStyle = '#ffffff';
  context.font = `400 ${scaleFontSize(17)}px ${FONT_STACK}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('Close game', rect.x + (rect.width / 2), rect.y + (rect.height / 2) + 1);
}

function drawStampImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  direction: 1 | -1
): void {
  const slamProgress = Math.min(1, progress / 0.34);
  const settleProgress = Math.min(1, Math.max(0, (progress - 0.34) / 0.66));
  const slam = easeOutCubic(slamProgress);
  const settle = easeOutCubic(settleProgress);
  const impactProgress = Math.min(1, Math.max(0, (progress - 0.22) / 0.78));
  const baseScale = slamProgress < 1 ? 2.16 - (1.23 * slam) : 0.93 + (0.07 * settle);
  const squash = 1 - settle;
  const scaleX = baseScale * (1 + (0.12 * squash));
  const scaleY = baseScale * (1 - (0.08 * squash));
  const offsetY = slamProgress < 1 ? -92 * (1 - slam) : 8 * (1 - settle);
  const rotation = direction * ((0.28 * (1 - slam)) - (0.08 * squash));
  const centerX = x + (width / 2);
  const centerY = y + (height / 2);
  drawStampSmoke(context, x, y, width, height, impactProgress);
  context.save();
  context.translate(centerX, centerY + offsetY);
  context.rotate(rotation);
  context.scale(scaleX, scaleY);
  drawContainedImage(context, image, -(width / 2), -(height / 2), width, height);
  context.restore();
}

function drawStampSmoke(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number
): void {
  if (progress <= 0 || progress >= 1) return;

  const centerX = x + (width / 2);
  const centerY = y + (height / 2);
  const puffs = [
    { delay: 0, radius: 14, startX: -0.42, startY: -0.18, travelX: -42, travelY: -18 },
    { delay: 0.05, radius: 18, startX: 0.40, startY: -0.12, travelX: 44, travelY: -14 },
    { delay: 0.10, radius: 16, startX: -0.36, startY: 0.30, travelX: -48, travelY: 20 },
    { delay: 0.15, radius: 20, startX: 0.34, startY: 0.26, travelX: 50, travelY: 22 },
    { delay: 0.20, radius: 13, startX: -0.06, startY: 0.42, travelX: -8, travelY: 34 }
  ];

  context.save();
  puffs.forEach((puff) => {
    const localProgress = Math.min(1, Math.max(0, (progress - puff.delay) / (1 - puff.delay)));
    if (localProgress <= 0) return;

    const eased = easeOutCubic(localProgress);
    const alpha = 0.28 * ((1 - localProgress) ** 1.35);
    const radius = puff.radius + (22 * eased);
    context.fillStyle = `rgba(184, 184, 190, ${alpha})`;
    context.beginPath();
    context.arc(
      centerX + (width * puff.startX) + (puff.travelX * eased),
      centerY + (height * puff.startY) + (puff.travelY * eased),
      radius,
      0,
      Math.PI * 2
    );
    context.fill();
  });
  context.restore();
}

function drawFinalConfetti(context: CanvasRenderingContext2D, elapsed: number): void {
  if (elapsed < 0 || elapsed > CONFETTI_DURATION_MS) return;

  const colors = ['#ff4d4d', '#ffd447', '#2b96f4', '#00d329', '#b46cff', '#ff8a00'];
  context.save();
  for (let index = 0; index < CONFETTI_PARTICLE_COUNT; index += 1) {
    drawConfettiParticle(context, index, elapsed, colors[index % colors.length]);
  }
  context.restore();
}

function drawConfettiParticle(
  context: CanvasRenderingContext2D,
  index: number,
  elapsed: number,
  color: string
): void {
  const delay = seededRandom(index, 1) * 520;
  const localElapsed = elapsed - delay;
  const duration = 2100 + (seededRandom(index, 2) * 1400);
  if (localElapsed < 0 || localElapsed > duration) return;

  const time = localElapsed / 1000;
  const progress = localElapsed / duration;
  const originX = (CANVAS_WIDTH / 2) + ((seededRandom(index, 3) - 0.5) * 170);
  const originY = 200 + (seededRandom(index, 4) * 70);
  const velocityX = -250 + (seededRandom(index, 5) * 500);
  const velocityY = -360 - (seededRandom(index, 6) * 170);
  const gravity = 430 + (seededRandom(index, 7) * 170);
  const drift = Math.sin((time * 5.2) + (seededRandom(index, 8) * Math.PI * 2)) * 18;
  const x = originX + (velocityX * time) + drift;
  const y = originY + (velocityY * time) + (0.5 * gravity * time * time);
  if (x < -40 || x > CANVAS_WIDTH + 40 || y > CANVAS_HEIGHT + 40) return;

  const fade = progress > 0.78 ? Math.max(0, 1 - ((progress - 0.78) / 0.22)) : 1;
  const width = 6 + (seededRandom(index, 9) * 5);
  const height = 11 + (seededRandom(index, 10) * 8);
  const rotation = (seededRandom(index, 11) * Math.PI * 2) + (time * (4 + (seededRandom(index, 12) * 8)));
  context.save();
  context.globalAlpha = fade;
  context.fillStyle = color;
  context.translate(x, y);
  context.rotate(rotation);
  context.fillRect(-(width / 2), -(height / 2), width, height);
  context.restore();
}

function seededRandom(seed: number, salt: number): number {
  const value = Math.sin((seed * 127.1) + (salt * 311.7)) * 43758.5453123;
  return value - Math.floor(value);
}

function drawWinnerLine(
  context: CanvasRenderingContext2D,
  player: string,
  suffix: string,
  color: string,
  x: number,
  y: number
): void {
  const chipWidth = player === 'You' ? 58 : 84;
  const gap = 8;
  context.font = `400 ${scaleFontSize(19)}px ${FONT_STACK}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const suffixWidth = context.measureText(suffix).width;
  const startX = x - ((chipWidth + gap + suffixWidth) / 2);

  context.fillStyle = color;
  fillRoundRect(context, startX, y - 14, chipWidth, 28, 14, 14, 14, 14);
  context.fillStyle = '#ffffff';
  context.font = `400 ${scaleFontSize(16)}px ${FONT_STACK}`;
  context.fillText(player, startX + (chipWidth / 2), y);
  context.fillStyle = '#111111';
  context.font = `400 ${scaleFontSize(19)}px ${FONT_STACK}`;
  context.fillText(suffix, startX + chipWidth + gap + (suffixWidth / 2), y);
}

function drawFloatingPanel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  context.save();
  context.fillStyle = '#ffffff';
  context.shadowColor = 'rgba(0, 0, 0, 0.11)';
  context.shadowBlur = 40;
  context.shadowOffsetY = 10;
  fillRoundRect(context, x, y, width, height, radius, radius, radius, radius);
  context.restore();
}

function drawScrim(context: CanvasRenderingContext2D): void {
  context.fillStyle = 'rgba(255, 255, 255, 0.68)';
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawPickAnswerPrompt(context: CanvasRenderingContext2D, centerX: number, baselineY: number): void {
  context.save();
  context.translate(centerX, baselineY);
  context.rotate(-0.07);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.font = `800 ${scaleFontSize(24)}px ${FONT_STACK}`;
  const prefix = 'Pick your ';
  const answer = 'answer';
  const suffix = '!';
  const prefixWidth = context.measureText(prefix).width;
  const answerWidth = context.measureText(answer).width;
  const suffixWidth = context.measureText(suffix).width;
  const totalWidth = prefixWidth + answerWidth + suffixWidth;
  const startX = -(totalWidth / 2);
  const answerX = startX + prefixWidth;

  context.fillStyle = '#111111';
  context.fillText(prefix, startX, 0);
  context.fillStyle = '#3aa7ff';
  context.fillText(answer, answerX, 0);
  context.fillStyle = '#111111';
  context.fillText(suffix, answerX + answerWidth, 0);

  context.strokeStyle = '#3aa7ff';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(answerX, 7);
  context.lineTo(answerX + answerWidth, 7);
  context.stroke();
  context.restore();
}

function drawAnimatedFriendBubble(
  context: CanvasRenderingContext2D,
  text: string | readonly FriendBubbleTextSegment[],
  x: number,
  y: number,
  width: number,
  minHeight: number,
  fontSize: number,
  progress: number,
  options: FriendBubbleOptions
): number {
  if (progress >= 1) {
    return drawFriendBubble(context, text, x, y, width, minHeight, fontSize, options);
  }

  const eased = easeOutCubic(progress);
  const scale = 0.94 + (eased * 0.06);
  const translateY = (1 - eased) * 15;
  context.save();
  context.globalAlpha *= Math.min(1, 0.35 + (progress * 0.65));
  context.translate(x, y + translateY);
  context.scale(scale, scale);
  const height = drawFriendBubble(context, text, 0, 0, width, minHeight, fontSize, options);
  context.restore();
  return height;
}

function drawFriendBubble(
  context: CanvasRenderingContext2D,
  text: string | readonly FriendBubbleTextSegment[],
  x: number,
  y: number,
  width: number,
  minHeight: number,
  fontSize: number,
  {
    flipImage = false,
    image,
    kind,
    tail = true
  }: FriendBubbleOptions
): number {
  const scaledFontSize = scaleFontSize(fontSize);
  const horizontalPadding = Math.max(16, Math.ceil(scaledFontSize * 0.9));
  const lineHeight = scaledFontSize + 6;
  const lines = wrapFriendBubbleText(context, text, width - (horizontalPadding * 2), 3, scaledFontSize);
  const textWidth = lines.reduce((maxWidth, line) => Math.max(maxWidth, line.width), 0);
  const bubbleWidth = Math.min(width, Math.ceil(textWidth + (horizontalPadding * 2)));
  const height = Math.max(minHeight, 18 + (lines.length * lineHeight));
  if (image) {
    drawBubbleSprite(context, image, x, y, bubbleWidth, height, kind, flipImage);
  } else {
    context.fillStyle = '#e6e6e8';
    drawMessageBubbleFallback(context, {
      height,
      tailSide: tail ? 'left' : 'none',
      width: bubbleWidth,
      x,
      y
    });
  }
  context.fillStyle = '#303033';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  drawFriendBubbleLines(
    context,
    lines,
    x + horizontalPadding,
    getBubbleTextBlockStartY(y, height, lines.length, lineHeight, kind),
    lineHeight,
    scaledFontSize
  );
  return height;
}

function boldFriendReplyAnswer(reply: string, correctAnswer: string): string | FriendBubbleTextSegment[] {
  if (!correctAnswer) return reply;

  const answer = correctAnswer.trim();
  if (!answer) return reply;

  const lowerReply = reply.toLowerCase();
  const lowerAnswer = answer.toLowerCase();
  const segments: FriendBubbleTextSegment[] = [];
  let cursor = 0;
  let matchIndex = findFriendReplyAnswerMatch(lowerReply, lowerAnswer, cursor);

  while (matchIndex >= 0) {
    if (matchIndex > cursor) {
      segments.push({ text: reply.slice(cursor, matchIndex) });
    }
    segments.push({
      bold: true,
      text: reply.slice(matchIndex, matchIndex + answer.length)
    });
    cursor = matchIndex + answer.length;
    matchIndex = findFriendReplyAnswerMatch(lowerReply, lowerAnswer, cursor);
  }

  if (cursor === 0) return reply;
  if (cursor < reply.length) segments.push({ text: reply.slice(cursor) });
  return segments;
}

function findFriendReplyAnswerMatch(reply: string, answer: string, startIndex: number): number {
  let index = reply.indexOf(answer, startIndex);
  while (index >= 0) {
    const before = index - 1;
    const after = index + answer.length;
    if (isFriendReplyAnswerBoundary(reply, before) && isFriendReplyAnswerBoundary(reply, after)) return index;
    index = reply.indexOf(answer, index + answer.length);
  }
  return -1;
}

function isFriendReplyAnswerBoundary(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return true;
  return !/[a-z0-9]/i.test(text[index]);
}

function wrapFriendBubbleText(
  context: CanvasRenderingContext2D,
  text: string | readonly FriendBubbleTextSegment[],
  maxWidth: number,
  maxLines: number,
  fontSize: number
): FriendBubbleTextLine[] {
  const words = toFriendBubbleWords(text);
  if (words.length === 0) return [{ segments: [{ text: '' }], width: 0 }];

  const lines: FriendBubbleTextLine[] = [];
  let current: FriendBubbleTextSegment[] = [];

  words.forEach((word) => {
    const candidate = current.length > 0
      ? [...current, { text: ' ' }, word]
      : [word];

    if (measureFriendBubbleSegments(context, candidate, fontSize) <= maxWidth) {
      current = candidate;
      return;
    }

    if (current.length > 0) lines.push(toFriendBubbleTextLine(context, current, fontSize));
    current = [word];
  });

  if (current.length > 0) lines.push(toFriendBubbleTextLine(context, current, fontSize));
  return truncateFriendBubbleLines(context, lines, maxLines, fontSize);
}

function toFriendBubbleWords(text: string | readonly FriendBubbleTextSegment[]): FriendBubbleTextSegment[] {
  const segments = typeof text === 'string' ? [{ text }] : text;
  return segments.flatMap((segment) =>
    segment.text
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => ({
        bold: segment.bold,
        text: word
      }))
  );
}

function truncateFriendBubbleLines(
  context: CanvasRenderingContext2D,
  lines: FriendBubbleTextLine[],
  maxLines: number,
  fontSize: number
): FriendBubbleTextLine[] {
  if (lines.length <= maxLines) return lines;

  const trimmed = lines.slice(0, maxLines).map((line) => ({
    segments: line.segments.map((segment) => ({ ...segment })),
    width: line.width
  }));
  const lastLine = trimmed[trimmed.length - 1];
  const lastSegment = lastLine?.segments[lastLine.segments.length - 1];
  if (lastSegment) {
    lastSegment.text = `${lastSegment.text.replace(/\.*$/, '')}...`;
    lastLine.width = measureFriendBubbleSegments(context, lastLine.segments, fontSize);
  }
  return trimmed;
}

function drawFriendBubbleLines(
  context: CanvasRenderingContext2D,
  lines: readonly FriendBubbleTextLine[],
  x: number,
  y: number,
  lineHeight: number,
  fontSize: number
): void {
  lines.forEach((line, lineIndex) => {
    let segmentX = x;
    line.segments.forEach((segment) => {
      context.font = `${segment.bold ? 700 : 400} ${fontSize}px ${FONT_STACK}`;
      context.fillText(segment.text, segmentX, y + (lineIndex * lineHeight));
      segmentX += context.measureText(segment.text).width;
    });
  });
}

function toFriendBubbleTextLine(
  context: CanvasRenderingContext2D,
  segments: FriendBubbleTextSegment[],
  fontSize: number
): FriendBubbleTextLine {
  return {
    segments,
    width: measureFriendBubbleSegments(context, segments, fontSize)
  };
}

function measureFriendBubbleSegments(
  context: CanvasRenderingContext2D,
  segments: readonly FriendBubbleTextSegment[],
  fontSize: number
): number {
  return segments.reduce((width, segment) => {
    context.font = `${segment.bold ? 700 : 400} ${fontSize}px ${FONT_STACK}`;
    return width + context.measureText(segment.text).width;
  }, 0);
}

function drawPlayerBubble(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  side: 'left' | 'right',
  image: HTMLImageElement | null
): void {
  if (image) {
    drawBubbleSprite(context, image, x, y, width, height, side === 'left' ? 'left-tail' : 'right-tail', false);
  } else {
    context.fillStyle = color;
    drawMessageBubbleFallback(context, {
      height,
      tailSide: side,
      width,
      x,
      y
    });
  }

  context.fillStyle = '#ffffff';
  const horizontalPadding = 32;
  const fontSize = fitFontSize(context, text, width - horizontalPadding, scaleFontSize(20), scaleFontSize(13));
  context.font = `400 ${fontSize}px ${FONT_STACK}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const lines = wrapText(context, text, width - horizontalPadding, 2);
  const lineHeight = fontSize + 6;
  drawWrappedLines(context, lines, x + (width / 2), y + (height / 2) - (((lines.length - 1) * lineHeight) / 2), lineHeight);
}

function getBubbleTextBlockStartY(
  y: number,
  height: number,
  lineCount: number,
  lineHeight: number,
  kind: BubbleSpriteKind
): number {
  const bodyHeight = kind === 'no-tail' ? height : height * 0.95;
  const textBlockHeight = (Math.max(1, lineCount) - 1) * lineHeight;
  return y + (bodyHeight / 2) - (textBlockHeight / 2);
}

function drawBubbleSprite(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  kind: BubbleSpriteKind,
  flipX: boolean
): void {
  const visualKind = getVisualBubbleSpriteKind(kind, flipX);
  const tailInset = getBubbleTailInset(height, visualKind);
  const drawX = visualKind === 'left-tail' ? x - tailInset : x;
  const drawWidth = width + tailInset;

  if (flipX) {
    context.save();
    context.translate(drawX + (drawWidth / 2), y + (height / 2));
    context.scale(-1, 1);
    drawBubbleSpriteSlices(context, image, -(drawWidth / 2), -(height / 2), drawWidth, height, kind);
    context.restore();
    return;
  }

  drawBubbleSpriteSlices(context, image, drawX, y, drawWidth, height, kind);
}

function getVisualBubbleSpriteKind(kind: BubbleSpriteKind, flipped: boolean): BubbleSpriteKind {
  if (!flipped || kind === 'no-tail') return kind;
  return kind === 'left-tail' ? 'right-tail' : 'left-tail';
}

function getBubbleTailInset(height: number, kind: BubbleSpriteKind): number {
  return kind === 'no-tail' ? 0 : Math.ceil(height * 0.15);
}

function drawBubbleSpriteSlices(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  kind: BubbleSpriteKind
): void {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) return;

  const scale = height / sourceHeight;
  const sourceLeft = kind === 'left-tail'
    ? Math.min(sourceWidth * 0.34, sourceHeight * 0.72)
    : sourceHeight / 2;
  const sourceRight = kind === 'right-tail'
    ? Math.min(sourceWidth * 0.34, sourceHeight * 0.72)
    : sourceHeight / 2;
  const leftWidth = Math.min(width * 0.45, sourceLeft * scale);
  const rightWidth = Math.min(width * 0.45, sourceRight * scale);
  const centerWidth = Math.max(0, width - leftWidth - rightWidth);
  const sourceCenterWidth = Math.max(1, sourceWidth - sourceLeft - sourceRight);

  context.drawImage(image, 0, 0, sourceLeft, sourceHeight, x, y, leftWidth, height);
  if (centerWidth > 0) {
    context.drawImage(
      image,
      sourceLeft,
      0,
      sourceCenterWidth,
      sourceHeight,
      x + leftWidth,
      y,
      centerWidth,
      height
    );
  }
  context.drawImage(
    image,
    sourceWidth - sourceRight,
    0,
    sourceRight,
    sourceHeight,
    x + leftWidth + centerWidth,
    y,
    rightWidth,
    height
  );
}

function drawMessageBubbleFallback(
  context: CanvasRenderingContext2D,
  {
    height,
    tailSide,
    width,
    x,
    y
  }: {
    height: number;
    tailSide: 'left' | 'none' | 'right';
    width: number;
    x: number;
    y: number;
  }
): void {
  const radius = Math.min(height / 2, 18);
  const availableTailWidth = tailSide === 'left'
    ? Math.max(0, x - 1)
    : tailSide === 'right'
      ? Math.max(0, CANVAS_WIDTH - (x + width) - 1)
      : 0;
  const tailWidth = Math.min(availableTailWidth, Math.min(14, Math.max(9, height * 0.3)));
  const tailHeight = Math.min(11, Math.max(7, height * 0.26));
  const effectiveTailSide = tailWidth >= 4 ? tailSide : 'none';
  const tailInset = Math.min(radius * 1.25, 18);
  const bottom = y + height;
  const right = x + width;

  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(right - radius, y);
  context.bezierCurveTo(right - (radius * 0.44), y, right, y + (radius * 0.44), right, y + radius);
  context.lineTo(right, bottom - radius);

  if (effectiveTailSide === 'right') {
    context.bezierCurveTo(right, bottom - (radius * 0.44), right - (radius * 0.44), bottom, right - radius, bottom);
    context.lineTo(right - tailInset, bottom);
    context.bezierCurveTo(
      right - (tailInset * 0.52),
      bottom + (tailHeight * 0.86),
      right + (tailWidth * 0.42),
      bottom + tailHeight,
      right + tailWidth,
      bottom + (tailHeight * 0.62)
    );
    context.bezierCurveTo(
      right + (tailWidth * 0.16),
      bottom + (tailHeight * 0.58),
      right - (tailInset * 0.34),
      bottom + (tailHeight * 0.12),
      right - (tailInset * 0.74),
      bottom - (tailHeight * 0.34)
    );
    context.bezierCurveTo(right - (tailInset * 0.86), bottom - (tailHeight * 0.48), right - tailInset, bottom, right - tailInset, bottom);
  } else {
    context.bezierCurveTo(right, bottom - (radius * 0.44), right - (radius * 0.44), bottom, right - radius, bottom);
  }

  if (effectiveTailSide === 'left') {
    context.lineTo(x + tailInset, bottom);
    context.bezierCurveTo(
      x + (tailInset * 0.52),
      bottom + (tailHeight * 0.86),
      x - (tailWidth * 0.42),
      bottom + tailHeight,
      x - tailWidth,
      bottom + (tailHeight * 0.62)
    );
    context.bezierCurveTo(
      x - (tailWidth * 0.16),
      bottom + (tailHeight * 0.58),
      x + (tailInset * 0.34),
      bottom + (tailHeight * 0.12),
      x + (tailInset * 0.74),
      bottom - (tailHeight * 0.34)
    );
    context.bezierCurveTo(x + (tailInset * 0.86), bottom - (tailHeight * 0.48), x + tailInset, bottom, x + tailInset, bottom);
    context.lineTo(x + radius, bottom);
  } else {
    context.lineTo(x + radius, bottom);
  }

  context.bezierCurveTo(x + (radius * 0.44), bottom, x, bottom - (radius * 0.44), x, bottom - radius);
  context.lineTo(x, y + radius);
  context.bezierCurveTo(x, y + (radius * 0.44), x + (radius * 0.44), y, x + radius, y);
  context.closePath();
  context.fill();
}

function drawReactionImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  size = 32,
  background = '#FCDF69',
  sourceRect?: SourceRect
): void {
  context.fillStyle = background;
  context.beginPath();
  context.arc(x + (size / 2), y + (size / 2), size / 2, 0, Math.PI * 2);
  context.fill();

  if (image) {
    const source = sourceRect || {
      height: image.naturalHeight || image.height,
      width: image.naturalWidth || image.width,
      x: 0,
      y: 0
    };
    const iconBoxSize = size * (source.drawScale || 0.64);
    const scale = Math.min(iconBoxSize / source.width, iconBoxSize / source.height);
    const iconWidth = source.width * scale;
    const iconHeight = source.height * scale;
    const iconY = y + ((size - iconHeight) / 2) + (source.drawOffsetY || 0);
    context.drawImage(
      image,
      source.x,
      source.y,
      source.width,
      source.height,
      x + ((size - iconWidth) / 2),
      iconY,
      iconWidth,
      iconHeight
    );
    return;
  }
}

function drawInputBar(context: CanvasRenderingContext2D, text: string, offsetY = 0): void {
  context.strokeStyle = '#dedede';
  context.lineWidth = 2;
  context.fillStyle = '#ffffff';
  fillRoundRect(context, 28, 402 + offsetY, CANVAS_WIDTH - 56, 38, 19, 19, 19, 19);
  context.stroke();
  context.fillStyle = '#8a8a8d';
  context.font = `400 ${fitFontSize(context, text, CANVAS_WIDTH - 96, scaleFontSize(19), scaleFontSize(14))}px ${FONT_STACK}`;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(text, 48, 423 + offsetY);
}

function createAnswerOptionLayouts(
  context: CanvasRenderingContext2D,
  answers: readonly string[],
  gridX: number,
  gridY: number,
  cellWidth: number
): AnswerOptionLayout[] {
  const measured = answers.map((answer) => measureAnswerText(context, answer, cellWidth));
  const rowHeights = [
    Math.max(measured[0]?.height ?? ANSWER_MIN_HEIGHT, measured[1]?.height ?? ANSWER_MIN_HEIGHT),
    Math.max(measured[2]?.height ?? ANSWER_MIN_HEIGHT, measured[3]?.height ?? ANSWER_MIN_HEIGHT)
  ];

  return measured.map((answer, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    return {
      index,
      rect: {
        height: rowHeights[row] ?? ANSWER_MIN_HEIGHT,
        width: cellWidth,
        x: gridX + (col * cellWidth),
        y: gridY + (row === 0 ? 0 : rowHeights[0])
      },
      text: answer.text
    };
  });
}

function measureAnswerText(
  context: CanvasRenderingContext2D,
  text: string,
  cellWidth: number
): { height: number; text: AnswerTextLayout } {
  const textWidth = cellWidth - (ANSWER_TEXT_INSET_X * 2);
  const fontSize = fitFontSize(
    context,
    text,
    textWidth,
    scaleFontSize(21),
    scaleFontSize(14),
    ANSWER_MAX_LINES,
    400
  );
  context.font = `400 ${fontSize}px ${FONT_STACK}`;
  const lines = wrapText(context, text, textWidth, ANSWER_MAX_LINES);
  const lineHeight = fontSize + 4;
  const height = Math.ceil(Math.max(ANSWER_MIN_HEIGHT, (lines.length * lineHeight) + (ANSWER_TEXT_INSET_Y * 2)));
  return {
    height,
    text: {
      fontSize,
      lineHeight,
      lines
    }
  };
}

function drawCenteredAnswerText(
  context: CanvasRenderingContext2D,
  text: AnswerTextLayout,
  rect: Rect,
  progress: number
): void {
  context.save();
  context.globalAlpha = progress;
  context.fillStyle = '#ffffff';
  context.font = `400 ${text.fontSize}px ${FONT_STACK}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  drawWrappedLines(
    context,
    text.lines,
    rect.x + (rect.width / 2),
    rect.y + (rect.height / 2) - (((text.lines.length - 1) * text.lineHeight) / 2) + 2,
    text.lineHeight
  );
  context.restore();
}

function drawWrappedLines(
  context: CanvasRenderingContext2D,
  lines: readonly string[],
  x: number,
  y: number,
  lineHeight: number
): void {
  lines.forEach((line, index) => {
    context.fillText(line, x, y + (index * lineHeight));
  });
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(nextLine).width <= maxWidth) {
      currentLine = nextLine;
      return;
    }

    if (currentLine) lines.push(currentLine);
    currentLine = word;
  });
  if (currentLine) lines.push(currentLine);

  if (lines.length <= maxLines) return lines;
  const trimmed = lines.slice(0, maxLines);
  const last = trimmed[trimmed.length - 1] || '';
  trimmed[trimmed.length - 1] = last.length > 3 ? `${last.replace(/\.*$/, '')}...` : last;
  return trimmed;
}

function fitFontSize(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  preferred: number,
  minimum: number,
  maxLines = 2,
  fontWeight = 500
): number {
  for (let size = preferred; size >= minimum; size -= 1) {
    context.font = `${fontWeight} ${size}px ${FONT_STACK}`;
    if (wrapText(context, text, maxWidth, maxLines).every((line) => context.measureText(line).width <= maxWidth)) {
      return size;
    }
  }
  return minimum;
}

function scaleFontSize(size: number): number {
  return Math.round(size * TEXT_SCALE * 10) / 10;
}

function easeOutCubic(progress: number): number {
  return 1 - ((1 - progress) ** 3);
}

function getCurrentQuestion(state: ReplayTriviaGameState): ReplayTriviaCanvasQuestion {
  const question = state.game.currentQuestion;
  if (!question) {
    return {
      answers: ['', '', '', ''],
      friendIntro: '',
      prompt: '',
      rightReply: '',
      wrongReply: ''
    };
  }

  return {
    answers: question.choices,
    correctIndex: question.correctChoiceIndex,
    friendIntro: question.friendIntro,
    prompt: question.prompt,
    rightReply: question.rightReply,
    wrongReply: question.wrongReply
  };
}

function getCurrentUserRole(game: PublicReplayTriviaGame, currentUserId: string): 'guest' | 'host' {
  return game.players.host.userId === currentUserId ? 'host' : 'guest';
}

function getOpponentRole(game: PublicReplayTriviaGame, currentUserId: string): 'guest' | 'host' {
  return getCurrentUserRole(game, currentUserId) === 'host' ? 'guest' : 'host';
}

function getReplayTriviaRoleScore(game: PublicReplayTriviaGame, role: 'guest' | 'host'): number {
  return game.scores[role] || 0;
}

function getPublicReplayTriviaAnswerIndex(
  game: PublicReplayTriviaGame,
  role: 'guest' | 'host'
): number | null {
  const choiceIndex = game.answers[role]?.choiceIndex;
  return typeof choiceIndex === 'number' ? choiceIndex : null;
}

function shouldShowReplayTriviaAnswerChoices(status: ReplayTriviaGameStatus): boolean {
  return status === 'reveal' || status === 'score' || status === 'finished';
}

function getReplayTriviaOpponentLabel(game: PublicReplayTriviaGame, currentUserId: string): string {
  return game.players[getOpponentRole(game, currentUserId)].displayName || 'Player';
}

function getOpponentDisplayName(state: ReplayTriviaGameState): string {
  return getReplayTriviaOpponentLabel(state.game, state.currentUserId);
}

function getOpponentShortLabel(state: ReplayTriviaGameState): string {
  return getShortPlayerLabel(getOpponentDisplayName(state));
}

function getShortPlayerLabel(label: string): string {
  const trimmed = label.replace(/^Player\s+/i, 'P ').trim();
  return trimmed.length > 10 ? `${trimmed.slice(0, 7).trim()}...` : trimmed;
}

function fillRoundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  topLeft: number,
  topRight: number,
  bottomRight: number,
  bottomLeft: number
): void {
  context.beginPath();
  context.moveTo(x + topLeft, y);
  context.lineTo(x + width - topRight, y);
  context.quadraticCurveTo(x + width, y, x + width, y + topRight);
  context.lineTo(x + width, y + height - bottomRight);
  context.quadraticCurveTo(x + width, y + height, x + width - bottomRight, y + height);
  context.lineTo(x + bottomLeft, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - bottomLeft);
  context.lineTo(x, y + topLeft);
  context.quadraticCurveTo(x, y, x + topLeft, y);
  context.closePath();
  context.fill();
}

function drawContainedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(
    image,
    x + ((width - drawWidth) / 2),
    y + ((height - drawHeight) / 2),
    drawWidth,
    drawHeight
  );
}
