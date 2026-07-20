/**
 * Shared chat-feed overlay game shell.
 *
 * Owns the common header frame for games that render directly over the live
 * chat feed instead of inside a floating panel.
 */
import { createCloseIcon } from '../../../shared/icons';
import { jsx, el } from '../../../shared/jsx-dom';
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
  const statusOverlay = createGamePanelStatusOverlay({ classNamePrefix });
  let actions!: HTMLDivElement;
  let body!: HTMLDivElement;
  let closeButton!: HTMLButtonElement;
  let header!: HTMLDivElement;
  let subtitleElement!: HTMLDivElement;
  let titleElement!: HTMLDivElement;
  const root = el<HTMLElement>(
    <section class={`ytcq-game-overlay ${classNamePrefix}-overlay`} aria-label={ariaLabel}>
      <div
        ref={(element: HTMLDivElement) => (body = element)}
        class={`ytcq-game-overlay-body ${classNamePrefix}-body`}
      >
        {statusOverlay.element}
      </div>
      <div
        ref={(element: HTMLDivElement) => (header = element)}
        class={`ytcq-game-overlay-header ${classNamePrefix}-header`}
      >
        <span class={`ytcq-game-overlay-icon ${classNamePrefix}-icon`}>{icon}</span>
        <div class={`ytcq-game-overlay-title-wrap ${classNamePrefix}-title-wrap`}>
          <div
            ref={(element: HTMLDivElement) => (titleElement = element)}
            class={`ytcq-game-overlay-title ${classNamePrefix}-title`}
            dir="auto"
          >
            {title}
          </div>
          <div
            ref={(element: HTMLDivElement) => (subtitleElement = element)}
            class={`ytcq-game-overlay-subtitle ${classNamePrefix}-subtitle`}
            dir="auto"
          >
            {subtitle}
          </div>
        </div>
        <div
          ref={(element: HTMLDivElement) => (actions = element)}
          class={`ytcq-game-overlay-actions ${classNamePrefix}-actions`}
        >
          <button
            ref={(element: HTMLButtonElement) => (closeButton = element)}
            type="button"
            class={`ytcq-game-overlay-close ${classNamePrefix}-close`}
            aria-label={closeLabel}
            title={closeLabel}
          >
            {createCloseIcon()}
          </button>
        </div>
      </div>
    </section>
  );
  closeButton.addEventListener('click', onClose, { signal });

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') onClose();
    },
    { signal }
  );
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
