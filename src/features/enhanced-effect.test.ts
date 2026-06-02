import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupStaleEnhancedEffect,
  hideEnhancedEffect,
  showEnhancedEffect
} from './enhanced-effect';

describe('enhanced startup effect', () => {
  let canvasContext: CanvasRenderingContext2D;

  beforeEach(() => {
    document.body.replaceChildren();
    vi.useFakeTimers();
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

    await vi.advanceTimersByTimeAsync(1_000);
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

    await vi.advanceTimersByTimeAsync(16);

    expect(canvasContext.createConicGradient).toHaveBeenCalled();
    expect(canvasContext.stroke).toHaveBeenCalled();
    expect(canvas.width).toBe(224);
    expect(canvas.height).toBe(84);

    await vi.advanceTimersByTimeAsync(1_000);
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

  it('reuses an existing effect surface and restarts pending activation timers', async () => {
    showEnhancedEffect({ animate: false });
    const firstEffect = document.querySelector('.ytcq-enhanced-effect');

    showEnhancedEffect({ animate: false });

    expect(document.querySelectorAll('.ytcq-enhanced-effect')).toHaveLength(1);
    expect(document.querySelector('.ytcq-enhanced-effect')).toBe(firstEffect);
    await vi.advanceTimersByTimeAsync(999);
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
