import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Replay Trivia assets', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads and memoizes every Replay Trivia image asset', async () => {
    const createdImages: FakeImage[] = [];
    vi.stubGlobal('Image', createFakeImageConstructor(createdImages, true));
    chrome.runtime.getURL = vi.fn((path: string) => `chrome-extension://test/${path}`);
    const { getReplayTriviaAssets } = await import('./assets');

    const first = await getReplayTriviaAssets();
    const second = await getReplayTriviaAssets();

    expect(first).toBe(second);
    expect(Object.values(first).every((image) => image instanceof FakeImage)).toBe(true);
    expect(createdImages).toHaveLength(11);
    expect(chrome.runtime.getURL).toHaveBeenCalledWith('games/replay-trivia/logo.png');
    expect(createdImages.map((image) => image.decoding)).toEqual(Array.from({ length: 11 }, () => 'async'));
  });

  it('returns null for images that fail or cannot be created', async () => {
    const createdImages: FakeImage[] = [];
    vi.stubGlobal('Image', createFakeImageConstructor(createdImages, false));
    chrome.runtime.getURL = vi.fn((path: string) => `chrome-extension://test/${path}`);
    const { getReplayTriviaAssets } = await import('./assets');

    const assets = await getReplayTriviaAssets();

    expect(assets.bestie).toBeNull();
    expect(assets.wrong).toBeNull();
    expect(createdImages).toHaveLength(11);
  });

  it('uses the empty asset set when the Image constructor is unavailable', async () => {
    vi.stubGlobal('Image', undefined);
    chrome.runtime.getURL = vi.fn((path: string) => `chrome-extension://test/${path}`);
    const { getReplayTriviaAssets } = await import('./assets');

    const assets = await getReplayTriviaAssets();

    expect(Object.values(assets)).toEqual(Array.from({ length: 11 }, () => null));
  });
});

class FakeImage {
  complete = false;
  decoding = '';
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  #shouldLoad: boolean;
  #src = '';

  constructor(shouldLoad: boolean) {
    this.#shouldLoad = shouldLoad;
  }

  get src(): string {
    return this.#src;
  }

  set src(value: string) {
    this.#src = value;
    queueMicrotask(() => {
      if (this.#shouldLoad) {
        this.complete = true;
        this.onload?.();
        return;
      }

      this.onerror?.();
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
