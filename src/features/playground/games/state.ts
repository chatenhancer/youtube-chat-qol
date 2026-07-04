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
  invitedGameId: GameId | null;
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
    invitedGameId: null,
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
  return getPendingInvitesForCurrentUser(state.transport);
}

export function getPendingInviteCount(state: PlaygroundClientState): number {
  return getPendingInvitesForCurrentUser(state).length;
}

export function isPlayerInvitePending(state: GamesPanelState, gameId: GameId, toUserId: string): boolean {
  return (
    (state.invitedGameId === gameId && state.invitedPlayer === toUserId) ||
    Boolean(getPendingOutgoingInvite(state, gameId, toUserId))
  );
}

export function getActiveGameCount(state: PlaygroundClientState): number {
  const currentUserId = state.userId || '';
  if (!currentUserId) return 0;

  return getSupportedGames(state.games)
    .filter((game) => isCurrentUserGame(game, currentUserId))
    .length;
}

function getPendingInvitesForCurrentUser(state: PlaygroundClientState): PublicInvite[] {
  const currentUserId = state.userId || '';
  return state.invites
    .filter((invite) => invite.status === 'pending' && invite.toUser.userId === currentUserId)
    .filter((invite) => isPlayableGameId(invite.gameId));
}

function getPendingOutgoingInvite(state: GamesPanelState, gameId: GameId, toUserId: string): PublicInvite | null {
  const currentUserId = state.transport.userId || '';
  if (!currentUserId) return null;

  return state.transport.invites.find((invite) =>
    invite.status === 'pending' &&
    invite.fromUser.userId === currentUserId &&
    invite.toUser.userId === toUserId &&
    invite.gameId === gameId
  ) || null;
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

function isCurrentUserGame(game: PublicGame, currentUserId: string): boolean {
  const players = Object.values(game.players || {});
  return !players.length || players.some((player) => player?.userId === currentUserId);
}

export function getGamesPanelViewKey(state: GamesPanelState, activeGamePanelId: string): string {
  const { transport } = state;
  return [
    state.mode,
    state.selectedGameId || '',
    state.invitedGameId || '',
    state.invitedPlayer,
    state.leavingGameId,
    String(state.activeGameIndex),
    activeGamePanelId,
    String(state.available),
    transport.status,
    transport.error,
    transport.userId,
    String(transport.available),
    transport.users.map(getPresenceRenderKey).join('\n'),
    transport.invites.map(getInviteRenderKey).join('\n'),
    getSupportedGames(transport.games).map(getGameRenderKey).join('\n')
  ].join('\u001f');
}

function getPresenceRenderKey(user: PresenceUser): string {
  return [
    user.userId,
    user.displayName,
    user.availableGames.join(',')
  ].join('\u001e');
}

function getInviteRenderKey(invite: PublicInvite): string {
  return [
    invite.inviteId,
    invite.gameId,
    invite.status,
    invite.fromUser.userId,
    invite.fromUser.displayName,
    invite.toUser.userId,
    invite.toUser.displayName
  ].join('\u001e');
}

function getGameRenderKey(game: PublicGame): string {
  const players = Object.entries(game.players || {})
    .map(([role, player]) => [
      role,
      player?.userId || '',
      player?.displayName || ''
    ].join(':'))
    .join('|');
  return [
    game.gameId,
    game.gameType,
    players
  ].join('\u001e');
}
