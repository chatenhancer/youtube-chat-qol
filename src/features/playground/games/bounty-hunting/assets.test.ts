import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Bounty Hunting assets', () => {
  let originalDocumentFonts: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalDocumentFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalDocumentFonts) {
      Object.defineProperty(document, 'fonts', originalDocumentFonts);
    } else {
      Reflect.deleteProperty(document, 'fonts');
    }
  });

  it('registers Barnum with its variable weight range', async () => {
    const createdFontFaces: FakeFontFace[] = [];
    const addedFonts: unknown[] = [];
    vi.stubGlobal('Image', createFakeImageConstructor());
    vi.stubGlobal('FontFace', createFakeFontFaceConstructor(createdFontFaces));
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        add: vi.fn((fontFace: unknown) => addedFonts.push(fontFace))
      }
    });
    chrome.runtime.getURL = vi.fn((path: string) => `chrome-extension://test/${path}`);

    const { getBountyHuntingAssets } = await import('./assets');
    const assets = await getBountyHuntingAssets();

    expect(assets.fontsReady).toBe(true);
    expect(createdFontFaces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        descriptors: { weight: '370 1000' },
        family: 'YtcqBountyHuntingBarnum',
        source: 'url(chrome-extension://test/games/bounty-hunting/barnum-variable.ttf)'
      })
    ]));
    expect(addedFonts).toHaveLength(3);
  });
});

class FakeImage {
  complete = false;
  decoding = '';
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

class FakeFontFace {
  descriptors: FontFaceDescriptors | undefined;
  family: string;
  source: string;

  constructor(family: string, source: string, descriptors?: FontFaceDescriptors) {
    this.family = family;
    this.source = source;
    this.descriptors = descriptors;
  }

  load(): Promise<this> {
    return Promise.resolve(this);
  }
}

function createFakeImageConstructor(): typeof Image {
  return FakeImage as unknown as typeof Image;
}

function createFakeFontFaceConstructor(fontFaces: FakeFontFace[]): typeof FontFace {
  return class extends FakeFontFace {
    constructor(family: string, source: string, descriptors?: FontFaceDescriptors) {
      super(family, source, descriptors);
      fontFaces.push(this);
    }
  } as unknown as typeof FontFace;
}
