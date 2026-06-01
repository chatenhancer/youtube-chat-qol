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
