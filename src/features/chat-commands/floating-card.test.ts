import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFloatingCardCloseButton,
  positionFloatingCardAboveInput
} from './floating-card';

vi.mock('../../youtube/chat-input', () => ({
  findChatInput: vi.fn(() => document.querySelector('[data-chat-input]'))
}));

describe('chat command floating card helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('positions cards above the chat input when possible', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });
    const input = elementWithRect({ left: 320, top: 340, width: 120, height: 40 });
    input.dataset.chatInput = 'true';
    const card = elementWithRect({ left: 0, top: 0, width: 140, height: 100 });
    document.body.append(input, card);

    positionFloatingCardAboveInput(card);

    expect(card.style.left).toBe('320px');
    expect(card.style.top).toBe('232px');
  });

  it('falls back to bottom-right placement without an input', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });
    const card = elementWithRect({ left: 0, top: 0, width: 140, height: 100 });

    positionFloatingCardAboveInput(card);

    expect(card.style.left).toBe('352px');
    expect(card.style.top).toBe('292px');
  });

  it('creates close buttons that call their handler', () => {
    const onClick = vi.fn();

    const button = createFloatingCardCloseButton(onClick);
    button.click();

    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Close');
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

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
