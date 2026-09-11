/** Floating onboarding explanations that stay outside scrolling chat/profile lists. */
import { getExtensionMessage } from '../shared/extension-page-i18n';

export function wirePreviewInfo(
  root: HTMLElement,
  controls: ReadonlyArray<readonly [selector: string, messageKey: string]>,
  signal?: AbortSignal
): () => void {
  const tooltip = document.createElement('div');
  tooltip.id = `${root.id || 'previewProfile'}Info`;
  tooltip.className = 'preview-tooltip preview-floating-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  document.body.append(tooltip);
  let active: HTMLElement | null = null;
  for (const [selector, key] of controls) {
    const text = getExtensionMessage(key);
    for (const button of root.querySelectorAll<HTMLElement>(selector)) {
      button.removeAttribute('title');
      button.addEventListener('pointerenter', () => show(button, text), { signal });
      button.addEventListener('focus', () => show(button, text), { signal });
      button.addEventListener('pointerleave', () => {
        if (active === button && document.activeElement !== button) hide();
      }, { signal });
      button.addEventListener('blur', () => {
        if (active === button && !button.matches(':hover')) hide();
      }, { signal });
    }
  }

  // Moving or scrolling the profile dismisses the old explanation. The next
  // hover/focus measures the icon again, so its arrow never uses stale coordinates.
  root.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof Node) || !active?.contains(event.target)) hide();
  }, { signal });
  window.addEventListener('scroll', hide, { capture: true, signal });
  window.addEventListener('resize', hide, { signal });
  signal?.addEventListener('abort', () => tooltip.remove(), { once: true });
  return hide;

  function show(button: HTMLElement, text: string): void {
    active?.removeAttribute('aria-describedby');
    active = button;
    button.setAttribute('aria-describedby', tooltip.id);
    tooltip.textContent = text;
    const icon = button.getBoundingClientRect();
    const { width, height } = tooltip.getBoundingClientRect();
    const center = icon.left + icon.width / 2;
    const left = Math.max(8, Math.min(center - width / 2, window.innerWidth - width - 8));
    const above = icon.bottom + height + 12 > window.innerHeight - 8;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(8, above ? icon.top - height - 12 : icon.bottom + 12)}px`;
    tooltip.style.setProperty('--preview-info-arrow-left', `${center - left - tooltip.clientLeft - 4.5}px`);
    tooltip.dataset.placement = above ? 'above' : 'below';
    tooltip.setAttribute('data-visible', '');
  }

  function hide(): void {
    active?.removeAttribute('aria-describedby');
    active = null;
    tooltip.removeAttribute('data-visible');
  }
}
