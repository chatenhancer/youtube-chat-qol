/**
 * Chat-enhanced visual signal.
 *
 * Shows a short edge shimmer when the extension attaches, then leaves a quiet
 * ambient glow so the chat feels enhanced without competing with messages.
 */
import { registerFeatureLifecycle } from '../content/lifecycle';
import { jsx, el } from '../shared/jsx-dom';
import { getOptions } from '../shared/state';
import type { Options } from '../shared/options';

const EFFECT_CLASS = 'ytcq-enhanced-effect';
const ACTIVE_CLASS = 'ytcq-enhanced-effect-active';
const ACTIVATION_MS = 1000;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const CANVAS_SCALE = 0.7;

let activationTimer = 0;
let animationFrame = 0;
let effect: HTMLDivElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let animationStart = 0;

interface EnhancedEffectOptions {
  animate?: boolean;
}

registerFeatureLifecycle({
  page: {
    boot: showConfiguredEnhancedEffect,
    cleanupStale: cleanupStaleEnhancedEffect,
    optionsChanged: handleEnhancedEffectOptionsChanged
  }
});

function showConfiguredEnhancedEffect(): void {
  showEnhancedEffect({ animate: getOptions().startupEffect });
}

function handleEnhancedEffectOptionsChanged(previousOptions: Options, nextOptions: Options): void {
  if (nextOptions.startupEffect === previousOptions.startupEffect) return;
  showEnhancedEffect({ animate: nextOptions.startupEffect });
}

export function showEnhancedEffect({ animate = true }: EnhancedEffectOptions = {}): void {
  const host = getEffectHost();
  effect = getOrCreateEffect();
  canvas = effect.querySelector('canvas');

  if (!effect.isConnected) {
    host.append(effect);
  }

  effect.classList.remove(ACTIVE_CLASS);
  void effect.getBoundingClientRect();
  effect.classList.add(ACTIVE_CLASS);

  if (activationTimer) {
    window.clearTimeout(activationTimer);
    activationTimer = 0;
  }
  if (animationFrame) {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  if (animate && !window.matchMedia(REDUCED_MOTION_QUERY).matches) {
    animationStart = performance.now();
    animationFrame = window.requestAnimationFrame(drawEnhancedFrame);
  } else {
    effect.classList.remove(ACTIVE_CLASS);
    clearCanvas();
  }

  activationTimer = window.setTimeout(() => {
    activationTimer = 0;
    effect?.classList.remove(ACTIVE_CLASS);
    clearCanvas();
  }, ACTIVATION_MS);
}

export function hideEnhancedEffect(): void {
  if (activationTimer) {
    window.clearTimeout(activationTimer);
    activationTimer = 0;
  }
  if (animationFrame) {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  effect?.remove();
  effect = null;
  canvas = null;
}

export function cleanupStaleEnhancedEffect(): void {
  hideEnhancedEffect();
  document
    .querySelectorAll<HTMLDivElement>(`.${EFFECT_CLASS}`)
    .forEach((element) => element.remove());
}

function getOrCreateEffect(): HTMLDivElement {
  const existing = document.querySelector<HTMLDivElement>(`.${EFFECT_CLASS}`);
  if (existing) return existing;

  return el<HTMLDivElement>(
    <div class={EFFECT_CLASS} aria-hidden="true">
      <canvas />
    </div>
  );
}

function getEffectHost(): HTMLElement {
  return document.body || document.documentElement;
}

function drawEnhancedFrame(now: number): void {
  if (!canvas || !effect?.isConnected) return;

  const progress = Math.min((now - animationStart) / ACTIVATION_MS, 1);
  drawShimmerFrame(canvas, progress);

  if (progress < 1) {
    animationFrame = window.requestAnimationFrame(drawEnhancedFrame);
    return;
  }

  animationFrame = 0;
}

function drawShimmerFrame(target: HTMLCanvasElement, progress: number): void {
  const rect = target.getBoundingClientRect();
  const width = Math.max(1, rect.width || window.innerWidth);
  const height = Math.max(1, rect.height || window.innerHeight);
  const pixelWidth = Math.ceil(width * CANVAS_SCALE);
  const pixelHeight = Math.ceil(height * CANVAS_SCALE);

  if (target.width !== pixelWidth || target.height !== pixelHeight) {
    target.width = pixelWidth;
    target.height = pixelHeight;
  }

  const context = target.getContext('2d');
  if (!context) return;

  context.clearRect(0, 0, pixelWidth, pixelHeight);
  context.save();
  context.scale(CANVAS_SCALE, CANVAS_SCALE);

  context.globalAlpha = getActivationOpacity(progress);
  context.globalCompositeOperation = 'lighter';
  drawQuietPerimeter(context, width, height);
  drawShimmerPerimeter(context, width, height, easeOutCubic(progress));
  context.restore();
}

function getActivationOpacity(progress: number): number {
  if (progress < 0.16) return progress / 0.16;
  if (progress > 0.76) return Math.max(0, (1 - progress) / 0.24);
  return 1;
}

function drawQuietPerimeter(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  drawPerimeterStroke(context, width, height, 'rgba(62, 166, 255, 0.16)', 4);
}

function drawShimmerPerimeter(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number
): void {
  drawPerimeterStroke(
    context,
    width,
    height,
    createShimmerGradient(context, width, height, progress),
    11
  );
}

function drawPerimeterStroke(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  strokeStyle: string | CanvasGradient,
  lineWidth: number
): void {
  const inset = 2;
  const radius = Math.min(18, width / 2 - inset, height / 2 - inset);

  context.save();
  context.strokeStyle = strokeStyle;
  context.lineWidth = lineWidth;
  strokeRoundedRect(context, inset, inset, width - inset * 2, height - inset * 2, radius);
  context.restore();
}

function createShimmerGradient(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number
): CanvasGradient {
  const gradient = context.createConicGradient(
    progress * Math.PI * 2 - Math.PI * 0.8,
    width / 2,
    height / 2
  );
  gradient.addColorStop(0, 'rgba(62, 166, 255, 0)');
  gradient.addColorStop(0.08, 'rgba(62, 166, 255, 0)');
  gradient.addColorStop(0.12, 'rgba(62, 166, 255, 0.18)');
  gradient.addColorStop(0.155, 'rgba(125, 211, 252, 0.62)');
  gradient.addColorStop(0.175, 'rgba(255, 255, 255, 0.92)');
  gradient.addColorStop(0.195, 'rgba(125, 211, 252, 0.62)');
  gradient.addColorStop(0.25, 'rgba(126, 87, 255, 0.16)');
  gradient.addColorStop(0.34, 'rgba(62, 166, 255, 0)');
  gradient.addColorStop(1, 'rgba(62, 166, 255, 0)');
  return gradient;
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function strokeRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
  context.stroke();
}

function clearCanvas(): void {
  if (!canvas) return;

  const context = canvas.getContext('2d');
  context?.clearRect(0, 0, canvas.width, canvas.height);
}
