/**
 * Server-owned computer player decision logic.
 *
 * This module is intentionally transport-free. It chooses actions for built-in
 * bot users; `computer-player.ts` owns scheduling and room integration.
 */
import {
  getStockfishBestMove,
  type StockfishBestMoveProvider,
  type StockfishResult
} from '../../durable-objects/stockfish-container/client';
import type { ChessGameRecord, ChessMoveInput } from '../../games/chess';
import {
  REPLAY_TRIVIA_ANSWER_TIME_MS,
  REPLAY_TRIVIA_QUESTION_READ_MS,
  type ReplayTriviaGameRecord
} from '../../games/replay-trivia';
import type {
  BountyHuntingClaimWitness,
  BountyHuntingGameRecord
} from '../../games/bounty-hunting';
import type { StickAroundGameRecord } from '../../games/stick-around';
import { STICK_AROUND_COUNTDOWN_MS } from '../../../../../src/shared/playground/stick-around';
import type { GameActionInput, GameRecord } from '../../games/types';
import {
  BOUNTY_HUNTING_MAX_WITNESS_OBSERVATIONS,
  BOUNTY_HUNTING_ROUND_MS,
  type BountyHuntingBounty,
  type BountyHuntingPlayerRole
} from '../../../../../src/shared/playground/bounty-hunting';
import { DEFAULT_COMPUTER_PLAYER_PROFILE } from './profiles';

type ChoiceIndex = 0 | 1 | 2 | 3;
type ChessBotMove = Pick<ChessMoveInput, 'from' | 'promotion' | 'to'>;
type ChessBotStockfishFailureReason = 'stockfish_error' | 'stockfish_no_move';

export interface ChessBotStockfishFailure {
  error?: unknown;
  reason: ChessBotStockfishFailureReason;
}

export interface ComputerActionCallbacks {
  onChessBotStockfishFailure?(failure: ChessBotStockfishFailure): void;
  onChessBotStockfishMove?(result: StockfishResult): void;
}

export interface ComputerActionOptions extends ComputerActionCallbacks {
  getStockfishBestMove?: StockfishBestMoveProvider;
  now?: number;
  random?: () => number;
  userId?: string;
}

const BOUNTY_HUNTING_READY_DELAY_MS = 250;
const BOUNTY_HUNTING_CLAIM_MIN_DELAY_MS = 450;
const BOUNTY_HUNTING_CLAIM_MAX_DELAY_MS = 1_200;
const BOUNTY_HUNTING_WITNESS_MIN_DELAY_MS = 80;
const BOUNTY_HUNTING_WITNESS_MAX_DELAY_MS = 120;
const BOUNTY_HUNTING_RECENT_MESSAGE_WINDOW = 20;
const BOUNTY_HUNTING_RECENT_CLAIM_POOL_SIZE = 5;
const BOUNTY_HUNTING_TOP_CLAIM_RATE = 0.7;
const CHESS_RESPONSE_MIN_DELAY_MS = 700;
const CHESS_RESPONSE_MAX_DELAY_MS = 1_500;
const TRIVIA_RESPONSE_MIN_DELAY_MS = 1_800;
const TRIVIA_RESPONSE_MAX_DELAY_MS = 5_500;
const TRIVIA_BOT_ANSWER_ACCURACY = 0.65;

export function shouldComputerPlayerAct(
  game: GameRecord,
  userId = DEFAULT_COMPUTER_PLAYER_PROFILE.userId,
  now = Date.now()
): boolean {
  if (!hasPlayer(game, userId)) return false;

  switch (game.gameType) {
    case 'bounty-hunting':
      return isBountyHuntingActionNeeded(game, userId, now);
    case 'chess':
      return isChessTurnForPlayer(game, userId);
    case 'replay-trivia':
      return isReplayTriviaAnswerNeeded(game, userId, now);
    case 'stick-around':
      return isStickAroundActionNeeded(game, userId, now);
    default:
      return false;
  }
}

export function getComputerPlayerActionDelayMs(
  game: GameRecord,
  random = Math.random,
  userId = DEFAULT_COMPUTER_PLAYER_PROFILE.userId
): number {
  switch (game.gameType) {
    case 'bounty-hunting':
      if (getBountyHuntingBotGame(game)?.status === 'ready') return BOUNTY_HUNTING_READY_DELAY_MS;
      if (getBountyHuntingWitnessObservations(game, userId).length > 0) {
        return getRandomDelay(BOUNTY_HUNTING_WITNESS_MIN_DELAY_MS, BOUNTY_HUNTING_WITNESS_MAX_DELAY_MS, random);
      }
      return getRandomDelay(BOUNTY_HUNTING_CLAIM_MIN_DELAY_MS, BOUNTY_HUNTING_CLAIM_MAX_DELAY_MS, random);
    case 'chess':
      return getRandomDelay(CHESS_RESPONSE_MIN_DELAY_MS, CHESS_RESPONSE_MAX_DELAY_MS, random);
    case 'replay-trivia':
      return getRandomDelay(TRIVIA_RESPONSE_MIN_DELAY_MS, TRIVIA_RESPONSE_MAX_DELAY_MS, random);
    case 'stick-around':
      return getStickAroundBotActionDelayMs(game);
    default:
      return 0;
  }
}

export function createComputerPlayerAction(
  game: GameRecord,
  options: ComputerActionOptions = {}
): Promise<GameActionInput | null> | GameActionInput | null {
  const userId = options.userId ?? DEFAULT_COMPUTER_PLAYER_PROFILE.userId;
  switch (game.gameType) {
    case 'bounty-hunting':
      return createBountyHuntingBotAction(
        game,
        userId,
        options.random,
        options.now
      );
    case 'chess':
      return createStockfishChessBotAction(
        game,
        userId,
        options.onChessBotStockfishFailure,
        options.onChessBotStockfishMove,
        options.getStockfishBestMove
      );
    case 'replay-trivia':
      return createReplayTriviaBotAnswerAction(
        game,
        userId,
        options.random,
        options.now
      );
    case 'stick-around':
      return createStickAroundBotAction(
        game,
        userId,
        options.now
      );
    default:
      return null;
  }
}

export function createStickAroundBotAction(
  game: GameRecord,
  userId: string,
  now = Date.now()
): GameActionInput | null {
  const stickGame = getStickAroundBotGame(game);
  if (!stickGame) return null;
  if (!Object.values(stickGame.players).includes(userId)) return null;

  const role = getStickAroundPlayerRole(stickGame, userId);
  if (!role) return null;
  if (stickGame.status === 'ready') {
    return stickGame.readyPlayers[role] ? null : {
      action: 'ready',
      userId
    };
  }
  if (stickGame.status === 'countdown') {
    return now - stickGame.phaseStartedAt >= STICK_AROUND_COUNTDOWN_MS
      ? { action: 'startRound', userId }
      : null;
  }
  return null;
}

export async function createStockfishChessBotAction(
  game: GameRecord,
  userId: string,
  onStockfishFailure?: (failure: ChessBotStockfishFailure) => void,
  onStockfishMove?: (result: StockfishResult) => void,
  getBestMove: StockfishBestMoveProvider = getStockfishBestMove
): Promise<GameActionInput | null> {
  const chessGame = getChessBotGame(game);
  if (!chessGame) return null;
  if (chessGame.status !== 'active') return null;
  if (chessGame.players[chessGame.turn] !== userId) return null;

  let stockfishResult: StockfishResult;
  try {
    stockfishResult = await getBestMove(chessGame.fen);
  } catch (error) {
    onStockfishFailure?.({ error, reason: 'stockfish_error' });
    return null;
  }

  const move = stockfishResult.move;
  if (!move) {
    onStockfishFailure?.({ reason: 'stockfish_no_move' });
    return null;
  }

  onStockfishMove?.(stockfishResult);

  return {
    action: 'move',
    payload: toChessMovePayload(move),
    userId
  };
}

export function createReplayTriviaBotAnswerAction(
  game: GameRecord,
  userId: string,
  random = Math.random,
  now = Date.now()
): GameActionInput | null {
  const triviaGame = getReplayTriviaBotGame(game);
  if (!triviaGame) return null;
  if (triviaGame.status !== 'question') return null;
  if (isReplayTriviaQuestionDeadlinePassed(triviaGame, now)) return null;
  if (triviaGame.answers[userId] !== undefined) return null;
  if (!Object.values(triviaGame.players).includes(userId)) return null;

  const question = triviaGame.questions[triviaGame.currentQuestionIndex];
  if (!question) return null;

  const choiceIndex = random() < TRIVIA_BOT_ANSWER_ACCURACY
    ? question.correctChoiceIndex
    : pickWrongChoiceIndex(question.correctChoiceIndex, random);

  return {
    action: 'answer',
    payload: {
      choiceIndex,
      expectedPhaseStartedAt: triviaGame.phaseStartedAt
    },
    userId
  };
}

export function createBountyHuntingBotAction(
  game: GameRecord,
  userId: string,
  random = Math.random,
  now = Date.now()
): GameActionInput | null {
  const bountyGame = getBountyHuntingBotGame(game);
  if (!bountyGame) return null;
  const role = getBountyHuntingPlayerRole(bountyGame, userId);
  if (!role) return null;

  if (bountyGame.status === 'ready') {
    return bountyGame.readyPlayers[role] ? null : {
      action: 'ready',
      userId
    };
  }

  if (bountyGame.status !== 'active') return null;
  if (isBountyHuntingDeadlinePassed(bountyGame, now)) return null;

  const observations = getBountyHuntingWitnessObservations(bountyGame, userId);
  if (observations.length > 0) {
    return {
      action: 'observeBountyMessage',
      payload: { observations },
      userId
    };
  }

  const candidate = pickBountyHuntingClaimCandidate(
    getBountyHuntingClaimCandidates(bountyGame, role),
    random
  );
  if (!candidate) return null;

  return {
    action: 'shootBounty',
    payload: {
      messageId: candidate.messageId,
      observations: [{
        bountyIds: candidate.bountyIds,
        messageId: candidate.messageId,
        ...(candidate.messageTimestampUsec
          ? { messageTimestampUsec: candidate.messageTimestampUsec }
          : {})
      }]
    },
    userId
  };
}

function getRandomDelay(minMs: number, maxMs: number, random: () => number): number {
  return Math.round(minMs + random() * (maxMs - minMs));
}

function hasPlayer(game: GameRecord, userId: string): boolean {
  return Object.values(getGamePlayers(game)).includes(userId);
}

function isChessTurnForPlayer(game: GameRecord, userId: string): boolean {
  const chessGame = getChessBotGame(game);
  if (!chessGame) return false;
  if (chessGame.status !== 'active') return false;
  return chessGame.players[chessGame.turn] === userId;
}

function isReplayTriviaAnswerNeeded(game: GameRecord, userId: string, now: number): boolean {
  const triviaGame = getReplayTriviaBotGame(game);
  return Boolean(
    triviaGame
      && triviaGame.status === 'question'
      && triviaGame.answers[userId] === undefined
      && !isReplayTriviaQuestionDeadlinePassed(triviaGame, now)
  );
}

function isBountyHuntingActionNeeded(game: GameRecord, userId: string, now: number): boolean {
  const bountyGame = getBountyHuntingBotGame(game);
  if (!bountyGame) return false;
  const role = getBountyHuntingPlayerRole(bountyGame, userId);
  if (!role) return false;

  if (bountyGame.status === 'ready') return !bountyGame.readyPlayers[role];
  return bountyGame.status === 'active'
    && !isBountyHuntingDeadlinePassed(bountyGame, now)
    && (
      getBountyHuntingWitnessObservations(bountyGame, userId).length > 0 ||
      getBountyHuntingClaimCandidates(bountyGame, role).length > 0
    );
}

function isStickAroundActionNeeded(game: GameRecord, userId: string, now: number): boolean {
  const stickGame = getStickAroundBotGame(game);
  if (!stickGame) return false;
  const role = getStickAroundPlayerRole(stickGame, userId);
  if (!role) return false;
  if (stickGame.status === 'ready') return !stickGame.readyPlayers[role];
  if (stickGame.status === 'countdown') return now - stickGame.phaseStartedAt >= STICK_AROUND_COUNTDOWN_MS;
  return false;
}

function getStickAroundBotActionDelayMs(game: GameRecord): number {
  const stickGame = getStickAroundBotGame(game);
  if (!stickGame) return 0;
  if (stickGame.status === 'countdown') {
    return Math.max(100, stickGame.phaseStartedAt + STICK_AROUND_COUNTDOWN_MS - Date.now());
  }
  return stickGame.status === 'ready' ? 450 : 0;
}

function getGamePlayers(game: GameRecord): Record<string, string> {
  const candidate = (game as GameRecord & { players?: unknown }).players;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};
  return candidate as Record<string, string>;
}

function getChessBotGame(game: GameRecord): ChessGameRecord | null {
  if (game.gameType !== 'chess') return null;
  return game as ChessGameRecord;
}

function toChessMovePayload(move: ChessBotMove): Record<string, unknown> {
  return move.promotion
    ? { from: move.from, promotion: move.promotion, to: move.to }
    : { from: move.from, to: move.to };
}

function getReplayTriviaBotGame(game: GameRecord): ReplayTriviaGameRecord | null {
  if (game.gameType !== 'replay-trivia') return null;
  return game as ReplayTriviaGameRecord;
}

function getStickAroundBotGame(game: GameRecord): StickAroundGameRecord | null {
  if (game.gameType !== 'stick-around') return null;
  return game as StickAroundGameRecord;
}

function getStickAroundPlayerRole(
  game: StickAroundGameRecord,
  userId: string
): 'guest' | 'host' | null {
  if (game.players.host === userId) return 'host';
  if (game.players.guest === userId) return 'guest';
  return null;
}

function isReplayTriviaQuestionDeadlinePassed(game: ReplayTriviaGameRecord, now: number): boolean {
  return now - game.phaseStartedAt >= REPLAY_TRIVIA_QUESTION_READ_MS + REPLAY_TRIVIA_ANSWER_TIME_MS;
}

function pickWrongChoiceIndex(correctChoiceIndex: ChoiceIndex, random: () => number): ChoiceIndex {
  const wrongChoices = ([0, 1, 2, 3] as ChoiceIndex[]).filter((choiceIndex) => choiceIndex !== correctChoiceIndex);
  const index = Math.min(Math.floor(random() * wrongChoices.length), wrongChoices.length - 1);
  return wrongChoices[index];
}

interface BountyHuntingBotClaimCandidate {
  amount: number;
  bountyIds: string[];
  messageId: string;
  messageTimestampUsec?: string;
  observedAt: number;
}

interface BountyHuntingBotWitnessObservation {
  bountyIds: string[];
  messageId: string;
  messageTimestampUsec?: string;
}

function getBountyHuntingBotGame(game: GameRecord): BountyHuntingGameRecord | null {
  if (game.gameType !== 'bounty-hunting') return null;
  return game as BountyHuntingGameRecord;
}

function getBountyHuntingPlayerRole(
  game: BountyHuntingGameRecord,
  userId: string
): BountyHuntingPlayerRole | null {
  if (!game.players || typeof game.players !== 'object') return null;
  if (game.players.host === userId) return 'host';
  if (game.players.guest === userId) return 'guest';
  return null;
}

function isBountyHuntingDeadlinePassed(game: BountyHuntingGameRecord, now: number): boolean {
  return now - game.phaseStartedAt >= BOUNTY_HUNTING_ROUND_MS;
}

function getBountyHuntingClaimCandidates(
  game: BountyHuntingGameRecord,
  botRole: BountyHuntingPlayerRole
): BountyHuntingBotClaimCandidate[] {
  const bountiesById = new Map(game.bounties.map((bounty) => [bounty.id, bounty]));
  const witnesses = getBountyHuntingEligibleOpponentWitnesses(game, botRole, bountiesById);
  const recentMessageIds = getBountyHuntingRecentOpponentMessageIds(witnesses);

  return witnesses
    .flatMap((witness): BountyHuntingBotClaimCandidate[] => {
      if (!recentMessageIds.has(witness.messageId)) return [];
      const amounts = witness.bountyIds
        .map((bountyId) => bountiesById.get(bountyId)?.amount)
        .filter((amount): amount is number => amount !== undefined);
      return amounts.length ? [{
        amount: Math.max(...amounts),
        bountyIds: witness.bountyIds,
        messageId: witness.messageId,
        messageTimestampUsec: witness.messageTimestampUsec,
        observedAt: witness.observedAt
      }] : [];
    })
    .sort((a, b) =>
      b.observedAt - a.observedAt ||
      b.amount - a.amount ||
      a.messageId.localeCompare(b.messageId)
    );
}

function getBountyHuntingWitnessObservations(
  game: GameRecord,
  botUserId: string
): BountyHuntingBotWitnessObservation[] {
  const bountyGame = getBountyHuntingBotGame(game);
  if (!bountyGame || bountyGame.status !== 'active') return [];
  const botRole = getBountyHuntingPlayerRole(bountyGame, botUserId);
  if (!botRole) return [];

  const bountiesById = new Map(bountyGame.bounties.map((bounty) => [bounty.id, bounty]));
  const witnesses = getBountyHuntingEligibleOpponentWitnesses(bountyGame, botRole, bountiesById);
  const recentMessageIds = getBountyHuntingRecentOpponentMessageIds(witnesses);
  const botWitnessBountiesByMessage = new Map<string, Set<string>>();
  bountyGame.claimWitnesses
    .filter((witness) => witness.role === botRole)
    .forEach((witness) => {
      botWitnessBountiesByMessage.set(witness.messageId, new Set(witness.bountyIds));
    });
  const observations = new Map<string, { bountyIds: Set<string>; messageTimestampUsec?: string }>();

  for (const witness of witnesses) {
    if (!recentMessageIds.has(witness.messageId)) continue;
    if (!witness.messageTimestampUsec) continue;
    const witnessedBountyIds = botWitnessBountiesByMessage.get(witness.messageId);

    const observation = observations.get(witness.messageId) || {
      bountyIds: new Set<string>(),
      messageTimestampUsec: witness.messageTimestampUsec
    };
    witness.bountyIds
      .filter((bountyId) => !witnessedBountyIds?.has(bountyId))
      .forEach((bountyId) => observation.bountyIds.add(bountyId));
    if (!observation.bountyIds.size) continue;
    observations.set(witness.messageId, observation);
    if (observations.size >= BOUNTY_HUNTING_MAX_WITNESS_OBSERVATIONS) break;
  }

  return [...observations.entries()].map(([messageId, observation]) => ({
    bountyIds: [...observation.bountyIds],
    messageId,
    messageTimestampUsec: observation.messageTimestampUsec
  }));
}

function getBountyHuntingEligibleOpponentWitnesses(
  game: BountyHuntingGameRecord,
  botRole: BountyHuntingPlayerRole,
  bountiesById: Map<string, BountyHuntingBounty>
): BountyHuntingClaimWitness[] {
  const claimedBountyIds = new Set(game.claims.map((claim) => claim.bountyId));
  const claimedMessageIds = new Set(game.claims.map((claim) => claim.messageId));
  return game.claimWitnesses
    .flatMap((witness) => {
      if (witness.role === botRole || claimedMessageIds.has(witness.messageId)) return [];
      const bountyIds = witness.bountyIds.filter((bountyId) =>
        !claimedBountyIds.has(bountyId) && bountiesById.has(bountyId)
      );
      return bountyIds.length ? [{ ...witness, bountyIds }] : [];
    })
    .sort(compareBountyHuntingWitnessRecency);
}

function getBountyHuntingRecentOpponentMessageIds(
  witnesses: BountyHuntingClaimWitness[]
): Set<string> {
  const messageIds = new Set<string>();
  for (const witness of witnesses) {
    messageIds.add(witness.messageId);
    if (messageIds.size >= BOUNTY_HUNTING_RECENT_MESSAGE_WINDOW) break;
  }
  return messageIds;
}

function compareBountyHuntingWitnessRecency(
  a: BountyHuntingClaimWitness,
  b: BountyHuntingClaimWitness
): number {
  return b.observedAt - a.observedAt;
}

function pickBountyHuntingClaimCandidate(
  candidates: BountyHuntingBotClaimCandidate[],
  random: () => number
): BountyHuntingBotClaimCandidate | null {
  if (!candidates.length) return null;
  const recentCandidates = candidates.slice(0, BOUNTY_HUNTING_RECENT_CLAIM_POOL_SIZE);
  if (recentCandidates.length === 1 || random() < BOUNTY_HUNTING_TOP_CLAIM_RATE) return recentCandidates[0];
  const fallbackCount = recentCandidates.length - 1;
  const fallbackIndex = 1 + Math.min(Math.floor(random() * fallbackCount), fallbackCount - 1);
  return recentCandidates[fallbackIndex];
}
