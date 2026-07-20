/**
 * Playground Games content-side client.
 *
 * Owns the connection from the live chat page to the background Playground
 * bridge, normalizes lobby snapshots into local state, and exposes small
 * commands for availability, invites, and game actions.
 */
import {
  PLAYGROUND_PORT_NAME,
  type GameEndReason,
  type GameId,
  type IncompatibleActiveGame,
  type LobbySnapshot,
  type PlaygroundActionError,
  type PlaygroundBackgroundMessage,
  type PlaygroundContentMessage,
  type PublicGame,
  type PublicInvite,
  type ServerMessage
} from '../../../shared/playground/protocol';
import { getUiLocale } from '../../../shared/i18n';
import { showToast } from '../../../shared/toast';
import { getCurrentYouTubeChatStreamKey } from '../../../youtube/source-url';
import {
  getAvailableGameIds,
  handleGameActionError,
  handleGameServerMessage,
  notifyGameClientReset,
  notifyGameEnded
} from './registry';

export interface PlaygroundClientState {
  available: boolean;
  connectionError: string;
  endedGame: PlaygroundEndedGame | null;
  games: PublicGame[];
  incompatibleActiveGames: IncompatibleActiveGame[];
  incompatibleGames: GameId[];
  invites: PublicInvite[];
  status: 'connected' | 'connecting' | 'disconnected';
  users: LobbySnapshot['users'];
  userId: string;
}

export interface PlaygroundEndedGame {
  gameId: string;
  reason: GameEndReason;
  userId: string;
}

type PlaygroundClientListener = (state: PlaygroundClientState) => void;
type PlaygroundActionErrorListener = (error: PlaygroundActionError) => void;

const ACTION_ERROR_TOAST_DURATION_MS = 5_000;

const DEFAULT_STATE: PlaygroundClientState = {
  available: false,
  connectionError: '',
  endedGame: null,
  games: [],
  incompatibleActiveGames: [],
  incompatibleGames: [],
  invites: [],
  status: 'disconnected',
  users: [],
  userId: ''
};

let available = false;
let availabilityStreamKey = '';
let currentStreamKey = '';
let actionErrorListeners = new Set<PlaygroundActionErrorListener>();
let listeners = new Set<PlaygroundClientListener>();
let playgroundPort: chrome.runtime.Port | null = null;
let state: PlaygroundClientState = { ...DEFAULT_STATE };

export function subscribePlaygroundClient(listener: PlaygroundClientListener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export function subscribePlaygroundActionErrors(
  listener: PlaygroundActionErrorListener
): () => void {
  actionErrorListeners.add(listener);
  return () => {
    actionErrorListeners.delete(listener);
  };
}

export function getPlaygroundClientState(): PlaygroundClientState {
  return state;
}

export function getPlaygroundAvailability(defaultAvailable = false): boolean {
  const streamKey = getCurrentYouTubeChatStreamKey();
  return streamKey && streamKey === availabilityStreamKey ? available : defaultAvailable;
}

export function startPlaygroundClient(defaultAvailable = available): void {
  const streamKey = getCurrentYouTubeChatStreamKey();
  if (!streamKey) {
    notifyGameClientReset();
    setState({
      ...DEFAULT_STATE,
      connectionError: 'Stream unavailable.'
    });
    return;
  }

  if (availabilityStreamKey !== streamKey) {
    availabilityStreamKey = streamKey;
    available = defaultAvailable;
  }

  if (playgroundPort && currentStreamKey === streamKey && state.status !== 'disconnected') {
    return;
  }

  const streamChanged = currentStreamKey !== streamKey;
  if (streamChanged) notifyGameClientReset();
  currentStreamKey = streamKey;
  setState({
    ...state,
    available,
    connectionError: '',
    incompatibleActiveGames: [],
    incompatibleGames: [],
    status: 'connecting'
  });

  if (!playgroundPort) {
    try {
      playgroundPort = chrome.runtime.connect({ name: PLAYGROUND_PORT_NAME });
    } catch (error) {
      notifyGameClientReset();
      setState({
        ...DEFAULT_STATE,
        connectionError: error instanceof Error ? error.message : 'Playground unavailable.'
      });
      return;
    }

    playgroundPort.onMessage.addListener(handleBackgroundMessage);
    playgroundPort.onDisconnect.addListener(handlePortDisconnect);
  }

  postPlaygroundMessage({
    availableGames: getAvailableGames(),
    languageCode: getPlaygroundLanguageCode(),
    locale: getUiLocale(),
    streamKey,
    type: 'ytcq:playground:init'
  });
}

export function stopPlaygroundClient(): void {
  const port = playgroundPort;
  playgroundPort = null;
  available = false;
  availabilityStreamKey = '';
  currentStreamKey = '';
  notifyGameClientReset();
  if (port) {
    port.onMessage.removeListener(handleBackgroundMessage);
    port.onDisconnect.removeListener(handlePortDisconnect);
    postPlaygroundMessageOnPort(port, { type: 'ytcq:playground:disconnect' });
    port.disconnect();
  }

  setState({ ...DEFAULT_STATE });
}

export function setPlaygroundAvailability(nextAvailable: boolean): void {
  available = nextAvailable;
  setState({
    ...state,
    available
  });
  startPlaygroundClient(available);
  postPlaygroundMessage({
    availableGames: getAvailableGames(),
    type: 'ytcq:playground:set-availability'
  });
}

export function sendPlaygroundInvite(gameId: GameId, toUserId: string): void {
  postPlaygroundMessage({
    gameId,
    toUserId,
    type: 'ytcq:playground:invite'
  });
}

export function cancelPlaygroundInvite(gameId: GameId, toUserId: string): void {
  postPlaygroundMessage({
    gameId,
    toUserId,
    type: 'ytcq:playground:cancel-invite'
  });
}

export function respondToPlaygroundInvite(inviteId: string, accept: boolean): void {
  postPlaygroundMessage({
    accept,
    inviteId,
    type: 'ytcq:playground:respond-invite'
  });
}

export function sendPlaygroundGameAction(
  gameId: string,
  action: string,
  payload?: Record<string, unknown>
): void {
  postPlaygroundMessage({
    action,
    gameId,
    payload,
    type: 'ytcq:playground:game-action'
  });
}

function handleBackgroundMessage(message: PlaygroundBackgroundMessage): void {
  switch (message?.type) {
    case 'ytcq:playground:status':
      setState({
        ...state,
        available,
        connectionError: message.error || '',
        incompatibleActiveGames: message.status === 'connected' ? state.incompatibleActiveGames : [],
        incompatibleGames: message.status === 'connected' ? state.incompatibleGames : [],
        status: message.status
      });
      return;
    case 'ytcq:playground:snapshot':
      if (state.status !== 'connected') notifyGameClientReset();
      setState({
        ...state,
        available,
        connectionError: '',
        endedGame: null,
        games: message.snapshot.games,
        incompatibleActiveGames: message.incompatibleActiveGames,
        incompatibleGames: message.incompatibleGames,
        invites: message.snapshot.invites,
        status: 'connected',
        users: message.snapshot.users,
        userId: message.userId
      });
      return;
    case 'ytcq:playground:error':
      if (state.status === 'connected') {
        const error: PlaygroundActionError = message;
        actionErrorListeners.forEach((listener) => listener(error));
        if (message.code === 'game_version') return;
        if (handleGameActionError(error)) {
          notifyListeners();
          return;
        }
        showToast(message.message, {
          durationMs: ACTION_ERROR_TOAST_DURATION_MS,
          tone: 'error'
        });
      } else {
        if (message.code === 'game_version') return;
        setState({
          ...state,
          connectionError: message.message
        });
      }
      return;
    case 'ytcq:playground:server-message':
      handleServerMessage(message.message);
      return;
  }
}

function handleServerMessage(message: ServerMessage): void {
  if (handleGameServerMessage(message)) {
    notifyListeners();
    return;
  }

  switch (message.type) {
    case 'inviteCreated':
    case 'inviteReceived':
    case 'inviteUpdated':
      setState({
        ...state,
        invites: mergeInvite(state.invites, message.invite)
      });
      return;
    case 'gameStarted':
    case 'gameUpdated':
      setState({
        ...state,
        endedGame: null,
        games: mergeGame(state.games, message.game),
        invites: state.invites.filter((invite) => invite.status === 'pending')
      });
      return;
    case 'gameEnded':
      notifyGameEnded(message.gameId);
      setState({
        ...state,
        endedGame: {
          gameId: message.gameId,
          reason: message.reason,
          userId: message.userId
        },
        games: state.games.filter((game) => game.gameId !== message.gameId),
        incompatibleActiveGames: state.incompatibleActiveGames.filter((game) =>
          game.gameId !== message.gameId
        )
      });
      return;
  }
}

function handlePortDisconnect(): void {
  playgroundPort = null;
  setState({
    ...state,
    connectionError: '',
    incompatibleActiveGames: [],
    incompatibleGames: [],
    status: 'disconnected'
  });
}

function setState(nextState: PlaygroundClientState): void {
  state = nextState;
  notifyListeners();
}

function notifyListeners(): void {
  listeners.forEach((listener) => listener(state));
}

function getAvailableGames(): GameId[] {
  return available ? getAvailableGameIds() : [];
}

function getPlaygroundLanguageCode(): string {
  return getUiLocale() || navigator.language || 'en';
}

function postPlaygroundMessage(message: PlaygroundContentMessage): void {
  if (!playgroundPort) return;
  postPlaygroundMessageOnPort(playgroundPort, message);
}

function postPlaygroundMessageOnPort(port: chrome.runtime.Port, message: PlaygroundContentMessage): void {
  try {
    port.postMessage(message);
  } catch {
    playgroundPort = null;
  }
}

function mergeInvite(invites: PublicInvite[], invite: PublicInvite): PublicInvite[] {
  const next = invites.filter((candidate) => candidate.inviteId !== invite.inviteId);
  if (invite.status === 'pending') next.push(invite);
  return next;
}

function mergeGame(games: PublicGame[], game: PublicGame): PublicGame[] {
  const existingIndex = games.findIndex((candidate) => candidate.gameId === game.gameId);
  if (existingIndex < 0) return [...games, game];

  const nextGames = [...games];
  nextGames[existingIndex] = game;
  return nextGames;
}
