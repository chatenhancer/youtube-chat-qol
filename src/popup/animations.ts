import { prefersReducedMotion } from './motion';

const BELL_RING_CLASS = 'ytcq-bell-ringing';
const TRANSLATION_PULSE_CLASS = 'ytcq-translation-pulse';
const DISPLAY_REFLOW_CLASS = 'ytcq-display-reflow';
const SPARKLE_BURST_CLASS = 'ytcq-sparkle-burst';
const PALETTE_POP_CLASS = 'ytcq-palette-pop';

export function animatePopupSoundIcon(): void {
  animatePopupIcon('.sound-icon', BELL_RING_CLASS, 700);
}

export function animatePopupTranslationIcon(): void {
  animatePopupIcon('.translation-target-icon', TRANSLATION_PULSE_CLASS, 900);
}

export function animatePopupDisplayIcon(): void {
  animatePopupIcon('.translation-display-icon', DISPLAY_REFLOW_CLASS, 900);
}

export function animatePopupStartupEffectIcon(): void {
  animatePopupIcon('.startup-effect-icon', SPARKLE_BURST_CLASS, 1000);
}

export function animatePopupChatSkinIcon(): void {
  animatePopupIcon('.chat-skin-icon', PALETTE_POP_CLASS, 900);
}

function animatePopupIcon(selector: string, className: string, durationMs: number): void {
  const icon = document.querySelector<SVGSVGElement>(selector);
  if (!icon || prefersReducedMotion()) return;

  icon.classList.remove(className);
  void icon.getBoundingClientRect();
  icon.classList.add(className);
  window.setTimeout(() => {
    icon.classList.remove(className);
  }, durationMs);
}
