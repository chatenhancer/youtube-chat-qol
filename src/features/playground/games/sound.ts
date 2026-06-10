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

export function createGameSoundController({
  className,
  signal
}: {
  className?: string;
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

function playGameSound(path: string): void {
  try {
    const audio = new Audio(chrome.runtime.getURL(path));
    void audio.play().catch(() => undefined);
  } catch {
    // Audio playback failures should never affect the game UI.
  }
}
