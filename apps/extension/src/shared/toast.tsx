/**
 * Lightweight in-chat toast feedback.
 *
 * Used for actions such as Mention and Quote where the user needs confirmation
 * but a persistent UI element would be too disruptive.
 */
import { jsx, el } from './jsx-dom';
import { prefersReducedMotion } from './motion';

const DEFAULT_TOAST_DURATION_MS = 2_400;
const TOAST_FADE_DURATION_MS = 160;

export interface ToastAnchor {
  x: number;
  y: number;
}

export interface ToastOptions {
  /** Viewport coordinates captured at activation; omitted to keep the default placement. */
  anchor?: ToastAnchor;
  durationMs?: number;
  tone?: 'default' | 'error';
}

let toastTimer = 0;

export function showToast(
  message: string,
  { anchor, durationMs = DEFAULT_TOAST_DURATION_MS, tone = 'default' }: ToastOptions = {}
): void {
  let toast = document.querySelector<HTMLElement>('.ytcq-toast');
  const initialOpacity = toast ? getComputedStyle(toast).opacity : '0';
  if (!toast) {
    toast = el<HTMLDivElement>(<div class="ytcq-toast" />);
    document.documentElement.appendChild(toast);
  }

  toast.getAnimations?.().forEach((animation) => animation.cancel());
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
  positionToast(toast, anchor);
  if (anchor && durationMs > 0 && !prefersReducedMotion() && typeof toast.animate === 'function') {
    const fadeOffset = Math.min(0.5, TOAST_FADE_DURATION_MS / durationMs);
    toast.animate(
      [
        { opacity: initialOpacity, offset: 0, easing: 'ease-out' },
        { opacity: 1, offset: fadeOffset },
        { opacity: 1, offset: 1 - fadeOffset, easing: 'ease-in' },
        { opacity: 0, offset: 1 }
      ],
      { duration: durationMs, fill: 'forwards' }
    );
  }
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.remove(), durationMs);
}

/** Capture before awaiting work or closing a menu, while currentTarget is still available. */
export function getToastAnchor(event: Event): ToastAnchor | undefined {
  if (event instanceof MouseEvent && event.detail > 0) {
    return { x: event.clientX, y: event.clientY };
  }

  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return undefined;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return undefined;
  return { x: rect.left + rect.width / 2, y: rect.bottom };
}

function positionToast(toast: HTMLElement, anchor: ToastAnchor | undefined): void {
  toast.classList.toggle('ytcq-toast-anchored', Boolean(anchor));
  toast.style.left = '';
  toast.style.top = '';
  if (!anchor) return;

  const gap = 16;
  const margin = 12;
  toast.style.left = '0px';
  toast.style.top = '0px';
  const { width, height } = toast.getBoundingClientRect();
  const maxLeft = window.innerWidth - width - margin;
  const maxTop = window.innerHeight - height - margin;
  const left = anchor.x + gap <= maxLeft ? anchor.x + gap : anchor.x - gap - width;
  const top = anchor.y + gap <= maxTop ? anchor.y + gap : anchor.y - gap - height;
  toast.style.left = `${Math.max(margin, Math.min(left, maxLeft))}px`;
  toast.style.top = `${Math.max(margin, Math.min(top, maxTop))}px`;
}

export function clearToast(): void {
  window.clearTimeout(toastTimer);
  toastTimer = 0;
  document.querySelectorAll<HTMLElement>('.ytcq-toast').forEach((toast) => toast.remove());
}
