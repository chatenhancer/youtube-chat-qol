/**
 * Pointer drag helpers for fixed-position floating panels.
 */
interface FloatingPanelDragOptions {
  draggingClassName: string;
  handle: HTMLElement;
  ignoredSelector?: string;
  margin?: number;
  onDragStart?: () => void;
  panel: HTMLElement;
  signal: AbortSignal;
}

const DEFAULT_IGNORED_SELECTOR = 'button, a, input, textarea, select, [contenteditable]';
const DEFAULT_MARGIN = 8;

export function wireFloatingPanelDrag({
  draggingClassName,
  handle,
  ignoredSelector = DEFAULT_IGNORED_SELECTOR,
  margin = DEFAULT_MARGIN,
  onDragStart,
  panel,
  signal
}: FloatingPanelDragOptions): void {
  let dragOffset: { x: number; y: number } | null = null;

  handle.addEventListener('pointerdown', (event) => {
    const button = 'button' in event ? event.button : 0;
    if (button !== 0) return;
    if ((event.target as Element | null)?.closest(ignoredSelector)) return;

    const rect = panel.getBoundingClientRect();
    dragOffset = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    onDragStart?.();
    panel.classList.add(draggingClassName);
    anchorFloatingPanelAtRect(panel, rect);
    panel.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }, { signal });

  document.addEventListener('pointermove', (event) => {
    if (!dragOffset) return;

    const rect = panel.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    const left = Math.min(maxLeft, Math.max(margin, event.clientX - dragOffset.x));
    const top = Math.min(maxTop, Math.max(margin, event.clientY - dragOffset.y));
    anchorFloatingPanelAtPoint(panel, left, top);
  }, { signal });

  const stopDrag = (event: PointerEvent): void => {
    if (!dragOffset) return;

    dragOffset = null;
    panel.classList.remove(draggingClassName);
    panel.releasePointerCapture?.(event.pointerId);
  };

  document.addEventListener('pointerup', stopDrag, { signal });
  document.addEventListener('pointercancel', stopDrag, { signal });
}

export function anchorFloatingPanelAtRect(panel: HTMLElement, rect: DOMRect): void {
  panel.style.left = `${Math.round(rect.left)}px`;
  panel.style.top = `${Math.round(rect.top)}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.transform = '';
}

export function anchorFloatingPanelAtPoint(panel: HTMLElement, left: number, top: number): void {
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.transform = '';
}

export function clampFloatingPanelToViewport(panel: HTMLElement, margin = DEFAULT_MARGIN): void {
  const rect = panel.getBoundingClientRect();
  const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
  const left = Math.min(maxLeft, Math.max(margin, rect.left));
  const top = Math.min(maxTop, Math.max(margin, rect.top));
  anchorFloatingPanelAtPoint(panel, left, top);
}
