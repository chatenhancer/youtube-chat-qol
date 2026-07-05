/**
 * Shared floating game panel shell.
 *
 * Owns the common draggable dialog frame used by individual games. Game modules
 * provide the body content while this shell handles the close button, Escape
 * close behavior, shared status overlay, and drag positioning.
 */
import { createCloseIcon, createExpandIcon, createMinimizeIcon } from '../../../shared/icons';
import {
  anchorFloatingPanelAtPoint,
  anchorFloatingPanelAtRect,
  clampFloatingPanelToViewport,
  wireFloatingPanelDrag
} from '../../../shared/floating-panel-drag';
import { ytcqCreateElement } from '../../../shared/managed-dom';
import { createGamePanelStatusOverlay, type GamePanelStatusOverlay } from './panel-feedback';

const PANEL_POSITION_ANIMATION_MS = 260;
const panelPositionAnimations = new WeakMap<HTMLElement, Animation>();
const panelSizeAnimations = new WeakMap<HTMLElement, Animation>();

interface GamePanelShellOptions {
  ariaLabel: string;
  classNamePrefix: string;
  closeLabel: string;
  icon: Node;
  onClose: () => void;
  signal: AbortSignal;
  subtitle: string;
  title: string;
}

export interface GamePanelShell {
  body: HTMLElement;
  closeButton: HTMLButtonElement;
  compactButton: HTMLButtonElement;
  header: HTMLElement;
  isCompactMode: () => boolean;
  panel: HTMLElement;
  setCompactMode: (compact: boolean) => void;
  setCompactModeEnabled: (options: GamePanelShellCompactOptions | null) => void;
  setPosition: (position: GamePanelShellPosition, options?: GamePanelShellPositionOptions) => void;
  statusOverlay: GamePanelStatusOverlay;
  subtitleElement: HTMLElement;
  titleElement: HTMLElement;
}

export type GamePanelShellPosition =
  | {
      inset?: number;
      placement: 'top-center' | 'top-right';
    }
  | {
      inset?: number;
      placement: 'cursor';
      x: number;
      y: number;
    };

export interface GamePanelShellPositionOptions {
  animate?: boolean;
}

export interface GamePanelShellCompactOptions {
  compactLabel: string;
  expandLabel: string;
  onChange: (compact: boolean) => void;
}

export function createGamePanelShell({
  ariaLabel,
  classNamePrefix,
  closeLabel,
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

  let compactMode = false;
  let compactOptions: GamePanelShellCompactOptions | null = null;
  const compactButton = ytcqCreateElement('button');
  compactButton.type = 'button';
  compactButton.className = `ytcq-game-panel-compact-toggle ${classNamePrefix}-compact-toggle`;
  compactButton.hidden = true;
  compactButton.addEventListener('click', () => {
    if (!compactOptions) return;
    setCompactMode(!compactMode);
    compactOptions.onChange(compactMode);
    clampGamePanelPosition(panel);
  }, { signal });
  syncCompactButton();

  titleWrap.append(titleElement, subtitleElement);
  header.append(iconWrap, titleWrap, compactButton, closeButton);

  const body = ytcqCreateElement('div');
  body.className = `${classNamePrefix}-body`;
  const statusOverlay = createGamePanelStatusOverlay({ classNamePrefix });
  body.append(statusOverlay.element);

  panel.append(header, body);
  document.body.append(panel);

  wireGamePanelShellDrag({
    draggingClassName: `${classNamePrefix}-panel-dragging`,
    header,
    panel,
    signal
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') onClose();
  }, { capture: true, signal });

  function setCompactModeEnabled(options: GamePanelShellCompactOptions | null): void {
    compactOptions = options;
    compactButton.hidden = !options;
    panel.classList.toggle('ytcq-game-panel-has-compact', Boolean(options));
    if (!options) {
      compactMode = false;
      panel.classList.remove('ytcq-game-panel-compact');
    }
    syncCompactButton();
  }

  function setCompactMode(compact: boolean): void {
    if (compactMode === compact) return;
    anchorGamePanelPosition(panel);
    animateGamePanelSizeChange(panel, () => {
      compactMode = compact;
      panel.classList.toggle('ytcq-game-panel-compact', compactMode);
      syncCompactButton();
    });
  }

  function setPosition(
    position: GamePanelShellPosition,
    { animate = true }: GamePanelShellPositionOptions = {}
  ): void {
    if (!animate) {
      cancelGamePanelPositionAnimation(panel);
      applyGamePanelPosition(panel, position);
      return;
    }
    animateGamePanelPositionChange(panel, () => {
      applyGamePanelPosition(panel, position);
    });
  }

  function syncCompactButton(): void {
    const label = compactMode
      ? compactOptions?.expandLabel || ''
      : compactOptions?.compactLabel || '';
    compactButton.setAttribute('aria-label', label);
    compactButton.setAttribute('aria-pressed', String(compactMode));
    compactButton.title = label;
    compactButton.replaceChildren(compactMode ? createExpandIcon() : createMinimizeIcon());
  }

  return {
    body,
    closeButton,
    compactButton,
    header,
    isCompactMode: () => compactMode,
    panel,
    setCompactMode,
    setCompactModeEnabled,
    setPosition,
    statusOverlay,
    subtitleElement,
    titleElement
  };
}

function applyGamePanelPosition(panel: HTMLElement, position: GamePanelShellPosition): void {
  const inset = position.inset ?? 12;
  const { placement } = position;
  if (placement === 'cursor') {
    const rect = panel.getBoundingClientRect();
    anchorGamePanelAtPoint(
      panel,
      clampNumber(position.x, inset, Math.max(inset, window.innerWidth - rect.width - inset)),
      clampNumber(position.y, inset, Math.max(inset, window.innerHeight - rect.height - inset))
    );
    return;
  }

  panel.style.top = `${Math.round(inset)}px`;
  panel.style.bottom = 'auto';
  if (placement === 'top-center') {
    panel.style.left = '50%';
    panel.style.right = 'auto';
    panel.style.transform = 'translateX(-50%)';
    return;
  }
  panel.style.left = 'auto';
  panel.style.right = `${Math.round(inset)}px`;
  panel.style.transform = '';
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function animateGamePanelPositionChange(panel: HTMLElement, applyPosition: () => void): void {
  const before = panel.getBoundingClientRect();
  cancelGamePanelPositionAnimation(panel);
  applyPosition();
  const after = panel.getBoundingClientRect();
  const deltaX = before.left - after.left;
  const deltaY = before.top - after.top;
  if (!shouldAnimateGamePanelPosition(panel, before, after, deltaX, deltaY)) return;

  const finalTransform = panel.style.transform || 'none';
  const startTransform = finalTransform === 'none'
    ? `translate(${Math.round(deltaX)}px, ${Math.round(deltaY)}px)`
    : `translate(${Math.round(deltaX)}px, ${Math.round(deltaY)}px) ${finalTransform}`;
  const animation = panel.animate([
    { transform: startTransform },
    { transform: finalTransform }
  ], {
    duration: PANEL_POSITION_ANIMATION_MS,
    easing: 'cubic-bezier(0.2, 0, 0, 1)'
  });
  panelPositionAnimations.set(panel, animation);
  animation.addEventListener('finish', () => {
    if (panelPositionAnimations.get(panel) === animation) panelPositionAnimations.delete(panel);
  }, { once: true });
  animation.addEventListener('cancel', () => {
    if (panelPositionAnimations.get(panel) === animation) panelPositionAnimations.delete(panel);
  }, { once: true });
}

function shouldAnimateGamePanelPosition(
  panel: HTMLElement,
  before: DOMRect,
  after: DOMRect,
  deltaX: number,
  deltaY: number
): boolean {
  if (typeof panel.animate !== 'function') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  if (before.width <= 0 || before.height <= 0 || after.width <= 0 || after.height <= 0) return false;
  return Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1;
}

function cancelGamePanelPositionAnimation(panel: HTMLElement): void {
  const animation = panelPositionAnimations.get(panel);
  if (!animation) return;
  animation.cancel();
  panelPositionAnimations.delete(panel);
}

function animateGamePanelSizeChange(panel: HTMLElement, applySizeChange: () => void): void {
  const before = panel.getBoundingClientRect();
  cancelGamePanelSizeAnimation(panel);
  applySizeChange();
  const after = panel.getBoundingClientRect();
  if (!shouldAnimateGamePanelSize(panel, before, after)) return;

  const animation = panel.animate([
    {
      height: `${Math.round(before.height)}px`,
      width: `${Math.round(before.width)}px`
    },
    {
      height: `${Math.round(after.height)}px`,
      width: `${Math.round(after.width)}px`
    }
  ], {
    duration: PANEL_POSITION_ANIMATION_MS,
    easing: 'cubic-bezier(0.2, 0, 0, 1)'
  });
  panelSizeAnimations.set(panel, animation);
  animation.addEventListener('finish', () => {
    if (panelSizeAnimations.get(panel) === animation) panelSizeAnimations.delete(panel);
  }, { once: true });
  animation.addEventListener('cancel', () => {
    if (panelSizeAnimations.get(panel) === animation) panelSizeAnimations.delete(panel);
  }, { once: true });
}

function shouldAnimateGamePanelSize(panel: HTMLElement, before: DOMRect, after: DOMRect): boolean {
  if (typeof panel.animate !== 'function') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  if (before.width <= 0 || before.height <= 0 || after.width <= 0 || after.height <= 0) return false;
  return Math.abs(before.width - after.width) > 1 || Math.abs(before.height - after.height) > 1;
}

function cancelGamePanelSizeAnimation(panel: HTMLElement): void {
  const animation = panelSizeAnimations.get(panel);
  if (!animation) return;
  animation.cancel();
  panelSizeAnimations.delete(panel);
}

function anchorGamePanelAtRect(panel: HTMLElement, rect: DOMRect): void {
  cancelGamePanelPositionAnimation(panel);
  anchorFloatingPanelAtRect(panel, rect);
}

function anchorGamePanelAtPoint(panel: HTMLElement, left: number, top: number): void {
  cancelGamePanelPositionAnimation(panel);
  anchorFloatingPanelAtPoint(panel, left, top);
}

function wireGamePanelShellDrag({
  draggingClassName,
  header,
  panel,
  signal
}: {
  draggingClassName: string;
  header: HTMLElement;
  panel: HTMLElement;
  signal: AbortSignal;
}): void {
  wireFloatingPanelDrag({
    draggingClassName,
    handle: header,
    onDragStart: () => cancelGamePanelPositionAnimation(panel),
    panel,
    signal
  });
}

function anchorGamePanelPosition(panel: HTMLElement): void {
  anchorGamePanelAtRect(panel, panel.getBoundingClientRect());
}

function clampGamePanelPosition(panel: HTMLElement): void {
  cancelGamePanelPositionAnimation(panel);
  clampFloatingPanelToViewport(panel);
}
