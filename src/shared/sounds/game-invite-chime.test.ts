import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('game invite chime sound generator', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'AudioContext');
  });

  it('does nothing when Web Audio is unavailable', async () => {
    const { playGameInviteChime } = await import('./game-invite-chime');

    expect(() => playGameInviteChime()).not.toThrow();
  });

  it('plays a short ascending two-tone chime and disconnects after ending', async () => {
    const audio = createAudioContextMock();
    const AudioContextConstructor = vi.fn(function AudioContextMock() {
      return audio.context;
    });
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: AudioContextConstructor
    });
    const { playGameInviteChime } = await import('./game-invite-chime');

    playGameInviteChime();

    expect(audio.context.resume).toHaveBeenCalledOnce();
    expect(audio.oscillators).toHaveLength(2);
    expect(audio.oscillators[0]?.type).toBe('triangle');
    expect(audio.oscillators[1]?.type).toBe('triangle');
    expect(audio.oscillators[0]?.frequency.setValueAtTime).toHaveBeenCalledWith(660, 1);
    expect(audio.oscillators[1]?.frequency.setValueAtTime).toHaveBeenCalledWith(990, 1.105);
    expect(audio.oscillators[0]?.start).toHaveBeenCalledWith(1);
    expect(audio.oscillators[0]?.stop).toHaveBeenCalledWith(1.122);
    expect(audio.oscillators[1]?.start).toHaveBeenCalledWith(1.105);
    expect(audio.oscillators[1]?.stop).toHaveBeenCalledWith(1.267);

    audio.endAll();
    expect(audio.oscillators.every((oscillator) => oscillator.disconnect.mock.calls.length === 1)).toBe(true);
    expect(audio.gains.every((gain) => gain.disconnect.mock.calls.length === 1)).toBe(true);
  });
});

function createAudioContextMock(): {
  context: AudioContext;
  endAll: () => void;
  gains: Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    gain: {
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
      setValueAtTime: ReturnType<typeof vi.fn>;
    };
  }>;
  oscillators: Array<{
    addEventListener: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    frequency: {
      setValueAtTime: ReturnType<typeof vi.fn>;
    };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    type: OscillatorType;
  }>;
} {
  const endedListeners: Array<() => void> = [];
  const gains: ReturnType<typeof createGainMock>[] = [];
  const oscillators: ReturnType<typeof createOscillatorMock>[] = [];
  const context = {
    createGain: vi.fn(() => {
      const gain = createGainMock();
      gains.push(gain);
      return gain;
    }),
    createOscillator: vi.fn(() => {
      const oscillator = createOscillatorMock((listener) => endedListeners.push(listener));
      oscillators.push(oscillator);
      return oscillator;
    }),
    currentTime: 1,
    destination: {},
    resume: vi.fn()
  } as unknown as AudioContext;
  return {
    context,
    endAll: () => endedListeners.forEach((listener) => listener()),
    gains,
    oscillators
  };
}

function createGainMock(): {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  gain: {
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    setValueAtTime: ReturnType<typeof vi.fn>;
  };
} {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: {
      exponentialRampToValueAtTime: vi.fn(),
      setValueAtTime: vi.fn()
    }
  };
}

function createOscillatorMock(onEndedListener: (listener: () => void) => void): {
  addEventListener: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  frequency: {
    setValueAtTime: ReturnType<typeof vi.fn>;
  };
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  type: OscillatorType;
} {
  return {
    addEventListener: vi.fn((_event: string, listener: () => void) => onEndedListener(listener)),
    connect: vi.fn(),
    disconnect: vi.fn(),
    frequency: {
      setValueAtTime: vi.fn()
    },
    start: vi.fn(),
    stop: vi.fn(),
    type: 'sine' as OscillatorType
  };
}
