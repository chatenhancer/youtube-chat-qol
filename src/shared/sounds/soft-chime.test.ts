import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('soft chime sound generator', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'AudioContext');
  });

  it('does nothing when Web Audio is unavailable', async () => {
    const { playSoftChime } = await import('./soft-chime');

    expect(() => playSoftChime()).not.toThrow();
  });

  it('plays a short sine chime and disconnects after ending', async () => {
    const audio = createAudioContextMock();
    const AudioContextConstructor = vi.fn(function AudioContextMock() {
      return audio.context;
    });
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: AudioContextConstructor
    });
    const { playSoftChime } = await import('./soft-chime');

    playSoftChime();

    expect(audio.context.resume).toHaveBeenCalledOnce();
    expect(audio.oscillator.type).toBe('sine');
    expect(audio.oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(880, 1);
    expect(audio.oscillator.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(1320, 1.075);
    expect(audio.oscillator.start).toHaveBeenCalledWith(1);
    expect(audio.oscillator.stop).toHaveBeenCalledWith(1.24);

    audio.end();
    expect(audio.oscillator.disconnect).toHaveBeenCalledOnce();
    expect(audio.gain.disconnect).toHaveBeenCalledOnce();
  });
});

function createAudioContextMock(): {
  context: AudioContext;
  end: () => void;
  gain: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    gain: {
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
      setValueAtTime: ReturnType<typeof vi.fn>;
    };
  };
  oscillator: {
    addEventListener: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    frequency: {
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
      setValueAtTime: ReturnType<typeof vi.fn>;
    };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    type: OscillatorType;
  };
} {
  let endedListener: (() => void) | null = null;
  const gain = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: {
      exponentialRampToValueAtTime: vi.fn(),
      setValueAtTime: vi.fn()
    }
  };
  const oscillator = {
    addEventListener: vi.fn((_event: string, listener: () => void) => {
      endedListener = listener;
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    frequency: {
      exponentialRampToValueAtTime: vi.fn(),
      setValueAtTime: vi.fn()
    },
    start: vi.fn(),
    stop: vi.fn(),
    type: 'square' as OscillatorType
  };
  const context = {
    createGain: vi.fn(() => gain),
    createOscillator: vi.fn(() => oscillator),
    currentTime: 1,
    destination: {},
    resume: vi.fn()
  } as unknown as AudioContext;
  return {
    context,
    end: () => endedListener?.(),
    gain,
    oscillator
  };
}
