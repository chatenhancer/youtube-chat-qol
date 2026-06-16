import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGameSoundController,
  preloadGameSounds,
  PLAYGROUND_GAME_SOUNDS_STORAGE_KEY
} from './sound';

interface AudioMock {
  cloneNode: ReturnType<typeof vi.fn>;
  currentTime: number;
  ended: boolean;
  paused: boolean;
  play: ReturnType<typeof vi.fn>;
  preload: string;
  src: string;
}

const audioMocks: AudioMock[] = [];

describe('playground game sounds', () => {
  beforeEach(async () => {
    audioMocks.length = 0;
    await chrome.storage.local.clear();
    vi.mocked(chrome.storage.local.set).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns no-op playable audio when Audio is unavailable or construction fails', () => {
    vi.stubGlobal('Audio', undefined);
    expect(() => preloadGameSounds(['games/chess/move.mp3'])).not.toThrow();

    vi.stubGlobal('Audio', function Audio() {
      throw new Error('audio disabled');
    } as unknown as typeof Audio);
    const controller = createGameSoundController({
      signal: new AbortController().signal
    });

    expect(() => controller.play('games/chess/move.mp3')).not.toThrow();
  });

  it('preloads once per audio constructor and uses clones while cached audio is playing', () => {
    installAudioMock();
    preloadGameSounds(['games/chess/move.mp3']);
    preloadGameSounds(['games/chess/move.mp3']);
    const cachedAudio = getAudioMock('games/chess/move.mp3');
    cachedAudio.paused = false;
    cachedAudio.ended = false;
    const clone = createAudioMock('chrome-extension://test/games/chess/move.mp3');
    cachedAudio.cloneNode.mockReturnValue(clone);
    const controller = createGameSoundController({
      signal: new AbortController().signal
    });

    controller.play('games/chess/move.mp3');

    expect(audioMocks.filter((audio) => audio.src.endsWith('/games/chess/move.mp3'))).toHaveLength(2);
    expect(cachedAudio.cloneNode).toHaveBeenCalledWith(true);
    expect(clone.preload).toBe('auto');
    expect(clone.play).toHaveBeenCalledOnce();
  });

  it('ignores seek and playback failures', () => {
    installAudioMock();
    const audio = createAudioMock('chrome-extension://test/games/chess/capture.mp3');
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      set: () => {
        throw new Error('cannot seek');
      }
    });
    audio.play.mockImplementation(() => {
      throw new Error('blocked');
    });
    installAudioMock(() => audio);
    const controller = createGameSoundController({
      signal: new AbortController().signal
    });

    expect(() => controller.play('games/chess/capture.mp3')).not.toThrow();
  });

  it('does not overwrite a freshly toggled preference with the stored value', async () => {
    await chrome.storage.local.set({ [PLAYGROUND_GAME_SOUNDS_STORAGE_KEY]: false });
    installAudioMock();
    const controller = createGameSoundController({
      signal: new AbortController().signal
    });

    controller.button.click();
    await Promise.resolve();

    expect(controller.isEnabled()).toBe(false);
    expect(controller.button.getAttribute('aria-pressed')).toBe('false');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [PLAYGROUND_GAME_SOUNDS_STORAGE_KEY]: false
    });
  });
});

function installAudioMock(factory = createAudioMock): void {
  vi.stubGlobal('Audio', function Audio(this: AudioMock, src: string) {
    return factory(src);
  } as unknown as typeof Audio);
}

function createAudioMock(src: string): AudioMock {
  const audio: AudioMock = {
    cloneNode: vi.fn(() => createAudioMock(src)),
    currentTime: 0,
    ended: false,
    paused: true,
    play: vi.fn(() => Promise.resolve()),
    preload: '',
    src
  };
  audioMocks.push(audio);
  return audio;
}

function getAudioMock(path: string): AudioMock {
  const src = `chrome-extension://test/${path}`;
  const audio = audioMocks.find((mock) => mock.src === src);
  if (!audio) throw new Error(`Missing audio mock for ${src}.`);
  return audio;
}
