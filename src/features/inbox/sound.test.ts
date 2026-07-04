import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../shared/options';
import { setOptions } from '../../shared/state';
import { playAlertSound as playSharedAlertSound } from '../../shared/sounds/alert-sounds';
import { playAlertSound } from './sound';

vi.mock('../../shared/sounds/alert-sounds', () => ({
  playAlertSound: vi.fn()
}));

describe('message alert sound', () => {
  beforeEach(() => {
    setOptions({ ...DEFAULT_OPTIONS, sound: true });
    vi.mocked(playSharedAlertSound).mockClear();
  });

  afterEach(() => {
    setOptions({ ...DEFAULT_OPTIONS });
  });

  it('uses the shared message alert sound', () => {
    playAlertSound();

    expect(playSharedAlertSound).toHaveBeenCalledWith('message');
  });
});
