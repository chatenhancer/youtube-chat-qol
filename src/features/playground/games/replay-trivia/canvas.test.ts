import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH
} from './constants';
import {
  canRenderReplayTriviaCanvas,
  cancelScheduledFrame,
  configureReplayTriviaCanvas,
  getCanvasPoint,
  getNow,
  isPointInRect,
  scheduleFrame,
  syncReplayTriviaCanvasPixelRatio
} from './canvas';

describe('replay trivia canvas utilities', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('configures the backing canvas with clamped pixel ratios', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 3
    });

    const pixelRatio = configureReplayTriviaCanvas(canvas);

    expect(pixelRatio).toBe(2);
    expect(canvas.width).toBe(CANVAS_WIDTH * 2);
    expect(canvas.height).toBe(CANVAS_HEIGHT * 2);
    expect(canvas.style.maxWidth).toBe('336px');

    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 0
    });
    expect(syncReplayTriviaCanvasPixelRatio(canvas, pixelRatio)).toBe(1);
    expect(canvas.width).toBe(CANVAS_WIDTH);
  });

  it('keeps the existing backing canvas when the pixel ratio is unchanged', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 1.5
    });

    const pixelRatio = configureReplayTriviaCanvas(canvas);
    canvas.width = 123;

    expect(syncReplayTriviaCanvasPixelRatio(canvas, pixelRatio)).toBe(1.5);
    expect(canvas.width).toBe(123);
  });

  it('maps pointer coordinates and includes rectangle edges', () => {
    const canvas = document.createElement('canvas');
    mockRect(canvas, {
      height: 224,
      left: 10,
      top: 20,
      width: 224
    });

    const point = getCanvasPoint(canvas, new MouseEvent('click', {
      clientX: 122,
      clientY: 132
    }));

    expect(point).toEqual({
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2
    });
    expect(isPointInRect(point, { height: 224, width: 224, x: 224, y: 224 })).toBe(true);
    expect(isPointInRect({ x: 449, y: point.y }, { height: 448, width: 448, x: 0, y: 0 })).toBe(false);
  });

  it('checks the minimal canvas API before rendering', () => {
    const completeContext = Object.fromEntries([
      'arc',
      'bezierCurveTo',
      'beginPath',
      'clearRect',
      'closePath',
      'drawImage',
      'fill',
      'fillRect',
      'fillText',
      'lineTo',
      'measureText',
      'moveTo',
      'quadraticCurveTo',
      'restore',
      'rotate',
      'save',
      'setTransform',
      'stroke',
      'strokeRect',
      'strokeText',
      'translate'
    ].map((method) => [method, vi.fn()]));

    expect(canRenderReplayTriviaCanvas(completeContext as unknown as CanvasRenderingContext2D)).toBe(true);
    delete completeContext.arc;
    expect(canRenderReplayTriviaCanvas(completeContext as unknown as CanvasRenderingContext2D)).toBe(false);
  });

  it('uses animation frames when available and falls back to timers', () => {
    const frameCallback = vi.fn();
    const requestAnimationFrame = vi.fn(() => 42);
    const cancelAnimationFrame = vi.fn();
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: requestAnimationFrame
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      value: cancelAnimationFrame
    });

    expect(scheduleFrame(frameCallback)).toBe(42);
    expect(requestAnimationFrame).toHaveBeenCalledWith(frameCallback);
    cancelScheduledFrame(42);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);

    vi.useFakeTimers();
    try {
      Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        value: undefined
      });
      Object.defineProperty(window, 'cancelAnimationFrame', {
        configurable: true,
        value: undefined
      });
      const fallbackCallback = vi.fn();

      const timeoutId = scheduleFrame(fallbackCallback);
      vi.advanceTimersByTime(16);

      expect(timeoutId).toBeTruthy();
      expect(fallbackCallback).toHaveBeenCalledWith(expect.any(Number));
      cancelScheduledFrame(timeoutId);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to Date.now when performance.now is unavailable', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1234);
    Object.defineProperty(window, 'performance', {
      configurable: true,
      value: {}
    });

    expect(getNow()).toBe(1234);
    now.mockRestore();
  });
});

function mockRect(
  element: Element,
  rect: {
    height: number;
    left: number;
    top: number;
    width: number;
  }
): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      bottom: rect.top + rect.height,
      height: rect.height,
      left: rect.left,
      right: rect.left + rect.width,
      toJSON: () => ({}),
      top: rect.top,
      width: rect.width,
      x: rect.left,
      y: rect.top
    } as DOMRect)
  });
}
