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
  beep: (options?: GameSoundToneOptions) => void;
  button: HTMLButtonElement;
  isEnabled: () => boolean;
  play: (path: string) => void;
}

export interface GameSoundToneOptions {
  durationMs?: number;
  frequency?: number;
  type?: OscillatorType;
  volume?: number;
}

const gameSoundCache = new Map<string, HTMLAudioElement>();
let gameSoundAudioConstructor: typeof Audio | null = null;
let gameSoundAudioContext: AudioContext | null = null;

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
    beep: (options) => {
      if (enabled) playGameBeep(options);
    },
    button,
    isEnabled: () => enabled,
    play: (path) => {
      if (enabled) playGameSound(path);
    }
  };
}

function playGameBeep({
  durationMs = 90,
  frequency = 880,
  type = 'sine',
  volume = 0.04
}: GameSoundToneOptions = {}): void {
  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor) return;

  try {
    const audioContext = getGameSoundAudioContext(AudioContextConstructor);
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    const durationSeconds = Math.max(0.03, durationMs / 1000);
    const safeVolume = Math.min(0.2, Math.max(0.001, volume));

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(safeVolume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSeconds);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + durationSeconds + 0.012);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    void audioContext.resume?.().catch(() => undefined);
  } catch {
    // Game sounds should never affect game controls or rendering.
  }
}

function getGameSoundAudioContext(AudioContextConstructor: typeof AudioContext): AudioContext {
  if (!gameSoundAudioContext || gameSoundAudioContext.state === 'closed') {
    gameSoundAudioContext = new AudioContextConstructor();
  }
  return gameSoundAudioContext;
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

function getAudioContextConstructor(): typeof AudioContext | null {
  try {
    const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
    return audioWindow.AudioContext || audioWindow.webkitAudioContext || null;
  } catch {
    return null;
  }
}
