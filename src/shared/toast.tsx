/**
 * Lightweight in-chat toast feedback.
 *
 * Used for actions such as Mention and Quote where the user needs confirmation
 * but a persistent UI element would be too disruptive.
 */
import { jsx, el } from './jsx-dom';

const DEFAULT_TOAST_DURATION_MS = 2_400;

export interface ToastOptions {
  durationMs?: number;
  tone?: 'default' | 'error';
}

let toastTimer = 0;

export function showToast(
  message: string,
  { durationMs = DEFAULT_TOAST_DURATION_MS, tone = 'default' }: ToastOptions = {}
): void {
  let toast = document.querySelector<HTMLElement>('.ytcq-toast');
  if (!toast) {
    toast = el<HTMLDivElement>(<div class="ytcq-toast" />);
    document.documentElement.appendChild(toast);
  }

  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.remove(), durationMs);
}

export function clearToast(): void {
  window.clearTimeout(toastTimer);
  toastTimer = 0;
  document.querySelectorAll<HTMLElement>('.ytcq-toast').forEach((toast) => toast.remove());
}
