import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  keepProfileCardInViewport,
  positionProfileCard
} from './positioning';

describe('profile card positioning', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('places profile cards beside the clicked avatar when space is available', () => {
    setViewport(500, 400);
    const anchor = elementWithRect({ left: 100, top: 40, width: 32, height: 32 });
    const card = elementWithRect({ left: 0, top: 0, width: 240, height: 180 });

    positionProfileCard(card, anchor);

    expect(card.style.left).toBe('140px');
    expect(card.style.top).toBe('40px');
  });

  it('flips left and up when the card would overflow the viewport', () => {
    setViewport(360, 260);
    const anchor = elementWithRect({ left: 310, top: 220, width: 32, height: 32 });
    const card = elementWithRect({ left: 0, top: 0, width: 180, height: 120 });

    positionProfileCard(card, anchor);

    expect(card.style.left).toBe('122px');
    expect(card.style.top).toBe('132px');
  });

  it('keeps cards in view after their rendered content changes size', () => {
    setViewport(360, 260);
    const card = elementWithRect({ left: 250, top: 230, width: 140, height: 80 });

    keepProfileCardInViewport(card);

    expect(card.style.left).toBe('212px');
    expect(card.style.top).toBe('172px');
  });
});

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function elementWithRect(rectangle: {
  left: number;
  top: number;
  width: number;
  height: number;
}): HTMLElement {
  const element = document.createElement('div');
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect(rectangle));
  return element;
}

function rect({
  left,
  top,
  width,
  height
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({})
  } as DOMRect;
}
