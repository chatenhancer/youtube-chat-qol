/**
 * Shared Playground game sound preference.
 *
 * The mute/unmute setting is intentionally game-wide so a user who disables
 * game sounds in one game keeps that preference in later games.
 */
import { createVolumeOffIcon, createVolumeUpIcon } from '../../../shared/icons';
import { t } from '../../../shared/i18n';
import { jsx, el } from '../../../shared/jsx-dom';

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
const gameSoundBufferCache = new Map<string, GameSoundBufferPreload>();
let gameSoundAudioConstructor: typeof Audio | null = null;
let gameSoundAudioContext: AudioContext | null = null;
let gameSoundAudioContextConstructor: typeof AudioContext | null = null;
let gameSoundBufferAudioContextConstructor: typeof AudioContext | null = null;

interface GameSoundBufferPreload {
  buffer: AudioBuffer | null;
  promise: Promise<AudioBuffer | null>;
}

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

  const button = el<HTMLButtonElement>(
    <button type="button" class={['ytcq-game-sound-toggle', className].filter(Boolean).join(' ')} />
  );
  setGameSoundToggleButtonState(button, enabled);

  button.addEventListener(
    'click',
    () => {
      enabled = !enabled;
      preferenceTouched = true;
      setGameSoundToggleButtonState(button, enabled);
      chrome.storage.local.set({ [PLAYGROUND_GAME_SOUNDS_STORAGE_KEY]: enabled });
    },
    { signal }
  );

  void getStoredGameSoundsEnabled().then((storedEnabled) => {
    if (preferenceTouched) return;
    enabled = storedEnabled;
    setGameSoundToggleButtonState(button, enabled);
  });
  preloadGameSounds(preloadPaths);

  return {
    beep: (options) => {
      if (enabled && !signal.aborted) playGameBeep(signal, options);
    },
    button,
    isEnabled: () => enabled,
    play: (path) => {
      if (enabled && !signal.aborted) playGameSound(signal, path);
    }
  };
}

function playGameBeep(
  signal: AbortSignal,
  { durationMs = 90, frequency = 880, type = 'sine', volume = 0.04 }: GameSoundToneOptions = {}
): void {
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
    const stop = bindGameSoundToPanel(
      signal,
      oscillator,
      () => oscillator.stop(),
      () => {
        oscillator.disconnect();
        gain.disconnect();
      }
    );
    try {
      oscillator.start(now);
      oscillator.stop(now + durationSeconds + 0.012);
    } catch {
      stop();
      return;
    }
    void audioContext.resume?.().catch(() => undefined);
  } catch {
    // Game sounds should never affect game controls or rendering.
  }
}

function getGameSoundAudioContext(AudioContextConstructor: typeof AudioContext): AudioContext {
  if (
    !gameSoundAudioContext ||
    gameSoundAudioContext.state === 'closed' ||
    gameSoundAudioContextConstructor !== AudioContextConstructor
  ) {
    gameSoundAudioContext = new AudioContextConstructor();
    gameSoundAudioContextConstructor = AudioContextConstructor;
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
    preloadHtmlGameSound(path);
    preloadBufferedGameSound(path);
  });
}

function playGameSound(signal: AbortSignal, path: string): void {
  if (playBufferedGameSound(signal, path)) return;

  const audio = getPlayableHtmlGameSound(path);
  if (!audio) return;

  try {
    audio.currentTime = 0;
  } catch {
    // Some browsers reject seeking before enough metadata is available.
  }

  const stop = bindGameSoundToPanel(signal, audio, () => {
    audio.pause();
    audio.currentTime = 0;
  });
  try {
    void audio.play().catch(stop);
  } catch {
    stop();
  }
}

function playBufferedGameSound(signal: AbortSignal, path: string): boolean {
  const preload = preloadBufferedGameSound(path);
  if (!preload?.buffer) return false;

  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor) return false;

  try {
    const audioContext = getGameSoundAudioContext(AudioContextConstructor);
    const source = audioContext.createBufferSource();
    source.buffer = preload.buffer;
    source.connect(audioContext.destination);
    const stop = bindGameSoundToPanel(
      signal,
      source,
      () => source.stop(0),
      () => {
        source.disconnect();
      }
    );
    try {
      source.start(0);
    } catch {
      stop();
      return false;
    }
    void audioContext.resume?.().catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

function bindGameSoundToPanel(
  signal: AbortSignal,
  sound: HTMLAudioElement | AudioScheduledSourceNode,
  stopSound: () => void,
  disconnect: () => void = () => undefined
): () => void {
  let active = true;
  const cleanUp = (): void => {
    if (!active) return;
    active = false;
    signal.removeEventListener('abort', stop);
    sound.onended = null;
    disconnect();
  };
  const stop = (): void => {
    try {
      stopSound();
    } catch {
      // The sound may already have stopped naturally.
    }
    cleanUp();
  };
  sound.onended = cleanUp;
  signal.addEventListener('abort', stop, { once: true });
  return stop;
}

function getPlayableHtmlGameSound(path: string): HTMLAudioElement | null {
  const cachedAudio = preloadHtmlGameSound(path);
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

function preloadHtmlGameSound(path: string): HTMLAudioElement | null {
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

function preloadBufferedGameSound(path: string): GameSoundBufferPreload | null {
  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor || typeof fetch !== 'function') return null;

  if (gameSoundBufferAudioContextConstructor !== AudioContextConstructor) {
    gameSoundBufferCache.clear();
    gameSoundBufferAudioContextConstructor = AudioContextConstructor;
  }

  const cachedPreload = gameSoundBufferCache.get(path);
  if (cachedPreload) return cachedPreload;

  const preload: GameSoundBufferPreload = {
    buffer: null,
    promise: Promise.resolve(null)
  };
  preload.promise = fetch(chrome.runtime.getURL(path))
    .then((response) => {
      if (!response.ok) throw new Error(`Failed to preload ${path}`);
      return response.arrayBuffer();
    })
    .then((bytes) => getGameSoundAudioContext(AudioContextConstructor).decodeAudioData(bytes))
    .then((buffer) => {
      preload.buffer = buffer;
      return buffer;
    })
    .catch(() => null);
  gameSoundBufferCache.set(path, preload);
  return preload;
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
    const audioGlobal = globalThis as typeof globalThis & {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    return (
      audioWindow.AudioContext ||
      audioWindow.webkitAudioContext ||
      audioGlobal.AudioContext ||
      audioGlobal.webkitAudioContext ||
      null
    );
  } catch {
    return null;
  }
}
