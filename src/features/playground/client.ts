import {
  PLAYGROUND_PORT_NAME,
  type ClientProfile,
  type GameEndReason,
  type GameId,
  type LobbySnapshot,
  type PlaygroundBackgroundMessage,
  type PlaygroundContentMessage,
  type PublicGame,
  type PublicInvite,
  type ServerMessage
} from '../../shared/playground-protocol';
import { cleanText } from '../../shared/text';
import { getCurrentYouTubeChatStreamKey } from '../../youtube/source-url';

export interface PlaygroundClientState {
  endedGame: PlaygroundEndedGame | null;
  error: string;
  games: PublicGame[];
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

const DEFAULT_STATE: PlaygroundClientState = {
  endedGame: null,
  error: '',
  games: [],
  invites: [],
  status: 'disconnected',
  users: [],
  userId: ''
};

let available = false;
let currentStreamKey = '';
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

export function getPlaygroundClientState(): PlaygroundClientState {
  return state;
}

export function startPlaygroundClient(nextAvailable = available): void {
  available = nextAvailable;
  const streamKey = getCurrentYouTubeChatStreamKey();
  if (!streamKey) {
    setState({
      ...DEFAULT_STATE,
      error: 'Stream unavailable.'
    });
    return;
  }

  if (playgroundPort && currentStreamKey === streamKey && state.status !== 'disconnected') {
    return;
  }

  currentStreamKey = streamKey;
  setState({
    ...state,
    error: '',
    status: 'connecting'
  });

  if (!playgroundPort) {
    try {
      playgroundPort = chrome.runtime.connect({ name: PLAYGROUND_PORT_NAME });
    } catch (error) {
      setState({
        ...DEFAULT_STATE,
        error: error instanceof Error ? error.message : 'Playground unavailable.'
      });
      return;
    }

    playgroundPort.onMessage.addListener(handleBackgroundMessage);
    playgroundPort.onDisconnect.addListener(handlePortDisconnect);
  }

  postPlaygroundMessage({
    availableGames: getAvailableGames(),
    profile: getCurrentChatProfile(),
    streamKey,
    type: 'ytcq:playground:init'
  });
}

export function stopPlaygroundClient(): void {
  const port = playgroundPort;
  playgroundPort = null;
  currentStreamKey = '';
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

export function respondToPlaygroundInvite(inviteId: string, accept: boolean): void {
  postPlaygroundMessage({
    accept,
    inviteId,
    type: 'ytcq:playground:respond-invite'
  });
}

export function sendPlaygroundGameAction(gameId: string, action: string, payload?: Record<string, unknown>): void {
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
        error: message.error || '',
        status: message.status
      });
      return;
    case 'ytcq:playground:snapshot':
      setState({
        ...state,
        endedGame: null,
        error: '',
        games: message.snapshot.games,
        invites: message.snapshot.invites,
        status: 'connected',
        users: message.snapshot.users,
        userId: message.userId
      });
      return;
    case 'ytcq:playground:error':
      setState({
        ...state,
        error: message.message
      });
      return;
    case 'ytcq:playground:server-message':
      handleServerMessage(message.message);
      return;
  }
}

function handleServerMessage(message: ServerMessage): void {
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
      setState({
        ...state,
        endedGame: {
          gameId: message.gameId,
          reason: message.reason,
          userId: message.userId
        },
        games: state.games.filter((game) => game.gameId !== message.gameId)
      });
      return;
    case 'error':
      setState({
        ...state,
        error: message.message
      });
      return;
  }
}

function handlePortDisconnect(): void {
  playgroundPort = null;
  setState({
    ...state,
    status: 'disconnected'
  });
}

function setState(nextState: PlaygroundClientState): void {
  state = nextState;
  listeners.forEach((listener) => listener(state));
}

function getAvailableGames(): GameId[] {
  return available ? ['chess'] : [];
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
  return [
    ...games.filter((candidate) => candidate.gameId !== game.gameId),
    game
  ];
}

const CHAT_INPUT_RENDERER_SELECTOR = 'yt-live-chat-message-input-renderer';
const CHAT_PROFILE_NAME_SELECTORS = [
  '#author-name',
  '[id*="author"]:not(#author-photo)'
];
const CHAT_PROFILE_AVATAR_SELECTORS = [
  '#author-photo img',
  '#author-photo #img',
  'yt-img-shadow#author-photo img',
  'img#img',
  'img'
];
const CHAT_PROFILE_AVATAR_SELECTOR = CHAT_PROFILE_AVATAR_SELECTORS.join(',');

function getCurrentChatProfile(): ClientProfile {
  const inputRenderer = document.querySelector<HTMLElement>(CHAT_INPUT_RENDERER_SELECTOR);
  const avatar = getCurrentChatAvatar(inputRenderer);

  return {
    avatarUrl: avatar?.currentSrc || avatar?.src || undefined,
    displayName: getCurrentChatDisplayName(inputRenderer, avatar) || undefined
  };
}

function getCurrentChatAvatar(inputRenderer: HTMLElement | null): HTMLImageElement | null {
  return inputRenderer?.querySelector<HTMLImageElement>(CHAT_PROFILE_AVATAR_SELECTOR) ||
    document.querySelector<HTMLImageElement>(
      CHAT_PROFILE_AVATAR_SELECTORS
        .map((selector) => `${CHAT_INPUT_RENDERER_SELECTOR} ${selector}`)
        .join(',')
    );
}

function getCurrentChatDisplayName(
  inputRenderer: HTMLElement | null,
  avatar: HTMLImageElement | null
): string {
  const nameElementCandidates = inputRenderer
    ? CHAT_PROFILE_NAME_SELECTORS
      .map((selector) => inputRenderer.querySelector<HTMLElement>(selector)?.textContent)
    : [];

  const avatarContainer = avatar?.closest<HTMLElement>('#author-photo, yt-img-shadow, [aria-label], [title]');
  const attributeCandidates = [
    avatar?.alt,
    avatar?.title,
    avatar?.getAttribute('aria-label'),
    avatarContainer?.getAttribute('aria-label'),
    avatarContainer?.getAttribute('title')
  ];

  return [...nameElementCandidates, ...attributeCandidates]
    .map(normalizeProfileDisplayName)
    .find(Boolean) || '';
}

function normalizeProfileDisplayName(value: unknown): string {
  const text = cleanText(value);
  if (!text) return '';

  const handle = text.match(/@[\p{L}\p{N}._-]{2,}/u)?.[0];
  if (handle) return handle;

  if (/^(avatar|image|photo|profile picture|open channel|open profile)$/i.test(text)) return '';
  return text;
}
