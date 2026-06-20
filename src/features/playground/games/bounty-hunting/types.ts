import type { GameSoundController } from '../sound';
import type { GamePanelControls } from '../adapter';
import type { GamePanelStatusOverlay } from '../panel-feedback';
import type { PublicGame, PublicUserIdentity } from '../../../../shared/playground/protocol';
import type {
  PublicBountyHuntingBounty,
  BountyHuntingGameStatus,
  BountyHuntingMessageFacts,
  BountyHuntingPlayerRole
} from '../../../../shared/playground/bounty-hunting';

export type { BountyHuntingMessageFacts, BountyHuntingPlayerRole };

export interface PublicBountyHuntingGame extends PublicGame {
  bounties: PublicBountyHuntingBounty[];
  bountyProviderUserId: string;
  gameType: 'bounty-hunting';
  phaseStartedAt: number;
  players: Record<BountyHuntingPlayerRole, PublicUserIdentity>;
  readyPlayers: Partial<Record<BountyHuntingPlayerRole, boolean>>;
  roundEndsAt?: number;
  scores: Record<BountyHuntingPlayerRole, number>;
  status: BountyHuntingGameStatus;
  winnerUserId?: string | null;
}

export interface BountyHuntingAssets {
  avatarRing: HTMLImageElement | null;
  bountyClaimedStamp: HTMLImageElement | null;
  bountyDescBg: HTMLImageElement | null;
  bountyOpenStamp: HTMLImageElement | null;
  buttonBg: HTMLImageElement | null;
  buttonBgDarker: HTMLImageElement | null;
  divider: HTMLImageElement | null;
  fontsReady: boolean;
  goldStar: HTMLImageElement | null;
  liveScoreBg: HTMLImageElement | null;
  logo: HTMLImageElement | null;
  paperBg: HTMLImageElement | null;
  roundOverBg: HTMLImageElement | null;
  roundOverTitle: HTMLImageElement | null;
  silverStar: HTMLImageElement | null;
  titleDecorLeft: HTMLImageElement | null;
  titleDecorRight: HTMLImageElement | null;
  woodenRibbon: HTMLImageElement | null;
}

export interface Rect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export type BountyHuntingClosePanel = (options?: { notify?: boolean }) => void;

export interface BountyHuntingPanelRuntime {
  assets: BountyHuntingAssets;
  canvas: HTMLCanvasElement;
  closePanel: BountyHuntingClosePanel;
  compactMode: boolean;
  context: CanvasRenderingContext2D;
  currentUserId: string;
  finalTickPlayedForGameId: string | null;
  finishSent: boolean;
  frameId: number | null;
  game: PublicBountyHuntingGame;
  hitboxes: Array<{ action: 'close' | 'ready'; rect: Rect }>;
  hoveredAction: 'close' | 'ready' | null;
  listeners: AbortController;
  onAction: (gameId: string, action: string, payload?: Record<string, unknown>) => void;
  onVisibilityChanged: (() => void) | null;
  panelControls: GamePanelControls | null;
  claimedMessageFeedbackTimers: Map<HTMLElement, number>;
  pendingWitnesses: Map<string, Set<string>>;
  pixelRatio: number;
  preparationMessages: Map<string, BountyHuntingObservedMessage>;
  preparationStarted: boolean;
  preparationTimer: number | null;
  claimSoundIndex: number;
  readyButtonFlashUntil: number;
  roundOverStingPlayedForGameId: string | null;
  sentClaimKeys: Set<string>;
  sentWitnessKeys: Set<string>;
  soundController: GameSoundController;
  startRoundSent: boolean;
  statusOverlay: GamePanelStatusOverlay;
  subtitleElement: HTMLElement;
  timerStartPulseUntil: number;
  timeoutSent: boolean;
  topFanAuthorKeys: Set<string>;
  witnessFlushTimer: number | null;
}

export interface BountyHuntingObservedMessage extends BountyHuntingMessageFacts {
  messageId: string;
}

export interface BountyHuntingFallbackRuntime {
  content: HTMLElement;
  listeners: AbortController;
  onVisibilityChanged: (() => void) | null;
  soundController: GameSoundController;
}
