import type { GameSoundController } from '../sound';
import type { GamePanelStatusOverlay } from '../panel-feedback';
import type { PublicGame, PublicUserIdentity } from '../../../../shared/playground/protocol';
import type {
  ReplayTriviaGenerationToken,
  ReplayTriviaGameStatus,
  ReplayTriviaPublicAnswer,
  ReplayTriviaPublicQuestion,
  ReplayTriviaPlayerRole,
  ReplayTriviaQuestionsResponse
} from '../../../../shared/playground/trivia';

export type { ReplayTriviaGameStatus, ReplayTriviaPlayerRole } from '../../../../shared/playground/trivia';

export interface ReplayTriviaAssets {
  bestie: HTMLImageElement | null;
  blueBubble: HTMLImageElement | null;
  blocked: HTMLImageElement | null;
  greenBubble: HTMLImageElement | null;
  greyBubbleNoTail: HTMLImageElement | null;
  greyBubbleTail: HTMLImageElement | null;
  logo: HTMLImageElement | null;
  target: HTMLImageElement | null;
  tie: HTMLImageElement | null;
  trophy: HTMLImageElement | null;
  wrong: HTMLImageElement | null;
}

export interface PublicReplayTriviaGame extends PublicGame {
  answers: Partial<Record<ReplayTriviaPlayerRole, ReplayTriviaPublicAnswer>>;
  currentQuestion?: ReplayTriviaPublicQuestion;
  currentQuestionIndex: number;
  gameType: 'replay-trivia';
  phaseStartedAt: number;
  players: Record<ReplayTriviaPlayerRole, PublicUserIdentity>;
  questionProviderUserId: string;
  scores: Record<ReplayTriviaPlayerRole, number>;
  status: ReplayTriviaGameStatus;
  totalQuestions: number;
  winnerUserId?: string | null;
}

export interface ReplayTriviaCanvasQuestion {
  answers: readonly string[];
  correctIndex?: number;
  friendIntro: string;
  prompt: string;
  rightReply: string;
  wrongReply: string;
}

export interface AnswerHitbox {
  index: number;
  rect: Rect;
}

export interface AnswerTextLayout {
  fontSize: number;
  lineHeight: number;
  lines: readonly string[];
}

export interface AnswerOptionLayout {
  index: number;
  rect: Rect;
  text: AnswerTextLayout;
}

export interface Rect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface SourceRect {
  drawOffsetY?: number;
  drawScale?: number;
  height: number;
  width: number;
  x: number;
  y: number;
}

export type BubbleSpriteKind = 'left-tail' | 'no-tail' | 'right-tail';

export interface FriendBubbleOptions {
  flipImage?: boolean;
  image: HTMLImageElement | null;
  kind: BubbleSpriteKind;
  tail?: boolean;
}

export type ReplayTriviaClosePanel = (options?: { notify?: boolean }) => void;

interface ReplayTriviaAutomaticActionDelivery {
  action: 'advance' | 'timeout';
  phaseStartedAt: number;
  retryAt: number;
  retryCount: number;
  sent: boolean;
}

export interface ReplayTriviaPanelRuntime {
  assets: ReplayTriviaAssets;
  automaticActionDelivery: ReplayTriviaAutomaticActionDelivery | null;
  canvas: HTMLCanvasElement;
  closePanel: ReplayTriviaClosePanel;
  closeButtonRect: Rect | null;
  context: CanvasRenderingContext2D;
  currentUserId: string;
  currentQuestionIndex: number;
  frameId: number | null;
  game: PublicReplayTriviaGame;
  generationToken: ReplayTriviaGenerationToken | null;
  generationTokenRequested: boolean;
  lastGenerationTokenValue: string;
  hitboxes: AnswerHitbox[];
  hoveredAnswerIndex: number | null;
  hoveredCloseButton: boolean;
  listeners: AbortController;
  onAction: (gameId: string, action: string, payload?: Record<string, unknown>) => void;
  onVisibilityChanged: (() => void) | null;
  opponentAnswerIndex: number | null;
  opponentScore: number;
  pendingAnswer: ReplayTriviaPendingAnswer | null;
  phase: ReplayTriviaGameStatus;
  phaseStartedAt: number;
  pixelRatio: number;
  playedSoundIds: Set<string>;
  preparationError: string;
  questionGeneration: Promise<ReplayTriviaQuestionsResponse> | null;
  selectedAt: number | null;
  soundController: GameSoundController;
  statusOverlay: GamePanelStatusOverlay;
  userAnswerIndex: number | null;
  userScore: number;
}

interface ReplayTriviaPendingAnswer {
  choiceIndex: number;
  expectedPhaseStartedAt: number;
}

export interface ReplayTriviaFallbackRuntime {
  content: HTMLElement;
  listeners: AbortController;
  onVisibilityChanged: (() => void) | null;
  soundController: GameSoundController;
}
