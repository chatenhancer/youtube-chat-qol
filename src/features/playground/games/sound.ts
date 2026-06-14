/**
 * Shared Playground game sound preference.
 *
 * The mute/unmute setting is intentionally game-wide so a user who disables
 * game sounds in one game keeps that preference in later games.
 */
import { createVolumeOffIcon, createVolumeUpIcon } from '../../../shared/icons';
import { t } from '../../../shared/i18n';
import { ytcqCreateElement } from '../../../shared/managed-dom';

export const PLAYGROUND_GAME_SOUNDS_STORAGE_KEY = 'ytcqPlaygroundGameSoundsEnabled:v1';

export interface GameSoundController {
  button: HTMLButtonElement;
  isEnabled: () => boolean;
  play: (path: string) => void;
}

const gameSoundCache = new Map<string, HTMLAudioElement>();
let gameSoundAudioConstructor: typeof Audio | null = null;

export function createGameSoundController({
  className,
  preloadPaths = [],
  signal
}: {
  className?: string;
  preloadPaths?: readonly string[];
  signal: AbortSignal;
}): GameSoundController {
  let enabled = true;
  let preferenceTouched = false;

  const button = ytcqCreateElement('button');
  button.type = 'button';
  button.className = ['ytcq-game-sound-toggle', className].filter(Boolean).join(' ');
  setGameSoundToggleButtonState(button, enabled);

  button.addEventListener('click', () => {
    enabled = !enabled;
    preferenceTouched = true;
    setGameSoundToggleButtonState(button, enabled);
    chrome.storage.local.set({ [PLAYGROUND_GAME_SOUNDS_STORAGE_KEY]: enabled });
  }, { signal });

  void getStoredGameSoundsEnabled().then((storedEnabled) => {
    if (preferenceTouched) return;
    enabled = storedEnabled;
    setGameSoundToggleButtonState(button, enabled);
  });
  preloadGameSounds(preloadPaths);

  return {
    button,
    isEnabled: () => enabled,
    play: (path) => {
      if (enabled) playGameSound(path);
    }
  };
}

function setGameSoundToggleButtonState(button: HTMLButtonElement, enabled: boolean): void {
  button.setAttribute('aria-pressed', String(enabled));
  button.setAttribute('aria-label', t(enabled ? 'gamesMuteSounds' : 'gamesUnmuteSounds'));
  button.title = t(enabled ? 'gamesMuteSounds' : 'gamesUnmuteSounds');
  button.replaceChildren(enabled ? createVolumeUpIcon() : createVolumeOffIcon());
}

function getStoredGameSoundsEnabled(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [PLAYGROUND_GAME_SOUNDS_STORAGE_KEY]: true }, (stored) => {
      resolve(stored[PLAYGROUND_GAME_SOUNDS_STORAGE_KEY] !== false);
    });
  });
}

export function preloadGameSounds(paths: readonly string[]): void {
  paths.forEach((path) => {
    preloadGameSound(path);
  });
}

function playGameSound(path: string): void {
  const audio = getPlayableGameSound(path);
  if (!audio) return;

  try {
    audio.currentTime = 0;
  } catch {
    // Some browsers reject seeking before enough metadata is available.
  }

  try {
    void audio.play().catch(() => undefined);
  } catch {
    // Audio playback failures should never affect the game UI.
  }
}

function getPlayableGameSound(path: string): HTMLAudioElement | null {
  const cachedAudio = preloadGameSound(path);
  if (!cachedAudio) return null;

  if (!isAudioPlaying(cachedAudio)) return cachedAudio;

  try {
    const audio = cachedAudio.cloneNode(true) as HTMLAudioElement;
    audio.preload = 'auto';
    return audio;
  } catch {
    return cachedAudio;
  }
}

function preloadGameSound(path: string): HTMLAudioElement | null {
  const AudioConstructor = getAudioConstructor();
  if (!AudioConstructor) return null;

  if (gameSoundAudioConstructor !== AudioConstructor) {
    gameSoundCache.clear();
    gameSoundAudioConstructor = AudioConstructor;
  }

  const cachedAudio = gameSoundCache.get(path);
  if (cachedAudio) return cachedAudio;

  try {
    const audio = new AudioConstructor(chrome.runtime.getURL(path));
    audio.preload = 'auto';
    gameSoundCache.set(path, audio);
    return audio;
  } catch {
    return null;
  }
}

function isAudioPlaying(audio: HTMLAudioElement): boolean {
  return audio.paused === false && audio.ended !== true;
}

function getAudioConstructor(): typeof Audio | null {
  try {
    return Audio;
  } catch {
    return null;
  }
}
