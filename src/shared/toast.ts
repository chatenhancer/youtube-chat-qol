/**
 * Lightweight in-chat toast feedback.
 *
 * Used for actions such as Mention and Quote where the user needs confirmation
 * but a persistent UI element would be too disruptive.
 */
import { ytcqCreateElement } from './managed-dom';

let toastTimer = 0;

export function showToast(message: string): void {
  let toast = document.querySelector<HTMLElement>('.ytcq-toast');
  if (!toast) {
    toast = ytcqCreateElement('div');
    toast.className = 'ytcq-toast';
    document.documentElement.appendChild(toast);
  }

  toast.textContent = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.remove(), 2400);
}

export function clearToast(): void {
  window.clearTimeout(toastTimer);
  toastTimer = 0;
  document.querySelectorAll<HTMLElement>('.ytcq-toast').forEach((toast) => toast.remove());
}
