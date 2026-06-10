/**
 * Games lobby state selectors.
 *
 * Keeps filtering and derived state separate from DOM rendering and network
 * commands, so the lobby view can stay declarative.
 */
import type { GameId, PresenceUser, PublicGame, PublicInvite } from '../../../shared/playground-protocol';
import type { PlaygroundClientState } from './client';
import { isSupportedGameId } from './registry';

export type GamesPanelMode = 'lobby' | 'players';

export interface GamesPanelState {
  available: boolean;
  invitedPlayer: string;
  mode: GamesPanelMode;
  selectedGameId: GameId | null;
  transport: PlaygroundClientState;
}

export function createInitialGamesPanelState(available: boolean, transport: PlaygroundClientState): GamesPanelState {
  return {
    available,
    invitedPlayer: '',
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
    .filter((invite) => invite.status === 'pending' && invite.toUser.userId === currentUserId);
}

export function getAvailablePlayers(state: GamesPanelState, gameId: GameId): PresenceUser[] {
  const currentUserId = state.transport.userId || '';
  return state.transport.users
    .filter((user) => user.userId !== currentUserId && user.availableGames.includes(gameId));
}

function isUserAvailableForSupportedGame(user: PresenceUser): boolean {
  return user.availableGames.some(isSupportedGameId);
}

export function getFirstSupportedGame(games: PublicGame[]): PublicGame | null {
  return games.find((game) => isSupportedGameId(game.gameType)) || null;
}

export function getPlayerInitial(player: string): string {
  const handle = player.replace(/^@/, '').trim();
  return (handle[0] || '?').toUpperCase();
}
