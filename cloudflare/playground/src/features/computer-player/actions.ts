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
  REPLAY_TRIVIA_QUESTION_READ_MS
} from '../../games/replay-trivia';
import type { GameActionInput, GameRecord } from '../../games/types';
import {
  BOUNTY_HUNTING_ROUND_MS,
  type BountyHuntingBounty,
  type BountyHuntingClaim,
  type BountyHuntingGameStatus,
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

const BOUNTY_HUNTING_RESPONSE_MIN_DELAY_MS = 1_200;
const BOUNTY_HUNTING_RESPONSE_MAX_DELAY_MS = 3_600;
const BOUNTY_HUNTING_WITNESS_DELAY_MS = 120;
const BOUNTY_HUNTING_WITNESS_OBSERVATIONS_PER_ACTION = 20;
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
      if (getBountyHuntingWitnessObservations(game, userId).length > 0) return BOUNTY_HUNTING_WITNESS_DELAY_MS;
      return getRandomDelay(BOUNTY_HUNTING_RESPONSE_MIN_DELAY_MS, BOUNTY_HUNTING_RESPONSE_MAX_DELAY_MS, random);
    case 'chess':
      return getRandomDelay(CHESS_RESPONSE_MIN_DELAY_MS, CHESS_RESPONSE_MAX_DELAY_MS, random);
    case 'replay-trivia':
      return getRandomDelay(TRIVIA_RESPONSE_MIN_DELAY_MS, TRIVIA_RESPONSE_MAX_DELAY_MS, random);
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
    default:
      return null;
  }
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
    payload: { choiceIndex },
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
    action: 'claimBounty',
    payload: {
      bountyId: candidate.bountyId,
      messageId: candidate.messageId,
      ...(candidate.messageTimestampUsec ? { messageTimestampUsec: candidate.messageTimestampUsec } : {})
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

interface ReplayTriviaBotGame extends GameRecord {
  answers: Record<string, ChoiceIndex | null | undefined>;
  currentQuestionIndex: number;
  gameType: 'replay-trivia';
  phaseStartedAt: number;
  players: Record<string, string>;
  questions: ReplayTriviaBotQuestion[];
}

interface ReplayTriviaBotQuestion {
  correctChoiceIndex: ChoiceIndex;
}

function getReplayTriviaBotGame(game: GameRecord): ReplayTriviaBotGame | null {
  if (game.gameType !== 'replay-trivia') return null;
  return game as ReplayTriviaBotGame;
}

function isReplayTriviaQuestionDeadlinePassed(game: ReplayTriviaBotGame, now: number): boolean {
  return now - game.phaseStartedAt >= REPLAY_TRIVIA_QUESTION_READ_MS + REPLAY_TRIVIA_ANSWER_TIME_MS;
}

function pickWrongChoiceIndex(correctChoiceIndex: ChoiceIndex, random: () => number): ChoiceIndex {
  const wrongChoices = ([0, 1, 2, 3] as ChoiceIndex[]).filter((choiceIndex) => choiceIndex !== correctChoiceIndex);
  const index = Math.min(Math.floor(random() * wrongChoices.length), wrongChoices.length - 1);
  return wrongChoices[index];
}

interface BountyHuntingBotGame extends GameRecord {
  bounties: BountyHuntingBounty[];
  claimedMessageIds: string[];
  claimWitnesses: BountyHuntingBotClaimWitness[];
  claims: BountyHuntingClaim[];
  gameType: 'bounty-hunting';
  phaseStartedAt: number;
  players: Record<BountyHuntingPlayerRole, string>;
  readyPlayers: Partial<Record<BountyHuntingPlayerRole, boolean>>;
  status: BountyHuntingGameStatus;
}

interface BountyHuntingBotClaimWitness {
  bountyId: string;
  messageId: string;
  messageTimestampUsec?: string;
  observedAt: number;
  role: BountyHuntingPlayerRole;
  userId: string;
}

interface BountyHuntingBotClaimCandidate {
  amount: number;
  bountyId: string;
  messageId: string;
  messageTimestampUsec?: string;
  observedAt: number;
}

interface BountyHuntingBotWitnessObservation {
  bountyIds: string[];
  messageId: string;
  messageTimestampUsec?: string;
}

function getBountyHuntingBotGame(game: GameRecord): BountyHuntingBotGame | null {
  if (game.gameType !== 'bounty-hunting') return null;
  return game as BountyHuntingBotGame;
}

function getBountyHuntingPlayerRole(
  game: BountyHuntingBotGame,
  userId: string
): BountyHuntingPlayerRole | null {
  if (!game.players || typeof game.players !== 'object') return null;
  if (game.players.host === userId) return 'host';
  if (game.players.guest === userId) return 'guest';
  return null;
}

function isBountyHuntingDeadlinePassed(game: BountyHuntingBotGame, now: number): boolean {
  return now - game.phaseStartedAt >= BOUNTY_HUNTING_ROUND_MS;
}

function getBountyHuntingClaimCandidates(
  game: BountyHuntingBotGame,
  botRole: BountyHuntingPlayerRole
): BountyHuntingBotClaimCandidate[] {
  const bountiesById = new Map(game.bounties.map((bounty) => [bounty.id, bounty]));
  const witnesses = getBountyHuntingEligibleOpponentWitnesses(game, botRole, bountiesById);
  const recentMessageIds = getBountyHuntingRecentOpponentMessageIds(witnesses);
  const candidateKeys = new Set<string>();

  return witnesses
    .flatMap((witness): BountyHuntingBotClaimCandidate[] => {
      if (!recentMessageIds.has(witness.messageId)) return [];
      const bounty = bountiesById.get(witness.bountyId);
      if (!bounty) return [];
      const key = `${witness.messageId}:${witness.bountyId}`;
      if (candidateKeys.has(key)) return [];
      candidateKeys.add(key);
      return [{
        amount: bounty.amount,
        bountyId: witness.bountyId,
        messageId: witness.messageId,
        messageTimestampUsec: witness.messageTimestampUsec,
        observedAt: witness.observedAt
      }];
    })
    .sort((a, b) =>
      b.observedAt - a.observedAt ||
      b.amount - a.amount ||
      a.bountyId.localeCompare(b.bountyId) ||
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
  const botWitnessKeys = new Set(
    bountyGame.claimWitnesses
      .filter((witness) => witness.role === botRole)
      .map((witness) => getBountyHuntingWitnessKey(witness))
  );
  const observations = new Map<string, { bountyIds: Set<string>; messageTimestampUsec?: string }>();

  for (const witness of witnesses) {
    if (!recentMessageIds.has(witness.messageId)) continue;
    if (!witness.messageTimestampUsec) continue;
    if (botWitnessKeys.has(getBountyHuntingWitnessKey({
      ...witness,
      role: botRole
    }))) continue;

    const observation = observations.get(witness.messageId) || {
      bountyIds: new Set<string>(),
      messageTimestampUsec: witness.messageTimestampUsec
    };
    observation.bountyIds.add(witness.bountyId);
    observations.set(witness.messageId, observation);
    if (observations.size >= BOUNTY_HUNTING_WITNESS_OBSERVATIONS_PER_ACTION) break;
  }

  return [...observations.entries()].map(([messageId, observation]) => ({
    bountyIds: [...observation.bountyIds],
    messageId,
    messageTimestampUsec: observation.messageTimestampUsec
  }));
}

function getBountyHuntingEligibleOpponentWitnesses(
  game: BountyHuntingBotGame,
  botRole: BountyHuntingPlayerRole,
  bountiesById: Map<string, BountyHuntingBounty>
): BountyHuntingBotClaimWitness[] {
  const claimedBountyIds = new Set(game.claims.map((claim) => claim.bountyId));
  const claimedMessageIds = new Set(game.claimedMessageIds);
  return game.claimWitnesses
    .filter((witness) =>
      witness.role !== botRole &&
      !claimedBountyIds.has(witness.bountyId) &&
      !claimedMessageIds.has(witness.messageId) &&
      bountiesById.has(witness.bountyId)
    )
    .sort(compareBountyHuntingWitnessRecency);
}

function getBountyHuntingRecentOpponentMessageIds(
  witnesses: BountyHuntingBotClaimWitness[]
): Set<string> {
  const messageIds = new Set<string>();
  for (const witness of witnesses) {
    messageIds.add(witness.messageId);
    if (messageIds.size >= BOUNTY_HUNTING_RECENT_MESSAGE_WINDOW) break;
  }
  return messageIds;
}

function compareBountyHuntingWitnessRecency(
  a: BountyHuntingBotClaimWitness,
  b: BountyHuntingBotClaimWitness
): number {
  return b.observedAt - a.observedAt;
}

function getBountyHuntingWitnessKey(
  witness: Pick<BountyHuntingBotClaimWitness, 'bountyId' | 'messageId' | 'role'>
): string {
  return `${witness.role}:${witness.messageId}:${witness.bountyId}`;
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
