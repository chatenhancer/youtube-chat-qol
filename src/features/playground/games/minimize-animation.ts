const GAME_MINIMIZE_ANIMATION_MS = 360;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Leaves a short-lived visual copy behind while the real game surface closes.
 * The copy keeps panel teardown synchronous and cannot interfere with a game
 * that is resumed before the animation finishes.
 */
export function animateGameSurfaceToGamesButton(surface: HTMLElement): boolean {
  if (window.matchMedia?.(REDUCED_MOTION_QUERY).matches) return false;

  const surfaceRect = surface.getBoundingClientRect();
  if (!isVisibleRect(surfaceRect)) return false;

  const target = findVisibleGamesButton();
  if (!target) return false;
  const targetRect = target.getBoundingClientRect();

  const ghost = surface.cloneNode(true) as HTMLElement;
  if (typeof ghost.animate !== 'function') return false;

  prepareAnimationGhost(ghost, surfaceRect);
  copyCanvasFrames(surface, ghost);
  document.body.append(ghost);

  const deltaX = getRectCenterX(targetRect) - getRectCenterX(surfaceRect);
  const deltaY = getRectCenterY(targetRect) - getRectCenterY(surfaceRect);
  const targetScale = Math.max(
    0.001,
    Math.min(0.16, targetRect.width / surfaceRect.width, targetRect.height / surfaceRect.height)
  );
  const middleScale = Math.min(0.5, Math.max(0.28, targetScale * 2.8));

  try {
    const animation = ghost.animate(
      [
        {
          opacity: 1,
          transform: 'translate3d(0, 0, 0) scale(1)'
        },
        {
          offset: 0.72,
          opacity: 0.72,
          transform: `translate3d(${deltaX * 0.78}px, ${deltaY * 0.78}px, 0) scale(${middleScale})`
        },
        {
          opacity: 0,
          transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${targetScale})`
        }
      ],
      {
        duration: GAME_MINIMIZE_ANIMATION_MS,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'forwards'
      }
    );
    const removeGhost = (): void => ghost.remove();
    animation.addEventListener('finish', removeGhost, { once: true });
    animation.addEventListener('cancel', removeGhost, { once: true });
  } catch {
    ghost.remove();
    return false;
  }

  return true;
}

function findVisibleGamesButton(): HTMLButtonElement | null {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.ytcq-games-button');
  for (const button of buttons) {
    if (button.isConnected && isVisibleRect(button.getBoundingClientRect())) return button;
  }
  return null;
}

function prepareAnimationGhost(ghost: HTMLElement, rect: DOMRect): void {
  ghost.classList.add('ytcq-game-minimize-ghost');
  ghost.dataset.ytcqGameMinimizeGhost = 'true';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  ghost.removeAttribute('id');
  ghost.querySelectorAll<HTMLElement>('[id]').forEach((element) => element.removeAttribute('id'));
  Object.assign(ghost.style, {
    animation: 'none',
    bottom: 'auto',
    height: `${rect.height}px`,
    left: `${rect.left}px`,
    margin: '0',
    pointerEvents: 'none',
    position: 'fixed',
    right: 'auto',
    top: `${rect.top}px`,
    transform: 'none',
    transformOrigin: 'center center',
    width: `${rect.width}px`,
    willChange: 'transform, opacity',
    zIndex: '2147483647'
  });
}

function copyCanvasFrames(source: HTMLElement, ghost: HTMLElement): void {
  const sourceCanvases = source.querySelectorAll<HTMLCanvasElement>('canvas');
  const ghostCanvases = ghost.querySelectorAll<HTMLCanvasElement>('canvas');
  sourceCanvases.forEach((canvas, index) => {
    const ghostCanvas = ghostCanvases[index];
    if (!ghostCanvas) return;
    try {
      ghostCanvas.getContext('2d')?.drawImage(canvas, 0, 0);
    } catch {
      // The rest of the surface still provides a useful transition if a canvas cannot be copied.
    }
  });
}

function getRectCenterX(rect: DOMRect): number {
  return rect.left + rect.width / 2;
}

function getRectCenterY(rect: DOMRect): number {
  return rect.top + rect.height / 2;
}

function isVisibleRect(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0 &&
    Number.isFinite(rect.left) && Number.isFinite(rect.top);
}
