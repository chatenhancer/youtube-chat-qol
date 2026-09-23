/**
 * Chat-enhanced visual signal.
 *
 * Shows a short edge shimmer once the loaded chat is visible, then leaves a quiet
 * ambient glow so the chat feels enhanced without competing with messages.
 */
import { registerFeature } from '../content/dispatcher';
import { jsx, el } from '../shared/jsx-dom';
import { drawEdgeShimmerFrame, EDGE_SHIMMER_DURATION_MS } from '../shared/edge-shimmer';
import { getOptions } from '../shared/state';
import type { Options } from '../shared/options';
import { CHAT_HEADER_SELECTOR } from '../youtube/selectors';

const EFFECT_CLASS = 'ytcq-enhanced-effect';
const ACTIVE_CLASS = 'ytcq-enhanced-effect-active';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

let animationFrame = 0;
let effect: HTMLDivElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let animationStart: number | null = null;

interface EnhancedEffectOptions {
  animate?: boolean;
}

registerFeature({
  page: {
    boot: showConfiguredEnhancedEffect,
    cleanup: cleanupStaleEnhancedEffect,
    optionsChanged: handleEnhancedEffectOptionsChanged,
    visibilityChanged: handleEnhancedEffectVisibilityChanged
  }
});

function showConfiguredEnhancedEffect(): void {
  showEnhancedEffect({ animate: getOptions().startupEffect });
}

function handleEnhancedEffectOptionsChanged(previousOptions: Options, nextOptions: Options): void {
  if (nextOptions.startupEffect === previousOptions.startupEffect) return;
  showEnhancedEffect({ animate: nextOptions.startupEffect });
}

function handleEnhancedEffectVisibilityChanged(visibilityState: Document['visibilityState']): void {
  if (visibilityState !== 'hidden' || !animationFrame) return;
  animationStart = null;
  effect?.classList.remove(ACTIVE_CLASS);
  clearCanvas();
}

export function showEnhancedEffect({ animate = true }: EnhancedEffectOptions = {}): void {
  const host = getEffectHost();
  effect = getOrCreateEffect();
  canvas = effect.querySelector('canvas');

  if (!effect.isConnected) {
    host.append(effect);
  }

  effect.classList.remove(ACTIVE_CLASS);
  animationStart = null;
  clearCanvas();
  if (animationFrame) {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  if (animate && !window.matchMedia(REDUCED_MOTION_QUERY).matches) {
    animationFrame = window.requestAnimationFrame(drawEnhancedFrame);
  }
}

export function hideEnhancedEffect(): void {
  if (animationFrame) {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  effect?.remove();
  effect = null;
  canvas = null;
  animationStart = null;
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
  animationFrame = 0;
  if (!canvas || !effect?.isConnected) return;

  if (animationStart === null) {
    // Loading or a throttled iframe must not consume the short animation.
    // Start its clock only when the browser can paint the loaded chat.
    if (!isChatReadyToAnimate()) {
      animationFrame = window.requestAnimationFrame(drawEnhancedFrame);
      return;
    }
    animationStart = now;
    effect.classList.add(ACTIVE_CLASS);
  }

  const progress = Math.min((now - animationStart) / EDGE_SHIMMER_DURATION_MS, 1);
  drawEdgeShimmerFrame(canvas, progress);

  if (progress < 1) {
    animationFrame = window.requestAnimationFrame(drawEnhancedFrame);
    return;
  }

  effect.classList.remove(ACTIVE_CLASS);
  clearCanvas();
}

function isChatReadyToAnimate(): boolean {
  if (document.readyState !== 'complete' || document.visibilityState !== 'visible') return false;
  const header = document.querySelector<HTMLElement>(CHAT_HEADER_SELECTOR);
  if (!header) return false;
  const rect = header.getBoundingClientRect();
  return (
    rect.width > 0 && rect.height > 0 && window.getComputedStyle(header).visibility !== 'hidden'
  );
}

function clearCanvas(): void {
  if (!canvas) return;

  const context = canvas.getContext('2d');
  context?.clearRect(0, 0, canvas.width, canvas.height);
}
