import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../shared/options';
import { setOptions } from '../../shared/state';
import { playSoftChime } from '../../shared/sounds/soft-chime';
import { playAlertSound } from './sound';

vi.mock('../../shared/sounds/soft-chime', () => ({
  playSoftChime: vi.fn()
}));

let fakeNow = 10_000;

describe('inbox sound alert', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeNow += 10_000;
    vi.setSystemTime(fakeNow);
    setOptions({ ...DEFAULT_OPTIONS, sound: true });
    vi.mocked(playSoftChime).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    setOptions({ ...DEFAULT_OPTIONS });
  });

  it('plays the soft chime when inbox sound is enabled', () => {
    playAlertSound();

    expect(playSoftChime).toHaveBeenCalledTimes(1);
  });

  it('respects the alert cooldown so fast message bursts do not spam audio', () => {
    playAlertSound();
    vi.advanceTimersByTime(500);
    playAlertSound();
    vi.advanceTimersByTime(900);
    playAlertSound();

    expect(playSoftChime).toHaveBeenCalledTimes(2);
  });

  it('does not play when the inbox sound option is disabled', () => {
    setOptions({ ...DEFAULT_OPTIONS, sound: false });

    playAlertSound();

    expect(playSoftChime).not.toHaveBeenCalled();
  });
});
