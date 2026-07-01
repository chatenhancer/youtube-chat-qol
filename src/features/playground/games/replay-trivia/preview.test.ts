import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Replay Trivia preview', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('appends a canvas and exits when a 2D context is unavailable', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { renderReplayTriviaPreview } = await import('./preview');
    const container = document.createElement('div');

    renderReplayTriviaPreview(container);

    const canvas = container.querySelector<HTMLCanvasElement>('canvas');
    expect(canvas?.className).toBe('ytcq-games-preview-canvas');
    expect(canvas?.style.width).toBe('');
    expect(canvas?.style.height).toBe('');
  });

  it('handles context creation errors', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('canvas blocked');
    });
    const { renderReplayTriviaPreview } = await import('./preview');
    const container = document.createElement('div');

    expect(() => renderReplayTriviaPreview(container)).not.toThrow();
  });

  it('draws a basic preview when detailed canvas APIs are missing', async () => {
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: ''
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('Image', undefined);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 0 });
    const { renderReplayTriviaPreview } = await import('./preview');
    const container = document.createElement('div');

    renderReplayTriviaPreview(container);

    expect(container.querySelector<HTMLCanvasElement>('canvas')?.width).toBe(184);
    expect(context.fillRect).toHaveBeenCalledWith(24, 24, 58, 18);
  });

  it('draws the fallback preview when images are unavailable', async () => {
    const context = createDetailedContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('Image', undefined);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
    const { renderReplayTriviaPreview } = await import('./preview');
    const container = document.createElement('div');

    renderReplayTriviaPreview(container);

    expect(container.querySelector<HTMLCanvasElement>('canvas')?.width).toBe(368);
    expect(context.fillText).toHaveBeenCalledWith('HELP', 18, 19);
    expect(context.fillText).toHaveBeenCalledWith('Trivia', 40, 37);
  });

  it('loads and draws the Replay Trivia logo when available', async () => {
    const context = createDetailedContext();
    const images: FakeImage[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('Image', createFakeImageConstructor(images, true));
    chrome.runtime.getURL = vi.fn((path: string) => `chrome-extension://test/${path}`);
    const { renderReplayTriviaPreview } = await import('./preview');
    const container = document.createElement('div');

    renderReplayTriviaPreview(container);
    await flushPromises();

    expect(chrome.runtime.getURL).toHaveBeenCalledWith('games/replay-trivia/logo.png');
    expect(context.drawImage).toHaveBeenCalledWith(images[0], 9, 0, 74, 48);
  });

  it('keeps the fallback preview when logo loading fails', async () => {
    const context = createDetailedContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('Image', createFakeImageConstructor([], false));
    chrome.runtime.getURL = vi.fn((path: string) => `chrome-extension://test/${path}`);
    const { renderReplayTriviaPreview } = await import('./preview');
    const container = document.createElement('div');

    renderReplayTriviaPreview(container);
    await flushPromises();

    expect(context.fillText).toHaveBeenCalledWith('Trivia', 40, 37);
    expect(context.drawImage).not.toHaveBeenCalled();
  });
});

function createDetailedContext() {
  return {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    fillText: vi.fn(),
    font: '',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    setTransform: vi.fn()
  };
}

class FakeImage {
  complete = false;
  decoding = '';
  naturalHeight = 268;
  naturalWidth = 412;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  #shouldLoad: boolean;

  constructor(shouldLoad: boolean) {
    this.#shouldLoad = shouldLoad;
  }

  set src(_value: string) {
    queueMicrotask(() => {
      if (this.#shouldLoad) {
        this.complete = true;
        this.onload?.();
      } else {
        this.onerror?.();
      }
    });
  }
}

function createFakeImageConstructor(images: FakeImage[], shouldLoad: boolean): typeof Image {
  return class extends FakeImage {
    constructor() {
      super(shouldLoad);
      images.push(this);
    }
  } as unknown as typeof Image;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
