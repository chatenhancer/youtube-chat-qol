import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('Bounty Hunting preview', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('loads and draws the Bounty Hunting logo when available', async () => {
    const context = createPreviewContext();
    const images: FakeImage[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('Image', createFakeImageConstructor(images, true));
    chrome.runtime.getURL = vi.fn((path: string) => `chrome-extension://test/${path}`);
    const { renderBountyHuntingPreview } = await import('./preview');
    const container = document.createElement('div');

    renderBountyHuntingPreview(container);
    await flushPromises();

    expect(chrome.runtime.getURL).toHaveBeenCalledWith('games/bounty-hunting/logo.webp');
    expect(context.drawImage).toHaveBeenCalledWith(images[0], 30, 0, 32, 48);
  });

  it('keeps a fallback preview when the logo cannot load', async () => {
    const context = createPreviewContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('Image', createFakeImageConstructor([], false));
    chrome.runtime.getURL = vi.fn((path: string) => `chrome-extension://test/${path}`);
    const { renderBountyHuntingPreview } = await import('./preview');
    const container = document.createElement('div');

    renderBountyHuntingPreview(container);
    await flushPromises();

    expect(context.fillText).toHaveBeenCalledWith('WILD CHAT', 46, 24);
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('exposes game assets to content scripts', () => {
    const manifest = JSON.parse(readFileSync(path.join(process.cwd(), 'manifest.json'), 'utf8'));
    const resources = manifest.web_accessible_resources.flatMap(
      (entry: { resources: string[] }) => entry.resources
    );

    expect(resources).toContain('games/*/*.json');
    expect(resources).toContain('games/*/*.webp');
  });
});

function createPreviewContext() {
  return {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    fillText: vi.fn(),
    font: '',
    imageSmoothingEnabled: false,
    setTransform: vi.fn(),
    strokeRect: vi.fn(),
    strokeStyle: '',
    textAlign: 'start',
    textBaseline: 'alphabetic'
  };
}

class FakeImage {
  complete = false;
  decoding = '';
  naturalHeight = 648;
  naturalWidth = 429;
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

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
