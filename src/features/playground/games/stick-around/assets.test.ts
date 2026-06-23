import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Stick Around assets', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads the normal and dark themed image assets', async () => {
    const createdImages: FakeImage[] = [];
    vi.stubGlobal('Image', createFakeImageConstructor(createdImages));
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({ frames: {} }),
      ok: true
    })));
    chrome.runtime.getURL = vi.fn((assetPath: string) => `chrome-extension://test/${assetPath}`);

    const { getStickAroundAssets } = await import('./assets');
    const first = await getStickAroundAssets();
    const second = await getStickAroundAssets();

    expect(first).toBe(second);
    expect(first.logo).toBeInstanceOf(FakeImage);
    expect(first.darkLogo).toBeInstanceOf(FakeImage);
    expect(first.spritesheet).toBeInstanceOf(FakeImage);
    expect(first.darkSpritesheet).toBeInstanceOf(FakeImage);
    expect(createdImages.map((image) => image.src)).toEqual([
      'chrome-extension://test/games/stick-around/logo.png',
      'chrome-extension://test/games/stick-around/logo-dark.png',
      'chrome-extension://test/games/stick-around/stick_all_animations_spritesheet.png',
      'chrome-extension://test/games/stick-around/stick_all_animations_spritesheet-dark.png'
    ]);
  });
});

class FakeImage {
  complete = false;
  decoding = '';
  naturalHeight = 1;
  naturalWidth = 1;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  #src = '';

  get src(): string {
    return this.#src;
  }

  set src(value: string) {
    this.#src = value;
    queueMicrotask(() => {
      this.complete = true;
      this.onload?.();
    });
  }
}

function createFakeImageConstructor(images: FakeImage[]): typeof Image {
  return class extends FakeImage {
    constructor() {
      super();
      images.push(this);
    }
  } as unknown as typeof Image;
}
