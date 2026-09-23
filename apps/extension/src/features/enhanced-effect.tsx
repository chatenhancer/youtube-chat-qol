/**
 * Chat-enhanced visual signal.
 *
 * Shows a short edge shimmer when the extension attaches, then leaves a quiet
 * ambient glow so the chat feels enhanced without competing with messages.
 */
import { registerFeature } from '../content/dispatcher';
import { jsx, el } from '../shared/jsx-dom';
import { drawEdgeShimmerFrame, EDGE_SHIMMER_DURATION_MS } from '../shared/edge-shimmer';
import { getOptions } from '../shared/state';
import type { Options } from '../shared/options';

const EFFECT_CLASS = 'ytcq-enhanced-effect';
const ACTIVE_CLASS = 'ytcq-enhanced-effect-active';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

let activationTimer = 0;
let animationFrame = 0;
let effect: HTMLDivElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let animationStart = 0;

interface EnhancedEffectOptions {
  animate?: boolean;
}

registerFeature({
  page: {
    boot: showConfiguredEnhancedEffect,
    cleanup: cleanupStaleEnhancedEffect,
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
  }, EDGE_SHIMMER_DURATION_MS);
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

  const progress = Math.min((now - animationStart) / EDGE_SHIMMER_DURATION_MS, 1);
  drawEdgeShimmerFrame(canvas, progress);

  if (progress < 1) {
    animationFrame = window.requestAnimationFrame(drawEnhancedFrame);
    return;
  }

  animationFrame = 0;
}

function clearCanvas(): void {
  if (!canvas) return;

  const context = canvas.getContext('2d');
  context?.clearRect(0, 0, canvas.width, canvas.height);
}
