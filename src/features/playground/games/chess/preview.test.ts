import { afterEach, describe, expect, it, vi } from 'vitest';

describe('chess preview', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('appends a canvas and exits when context creation fails', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('canvas blocked');
    });
    const { renderChessPreview } = await import('./preview');
    const container = document.createElement('div');

    expect(() => renderChessPreview(container)).not.toThrow();
    expect(container.querySelector('canvas')?.className).toBe('ytcq-games-preview-canvas');
  });

  it('draws the fallback board when images are unavailable', async () => {
    const context = createContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('Image', undefined);
    const { renderChessPreview } = await import('./preview');
    const container = document.createElement('div');

    renderChessPreview(container);

    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 92, 48);
    expect(context.fillRect).toHaveBeenCalledTimes(65);
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('keeps the fallback board when preview assets fail to load', async () => {
    const context = createContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('Image', createFakeImageConstructor([], false));
    chrome.runtime.getURL = vi.fn((path: string) => `chrome-extension://test/${path}`);
    const { renderChessPreview } = await import('./preview');
    const container = document.createElement('div');

    renderChessPreview(container);
    await flushPromises();

    expect(chrome.runtime.getURL).toHaveBeenCalledWith('games/chess/board.png');
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('draws board and piece assets when they load', async () => {
    const context = createContext();
    const images: FakeImage[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('Image', createFakeImageConstructor(images, true));
    chrome.runtime.getURL = vi.fn((path: string) => `chrome-extension://test/${path}`);
    const { renderChessPreview } = await import('./preview');
    const container = document.createElement('div');

    renderChessPreview(container);
    await flushPromises();

    expect(images).toHaveLength(3);
    expect(context.drawImage).toHaveBeenCalledWith(images[0], 42, 60, 92, 48, 0, 0, 92, 48);
    expect(context.drawImage).toHaveBeenCalledTimes(9);
  });

  it('exits when the canvas has no context', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { renderChessPreview } = await import('./preview');
    const container = document.createElement('div');

    renderChessPreview(container);

    expect(container.querySelector('canvas')).not.toBeNull();
  });
});

function createContext() {
  return {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    imageSmoothingEnabled: true
  };
}

class FakeImage {
  complete = false;
  decoding = '';
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
  await Promise.resolve();
  await Promise.resolve();
}
