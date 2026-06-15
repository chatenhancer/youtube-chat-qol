/**
 * Shared floating game panel shell.
 *
 * Owns the common draggable dialog frame used by individual games. Game modules
 * provide the body content and game-specific header actions, while this shell
 * handles the close button, Escape close behavior, and drag positioning.
 */
import { createCloseIcon } from '../../../shared/icons';
import { ytcqCreateElement } from '../../../shared/managed-dom';

interface GamePanelShellOptions {
  ariaLabel: string;
  classNamePrefix: string;
  closeLabel: string;
  headerActions?: Node[];
  icon: Node;
  onClose: () => void;
  signal: AbortSignal;
  subtitle: string;
  title: string;
}

export interface GamePanelShell {
  body: HTMLElement;
  closeButton: HTMLButtonElement;
  header: HTMLElement;
  panel: HTMLElement;
  subtitleElement: HTMLElement;
  titleElement: HTMLElement;
}

export function createGamePanelShell({
  ariaLabel,
  classNamePrefix,
  closeLabel,
  headerActions = [],
  icon,
  onClose,
  signal,
  subtitle,
  title
}: GamePanelShellOptions): GamePanelShell {
  const panel = ytcqCreateElement('section');
  panel.className = `ytcq-game-panel ${classNamePrefix}-panel`;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', ariaLabel);

  const header = ytcqCreateElement('div');
  header.className = `${classNamePrefix}-header`;

  const iconWrap = ytcqCreateElement('span');
  iconWrap.className = `${classNamePrefix}-icon`;
  iconWrap.append(icon);

  const titleWrap = ytcqCreateElement('div');
  titleWrap.className = `${classNamePrefix}-title-wrap`;

  const titleElement = ytcqCreateElement('div');
  titleElement.className = `${classNamePrefix}-title`;
  titleElement.textContent = title;

  const subtitleElement = ytcqCreateElement('div');
  subtitleElement.className = `${classNamePrefix}-subtitle`;
  subtitleElement.textContent = subtitle;

  const closeButton = ytcqCreateElement('button');
  closeButton.type = 'button';
  closeButton.className = `ytcq-game-panel-close ${classNamePrefix}-close`;
  closeButton.setAttribute('aria-label', closeLabel);
  closeButton.title = closeLabel;
  closeButton.append(createCloseIcon());
  closeButton.addEventListener('click', onClose, { signal });

  titleWrap.append(titleElement, subtitleElement);
  header.append(iconWrap, titleWrap, ...headerActions, closeButton);

  const body = ytcqCreateElement('div');
  body.className = `${classNamePrefix}-body`;

  panel.append(header, body);
  document.body.append(panel);

  wireGamePanelShellDrag({
    draggingClassName: `${classNamePrefix}-panel-dragging`,
    header,
    onClose,
    panel,
    signal
  });

  return {
    body,
    closeButton,
    header,
    panel,
    subtitleElement,
    titleElement
  };
}

function wireGamePanelShellDrag({
  draggingClassName,
  header,
  onClose,
  panel,
  signal
}: {
  draggingClassName: string;
  header: HTMLElement;
  onClose: () => void;
  panel: HTMLElement;
  signal: AbortSignal;
}): void {
  let dragOffset: { x: number; y: number } | null = null;

  header.addEventListener('pointerdown', (event) => {
    if ((event.target as Element | null)?.closest('button')) return;

    const rect = panel.getBoundingClientRect();
    dragOffset = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    panel.classList.add(draggingClassName);
    panel.style.left = `${Math.round(rect.left)}px`;
    panel.style.top = `${Math.round(rect.top)}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }, { signal });

  document.addEventListener('pointermove', (event) => {
    if (!dragOffset) return;

    const rect = panel.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
    const left = Math.min(maxLeft, Math.max(8, event.clientX - dragOffset.x));
    const top = Math.min(maxTop, Math.max(8, event.clientY - dragOffset.y));
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }, { signal });

  document.addEventListener('pointerup', (event) => {
    if (!dragOffset) return;

    dragOffset = null;
    panel.classList.remove(draggingClassName);
    panel.releasePointerCapture?.(event.pointerId);
  }, { signal });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') onClose();
  }, { capture: true, signal });
}
