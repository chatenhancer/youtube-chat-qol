import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleFeatureVisibilityChanged } from '../content/dispatcher';
import {
  cleanupStaleEnhancedEffect,
  hideEnhancedEffect,
  showEnhancedEffect
} from './enhanced-effect';

describe('enhanced startup effect', () => {
  let canvasContext: CanvasRenderingContext2D;
  let header: HTMLElement;
  let readyState: Document['readyState'];
  let visibilityState: Document['visibilityState'];

  beforeEach(() => {
    document.body.replaceChildren();
    vi.useFakeTimers();
    readyState = 'complete';
    visibilityState = 'visible';
    vi.spyOn(document, 'readyState', 'get').mockImplementation(() => readyState);
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
    header = document.createElement('yt-live-chat-header-renderer');
    document.body.append(header);
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(rect({ width: 320, height: 48 }));
    canvasContext = createCanvasContextMock();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(rect({
      height: 120,
      width: 320
    }));
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false
    } as MediaQueryList);
  });

  afterEach(() => {
    cleanupStaleEnhancedEffect();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('adds a managed effect surface and removes the active class after activation', async () => {
    showEnhancedEffect({ animate: false });
    const effect = document.querySelector<HTMLElement>('.ytcq-enhanced-effect')!;

    expect(effect).not.toBeNull();
    expect(effect.dataset.ytcqManaged).toBe('true');
    expect(effect.classList.contains('ytcq-enhanced-effect-active')).toBe(false);

    await vi.advanceTimersByTimeAsync(1_350);
    expect(effect.classList.contains('ytcq-enhanced-effect-active')).toBe(false);
  });

  it('removes effect surfaces on hide and stale cleanup', () => {
    showEnhancedEffect({ animate: false });
    expect(document.querySelector('.ytcq-enhanced-effect')).not.toBeNull();

    hideEnhancedEffect();
    expect(document.querySelector('.ytcq-enhanced-effect')).toBeNull();

    document.body.append(Object.assign(document.createElement('div'), {
      className: 'ytcq-enhanced-effect'
    }));
    cleanupStaleEnhancedEffect();
    expect(document.querySelector('.ytcq-enhanced-effect')).toBeNull();
  });

  it('draws and clears the animated perimeter when startup animation is enabled', async () => {
    showEnhancedEffect({ animate: true });
    const canvas = document.querySelector<HTMLCanvasElement>('.ytcq-enhanced-effect canvas')!;
    const effect = canvas.parentElement!;

    await vi.advanceTimersByTimeAsync(16);

    expect(canvasContext.createConicGradient).toHaveBeenCalled();
    expect(canvasContext.stroke).toHaveBeenCalled();
    expect(canvas.width).toBe(224);
    expect(canvas.height).toBe(84);

    await vi.advanceTimersByTimeAsync(1_344);
    expect(effect.classList.contains('ytcq-enhanced-effect-active')).toBe(true);

    await vi.advanceTimersByTimeAsync(16);
    expect(effect.classList.contains('ytcq-enhanced-effect-active')).toBe(false);
    expect(canvasContext.clearRect).toHaveBeenCalledWith(0, 0, canvas.width, canvas.height);
  });

  it('skips animation frames when the user prefers reduced motion', async () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true
    } as MediaQueryList);

    showEnhancedEffect({ animate: true });
    await vi.advanceTimersByTimeAsync(16);

    expect(canvasContext.createConicGradient).not.toHaveBeenCalled();
    expect(canvasContext.clearRect).toHaveBeenCalled();
  });

  it('keeps the full animation when the first browser frame arrives late', async () => {
    let firstFrame: FrameRequestCallback | undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementationOnce(callback => {
      firstFrame = callback;
      return 1;
    });
    showEnhancedEffect({ animate: true });

    await vi.advanceTimersByTimeAsync(2_000);
    firstFrame!(performance.now());
    await vi.advanceTimersByTimeAsync(224);

    expect(document.querySelector('.ytcq-enhanced-effect-active')).not.toBeNull();
    expect(canvasContext.globalAlpha).toBe(1);
  });

  it('waits for the document to load and the chat header to become visible', async () => {
    readyState = 'loading';
    vi.mocked(header.getBoundingClientRect).mockReturnValue(rect({ width: 0, height: 0 }));
    showEnhancedEffect({ animate: true });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(canvasContext.stroke).not.toHaveBeenCalled();
    expect(document.querySelector('.ytcq-enhanced-effect-active')).toBeNull();

    readyState = 'complete';
    await vi.advanceTimersByTimeAsync(32);
    expect(canvasContext.stroke).not.toHaveBeenCalled();

    vi.mocked(header.getBoundingClientRect).mockReturnValue(rect({ width: 320, height: 48 }));
    await vi.advanceTimersByTimeAsync(240);
    expect(document.querySelector('.ytcq-enhanced-effect-active')).not.toBeNull();
    expect(canvasContext.globalAlpha).toBe(1);
  });

  it('waits for a background chat to become visible before animating', async () => {
    visibilityState = 'hidden';
    showEnhancedEffect({ animate: true });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(canvasContext.stroke).not.toHaveBeenCalled();
    expect(document.querySelector('.ytcq-enhanced-effect-active')).toBeNull();

    visibilityState = 'visible';
    await vi.advanceTimersByTimeAsync(240);
    expect(document.querySelector('.ytcq-enhanced-effect-active')).not.toBeNull();
    expect(canvasContext.globalAlpha).toBe(1);
  });

  it('restarts an unfinished animation after returning to the tab, but never replays a completed one', async () => {
    showEnhancedEffect({ animate: true });
    await vi.advanceTimersByTimeAsync(240);
    visibilityState = 'hidden';
    handleFeatureVisibilityChanged(visibilityState);
    expect(document.querySelector('.ytcq-enhanced-effect-active')).toBeNull();

    await vi.advanceTimersByTimeAsync(2_000);
    visibilityState = 'visible';
    handleFeatureVisibilityChanged(visibilityState);
    await vi.advanceTimersByTimeAsync(240);
    expect(document.querySelector('.ytcq-enhanced-effect-active')).not.toBeNull();
    expect(canvasContext.globalAlpha).toBe(1);

    await vi.advanceTimersByTimeAsync(1_200);
    visibilityState = 'hidden';
    handleFeatureVisibilityChanged(visibilityState);
    visibilityState = 'visible';
    handleFeatureVisibilityChanged(visibilityState);
    await vi.advanceTimersByTimeAsync(240);
    expect(document.querySelector('.ytcq-enhanced-effect-active')).toBeNull();
  });

  it('reuses an existing effect surface', async () => {
    showEnhancedEffect({ animate: false });
    const firstEffect = document.querySelector('.ytcq-enhanced-effect');

    showEnhancedEffect({ animate: false });

    expect(document.querySelectorAll('.ytcq-enhanced-effect')).toHaveLength(1);
    expect(document.querySelector('.ytcq-enhanced-effect')).toBe(firstEffect);
    await vi.advanceTimersByTimeAsync(1_349);
    expect(firstEffect?.isConnected).toBe(true);
  });

  it('falls back to viewport dimensions when the canvas has no measured size', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(rect({
      height: 0,
      width: 0
    }));
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 200
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 100
    });

    showEnhancedEffect({ animate: true });
    const canvas = document.querySelector<HTMLCanvasElement>('.ytcq-enhanced-effect canvas')!;
    await vi.advanceTimersByTimeAsync(16);

    expect(canvas.width).toBe(140);
    expect(canvas.height).toBe(70);
  });

  it('does not draw if the effect disappears before the next animation frame', async () => {
    showEnhancedEffect({ animate: true });
    const canvas = document.querySelector('.ytcq-enhanced-effect canvas');
    canvas?.parentElement?.remove();

    await vi.advanceTimersByTimeAsync(16);

    expect(canvasContext.createConicGradient).not.toHaveBeenCalled();
  });
});

function createCanvasContextMock(): CanvasRenderingContext2D {
  const gradient = {
    addColorStop: vi.fn()
  };
  return {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    createConicGradient: vi.fn(() => gradient),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn()
  } as unknown as CanvasRenderingContext2D;
}

function rect({
  width,
  height
}: {
  width: number;
  height: number;
}): DOMRect {
  return {
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({})
  } as DOMRect;
}
