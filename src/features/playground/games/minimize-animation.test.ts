import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { animateGameSurfaceToGamesButton } from './minimize-animation';

const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

describe('game minimize animation', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    restoreProperty(HTMLElement.prototype, 'animate', originalAnimate);
    restoreProperty(window, 'matchMedia', originalMatchMedia);
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('animates a non-interactive copy of the game surface into the visible Games button', () => {
    const listeners = new Map<string, EventListenerOrEventListenerObject>();
    const animation = {
      addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.set(type, listener);
      })
    } as unknown as Animation;
    const animate = vi.fn(() => animation);
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animate
    });

    const surface = document.createElement('section');
    surface.className = 'ytcq-game-panel ytcq-chess-game-panel';
    const nestedId = document.createElement('div');
    nestedId.id = 'game-status';
    surface.append(nestedId);
    const gamesButton = document.createElement('button');
    gamesButton.className = 'ytcq-games-button';
    document.body.append(surface, gamesButton);
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(createRect({
      height: 200,
      left: 100,
      top: 200,
      width: 300
    }));
    vi.spyOn(gamesButton, 'getBoundingClientRect').mockReturnValue(createRect({
      height: 32,
      left: 20,
      top: 10,
      width: 32
    }));

    expect(animateGameSurfaceToGamesButton(surface)).toBe(true);

    const ghost = document.querySelector<HTMLElement>('.ytcq-game-minimize-ghost');
    expect(ghost).not.toBeNull();
    expect(ghost).not.toBe(surface);
    expect(ghost?.dataset.ytcqGameMinimizeGhost).toBe('true');
    expect(ghost?.getAttribute('aria-hidden')).toBe('true');
    expect(ghost?.hasAttribute('inert')).toBe(true);
    expect(ghost?.querySelector('#game-status')).toBeNull();
    expect(ghost?.style.left).toBe('100px');
    expect(ghost?.style.top).toBe('200px');
    expect(ghost?.style.width).toBe('300px');
    expect(ghost?.style.height).toBe('200px');
    expect(surface.isConnected).toBe(true);

    const [keyframes, options] = animate.mock.calls[0] as unknown as [
      Keyframe[],
      KeyframeAnimationOptions
    ];
    expect(keyframes[2].transform).toContain('translate3d(-214px, -274px, 0)');
    expect(keyframes[2].transform).toContain('scale(0.1066');
    expect(keyframes[2].opacity).toBe(0);
    expect(options).toEqual({
      duration: 360,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'forwards'
    });

    dispatchAnimationEvent(listeners.get('finish'), 'finish');
    expect(document.querySelector('.ytcq-game-minimize-ghost')).toBeNull();
  });

  it('closes without a transition when reduced motion is requested', () => {
    const animate = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animate
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: true }))
    });

    const surface = document.createElement('section');
    const gamesButton = document.createElement('button');
    gamesButton.className = 'ytcq-games-button';
    document.body.append(surface, gamesButton);
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(createRect({
      height: 200,
      left: 100,
      top: 200,
      width: 300
    }));
    vi.spyOn(gamesButton, 'getBoundingClientRect').mockReturnValue(createRect({
      height: 32,
      left: 20,
      top: 10,
      width: 32
    }));

    expect(animateGameSurfaceToGamesButton(surface)).toBe(false);
    expect(animate).not.toHaveBeenCalled();
    expect(document.querySelector('.ytcq-game-minimize-ghost')).toBeNull();
  });
});

function createRect({
  height,
  left,
  top,
  width
}: {
  height: number;
  left: number;
  top: number;
  width: number;
}): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top
  };
}

function dispatchAnimationEvent(
  listener: EventListenerOrEventListenerObject | undefined,
  type: string
): void {
  const event = new Event(type);
  if (typeof listener === 'function') listener(event);
  else listener?.handleEvent(event);
}

function restoreProperty(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) Object.defineProperty(target, property, descriptor);
  else Reflect.deleteProperty(target, property);
}
