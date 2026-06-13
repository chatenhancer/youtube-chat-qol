import {
  CANVAS_DISPLAY_WIDTH,
  CANVAS_HEIGHT,
  CANVAS_WIDTH
} from './constants';
import type { Rect } from './types';

export function configureReplayTriviaCanvas(canvas: HTMLCanvasElement): number {
  const pixelRatio = getPixelRatio();
  canvas.width = Math.round(CANVAS_WIDTH * pixelRatio);
  canvas.height = Math.round(CANVAS_HEIGHT * pixelRatio);
  canvas.style.width = '100%';
  canvas.style.maxWidth = `${CANVAS_DISPLAY_WIDTH}px`;
  canvas.style.height = 'auto';
  return pixelRatio;
}

export function syncReplayTriviaCanvasPixelRatio(canvas: HTMLCanvasElement, pixelRatio: number): number {
  const nextPixelRatio = getPixelRatio();
  if (pixelRatio !== nextPixelRatio) {
    configureReplayTriviaCanvas(canvas);
  }
  return nextPixelRatio;
}

export function getCanvasPoint(canvas: HTMLCanvasElement, event: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT
  };
}

export function isPointInRect(point: { x: number; y: number }, rect: Rect): boolean {
  return point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height;
}

export function canRenderReplayTriviaCanvas(context: CanvasRenderingContext2D): boolean {
  const candidate = context as unknown as Record<string, unknown>;
  return [
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
  ].every((method) => typeof candidate[method] === 'function');
}

export function scheduleFrame(callback: FrameRequestCallback): number {
  if (typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(callback);
  }
  return window.setTimeout(() => callback(getNow()), 16);
}

export function cancelScheduledFrame(frameId: number): void {
  if (typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frameId);
    return;
  }
  window.clearTimeout(frameId);
}

export function getNow(): number {
  return window.performance?.now?.() || Date.now();
}

function getPixelRatio(): number {
  return Math.max(1, Math.min(2, window.devicePixelRatio || 1));
}
