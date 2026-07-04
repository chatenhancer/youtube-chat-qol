import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../options';
import { setOptions } from '../state';
import { playGameInviteChime } from './game-invite-chime';
import { playSoftChime } from './soft-chime';
import { playAlertSound, playAlertSoundPreview } from './alert-sounds';

vi.mock('./game-invite-chime', () => ({
  playGameInviteChime: vi.fn()
}));

vi.mock('./soft-chime', () => ({
  playSoftChime: vi.fn()
}));

let fakeNow = 10_000;

describe('shared alert sounds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeNow += 10_000;
    vi.setSystemTime(fakeNow);
    setOptions({ ...DEFAULT_OPTIONS, sound: true });
    vi.mocked(playGameInviteChime).mockClear();
    vi.mocked(playSoftChime).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    setOptions({ ...DEFAULT_OPTIONS });
  });

  it('plays the message chime for message alerts', () => {
    playAlertSound('message');

    expect(playSoftChime).toHaveBeenCalledOnce();
    expect(playGameInviteChime).not.toHaveBeenCalled();
  });

  it('plays the two-tone chime for game invite alerts', () => {
    playAlertSound('gameInvite');

    expect(playGameInviteChime).toHaveBeenCalledOnce();
    expect(playSoftChime).not.toHaveBeenCalled();
  });

  it('respects cooldowns per alert kind', () => {
    playAlertSound('message');
    vi.advanceTimersByTime(500);
    playAlertSound('message');
    playAlertSound('gameInvite');
    vi.advanceTimersByTime(900);
    playAlertSound('message');

    expect(playSoftChime).toHaveBeenCalledTimes(2);
    expect(playGameInviteChime).toHaveBeenCalledOnce();
  });

  it('does not play when alert sounds are disabled', () => {
    setOptions({ ...DEFAULT_OPTIONS, sound: false });

    playAlertSound('message');
    playAlertSound('gameInvite');

    expect(playSoftChime).not.toHaveBeenCalled();
    expect(playGameInviteChime).not.toHaveBeenCalled();
  });

  it('plays the preview chime without checking the saved option', () => {
    setOptions({ ...DEFAULT_OPTIONS, sound: false });

    playAlertSoundPreview();

    expect(playSoftChime).toHaveBeenCalledOnce();
  });
});
