/**
 * Shared chat-feed overlay game shell.
 *
 * Owns the common header frame for games that render directly over the live
 * chat feed instead of inside a floating panel.
 */
import { createCloseIcon } from '../../../shared/icons';
import { ytcqCreateElement } from '../../../shared/managed-dom';
import { createGamePanelStatusOverlay, type GamePanelStatusOverlay } from './panel-feedback';

interface GameOverlayShellOptions {
  ariaLabel: string;
  classNamePrefix: string;
  closeLabel: string;
  icon: Node;
  onClose: () => void;
  signal: AbortSignal;
  subtitle: string;
  title: string;
}

export interface GameOverlayShell {
  actions: HTMLElement;
  body: HTMLElement;
  closeButton: HTMLButtonElement;
  header: HTMLElement;
  root: HTMLElement;
  statusOverlay: GamePanelStatusOverlay;
  subtitleElement: HTMLElement;
  titleElement: HTMLElement;
}

export function createGameOverlayShell({
  ariaLabel,
  classNamePrefix,
  closeLabel,
  icon,
  onClose,
  signal,
  subtitle,
  title
}: GameOverlayShellOptions): GameOverlayShell {
  const root = ytcqCreateElement('section');
  root.className = `ytcq-game-overlay ${classNamePrefix}-overlay`;
  root.setAttribute('aria-label', ariaLabel);

  const body = ytcqCreateElement('div');
  body.className = `ytcq-game-overlay-body ${classNamePrefix}-body`;
  const statusOverlay = createGamePanelStatusOverlay({ classNamePrefix });
  body.append(statusOverlay.element);

  const header = ytcqCreateElement('div');
  header.className = `ytcq-game-overlay-header ${classNamePrefix}-header`;

  const iconWrap = ytcqCreateElement('span');
  iconWrap.className = `ytcq-game-overlay-icon ${classNamePrefix}-icon`;
  iconWrap.append(icon);

  const titleWrap = ytcqCreateElement('div');
  titleWrap.className = `ytcq-game-overlay-title-wrap ${classNamePrefix}-title-wrap`;

  const titleElement = ytcqCreateElement('div');
  titleElement.className = `ytcq-game-overlay-title ${classNamePrefix}-title`;
  titleElement.textContent = title;

  const subtitleElement = ytcqCreateElement('div');
  subtitleElement.className = `ytcq-game-overlay-subtitle ${classNamePrefix}-subtitle`;
  subtitleElement.textContent = subtitle;

  const actions = ytcqCreateElement('div');
  actions.className = `ytcq-game-overlay-actions ${classNamePrefix}-actions`;

  const closeButton = ytcqCreateElement('button');
  closeButton.type = 'button';
  closeButton.className = `ytcq-game-overlay-close ${classNamePrefix}-close`;
  closeButton.setAttribute('aria-label', closeLabel);
  closeButton.title = closeLabel;
  closeButton.append(createCloseIcon());
  closeButton.addEventListener('click', onClose, { signal });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') onClose();
  }, { signal });

  titleWrap.append(titleElement, subtitleElement);
  actions.append(closeButton);
  header.append(iconWrap, titleWrap, actions);
  root.append(body, header);

  return {
    actions,
    body,
    closeButton,
    header,
    root,
    statusOverlay,
    subtitleElement,
    titleElement
  };
}
