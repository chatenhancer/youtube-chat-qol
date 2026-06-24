/**
 * Games lobby state selectors.
 *
 * Keeps filtering and derived state separate from DOM rendering and network
 * commands, so the lobby view can stay declarative.
 */
import {
  isPlaygroundComputerUserId,
  type GameId,
  type PresenceUser,
  type PublicGame,
  type PublicInvite
} from '../../../shared/playground/protocol';
import type { PlaygroundClientState } from './client';
import { isPlayableGameId, isSupportedGameId } from './registry';

export type GamesPanelMode = 'lobby' | 'players';

export interface GamesPanelState {
  activeGameIndex: number;
  available: boolean;
  invitedPlayer: string;
  leavingGameId: string;
  mode: GamesPanelMode;
  selectedGameId: GameId | null;
  transport: PlaygroundClientState;
}

export function createInitialGamesPanelState(available: boolean, transport: PlaygroundClientState): GamesPanelState {
  return {
    activeGameIndex: 0,
    available,
    invitedPlayer: '',
    leavingGameId: '',
    mode: 'lobby',
    selectedGameId: null,
    transport
  };
}

export function shouldShowTransportNotice(state: GamesPanelState): boolean {
  return state.transport.status !== 'connected';
}

export function getOnlinePlayerCount(state: GamesPanelState): number {
  const currentUserId = state.transport.userId || '';
  return state.transport.users
    .filter((user) => user.userId !== currentUserId)
    .filter((user) => !isPlaygroundComputerUserId(user.userId))
    .filter(isUserAvailableForSupportedGame)
    .length;
}

export function isCurrentUserAvailable(state: PlaygroundClientState, fallbackAvailable: boolean): boolean {
  const currentUser = state.users.find((user) => user.userId === state.userId);
  return currentUser ? isUserAvailableForSupportedGame(currentUser) : fallbackAvailable;
}

export function getPendingInvites(state: GamesPanelState): PublicInvite[] {
  const currentUserId = state.transport.userId || '';
  return state.transport.invites
    .filter((invite) => invite.status === 'pending' && invite.toUser.userId === currentUserId)
    .filter((invite) => isPlayableGameId(invite.gameId));
}

export function getAvailablePlayers(state: GamesPanelState, gameId: GameId): PresenceUser[] {
  if (!isPlayableGameId(gameId)) return [];

  const currentUserId = state.transport.userId || '';
  return state.transport.users
    .filter((user) => user.userId !== currentUserId && user.availableGames.includes(gameId))
    .filter((user) => !hasActiveGameWithPlayer(state.transport.games, gameId, currentUserId, user.userId));
}

function isUserAvailableForSupportedGame(user: PresenceUser): boolean {
  return user.availableGames.some(isPlayableGameId);
}

function hasActiveGameWithPlayer(
  games: PublicGame[],
  gameId: GameId,
  currentUserId: string,
  playerUserId: string
): boolean {
  return games.some((game) => {
    if (!isSupportedGameId(game.gameType) || game.gameType !== gameId) return false;
    const playerUserIds = Object.values(game.players || {}).map((player) => player?.userId);
    return playerUserIds.includes(currentUserId) && playerUserIds.includes(playerUserId);
  });
}

export function getSupportedGames(games: PublicGame[]): PublicGame[] {
  return games.filter((game) => isSupportedGameId(game.gameType));
}
