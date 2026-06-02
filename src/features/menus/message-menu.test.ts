import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replyMocks = vi.hoisted(() => ({
  replyToMessage: vi.fn()
}));

vi.mock('../reply', () => replyMocks);

import {
  cleanupStaleMessageMenuSurfaces,
  enhanceMessageContextMenu,
  handleMessageMenuActivation,
  isRecentActiveContextMessage,
  wireMessageContext
} from './message-menu';

describe('message context menu integration', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    replyMocks.replyToMessage.mockClear();
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
  });

  afterEach(() => {
    cleanupStaleMessageMenuSurfaces();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('tracks the active chat message from native menu interactions', () => {
    const message = createChatMessage();
    document.body.append(message);

    wireMessageContext(message);
    message.querySelector<HTMLElement>('#menu')!.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true
    }));

    expect(isRecentActiveContextMessage()).toBe(true);
    expect(message.dataset.ytcqContextWired).toBe('true');
    expect(message.querySelector<HTMLElement>('#menu')!.dataset.ytcqContextWired).toBe('true');
  });

  it('tracks a message when activation starts from any element inside the renderer', () => {
    const message = createChatMessage();
    document.body.append(message);

    handleMessageMenuActivation(new MouseEvent('click', {
      bubbles: true
    }));
    expect(isRecentActiveContextMessage()).toBe(false);

    const activationEvent = new MouseEvent('click', {
      bubbles: true
    });
    message.querySelector<HTMLElement>('#message')!.dispatchEvent(activationEvent);
    handleMessageMenuActivation(activationEvent);
    expect(isRecentActiveContextMessage()).toBe(true);
  });

  it('injects quote and mention items that target the active message', () => {
    const message = createChatMessage();
    const menu = createContextMenu();
    document.body.append(message, menu);
    wireMessageContext(message);
    message.querySelector<HTMLElement>('#menu')!.click();

    enhanceMessageContextMenu(menu);
    const items = menu.querySelectorAll<HTMLElement>('.ytcq-context-item');

    expect(items).toHaveLength(2);
    expect(items[0].getAttribute('data-ytcq-action')).toBe('quote');
    expect(items[0].querySelector('.ytcq-menu-label')?.textContent).toBe('Quote');
    expect(items[1].getAttribute('data-ytcq-action')).toBe('mention');
    expect(items[1].querySelector('.ytcq-menu-label')?.textContent).toBe('Mention');

    items[0].click();
    items[1].click();

    expect(replyMocks.replyToMessage).toHaveBeenNthCalledWith(1, message, { quote: true });
    expect(replyMocks.replyToMessage).toHaveBeenNthCalledWith(2, message, { quote: false });
  });

  it('does not duplicate injected menu items and removes stale wiring on cleanup', () => {
    const message = createChatMessage();
    const menu = createContextMenu();
    document.body.append(message, menu);
    wireMessageContext(message);
    message.querySelector<HTMLElement>('#menu')!.click();

    enhanceMessageContextMenu(menu);
    enhanceMessageContextMenu(menu);
    expect(menu.querySelectorAll('.ytcq-context-item')).toHaveLength(2);

    cleanupStaleMessageMenuSurfaces();

    expect(menu.querySelectorAll('.ytcq-context-item')).toHaveLength(0);
    expect(message.hasAttribute('data-ytcq-context-wired')).toBe(false);
    expect(message.querySelector('#menu')?.hasAttribute('data-ytcq-context-wired')).toBe(false);
    expect(isRecentActiveContextMessage()).toBe(false);
  });

  it('clears stale message wiring when YouTube temporarily removes the native menu', () => {
    const message = createChatMessage();
    document.body.append(message);
    wireMessageContext(message);
    message.querySelector('#menu')?.remove();

    wireMessageContext(message);

    expect(message.hasAttribute('data-ytcq-context-wired')).toBe(false);
  });

  it('ignores context menus without item lists', () => {
    const menu = document.createElement('ytd-menu-popup-renderer');

    enhanceMessageContextMenu(menu);

    expect(menu.querySelector('.ytcq-context-item')).toBeNull();
  });

  it('does not reply when the active message has gone stale or disconnected', () => {
    const message = createChatMessage();
    const menu = createContextMenu();
    document.body.append(message, menu);
    wireMessageContext(message);
    message.querySelector<HTMLElement>('#menu')!.click();
    vi.spyOn(Date, 'now').mockReturnValue(4_000);
    expect(isRecentActiveContextMessage()).toBe(false);

    message.remove();
    enhanceMessageContextMenu(menu);
    menu.querySelector<HTMLElement>('.ytcq-context-item')!.click();

    expect(replyMocks.replyToMessage).not.toHaveBeenCalled();
  });

  it('clamps overflowing context menus within the chat viewport', async () => {
    vi.useFakeTimers();
    const app = document.createElement('yt-live-chat-app');
    const menu = createContextMenu();
    menu.classList.add('ytcq-expanded-menu');
    menu.style.width = '300px';
    menu.style.minWidth = '300px';
    menu.style.maxWidth = '300px';
    app.append(menu);
    document.body.append(app);
    app.getBoundingClientRect = () => rect({ bottom: 180, height: 180, top: 0 });
    menu.getBoundingClientRect = () => rect({ bottom: 240, height: 80, top: 160, width: 200 });
    menu.querySelector<HTMLElement>('#items')!.firstElementChild!.getBoundingClientRect = () => rect({
      bottom: 250,
      height: 50,
      top: 200,
      width: 160
    });

    enhanceMessageContextMenu(menu);
    await vi.runAllTimersAsync();

    expect(menu.classList.contains('ytcq-context-expanded-menu')).toBe(true);
    expect(menu.classList.contains('ytcq-expanded-menu')).toBe(false);
    expect(menu.style.width).toBe('');
    expect(menu.style.getPropertyValue('--ytcq-context-shift-y')).toBe('-78px');
  });

  it('shifts context menus down when they overflow the top boundary', async () => {
    vi.useFakeTimers();
    const menu = createContextMenu();
    document.body.append(menu);
    menu.getBoundingClientRect = () => rect({ bottom: 30, height: 80, top: -50, width: 200 });
    menu.querySelector<HTMLElement>('#items')!.firstElementChild!.getBoundingClientRect = () => rect({
      bottom: 20,
      height: 50,
      top: -30,
      width: 160
    });

    enhanceMessageContextMenu(menu);
    await vi.runAllTimersAsync();

    expect(menu.style.getPropertyValue('--ytcq-context-shift-y')).toBe('58px');
  });
});

function createChatMessage(): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer');
  message.innerHTML = `
    <button id="menu"></button>
    <span id="author-name">@ViewerOne</span>
    <span id="message">hello chat</span>
  `;
  return message;
}

function createContextMenu(): HTMLElement {
  const menu = document.createElement('ytd-menu-popup-renderer');
  menu.innerHTML = `
    <div id="items">
      <ytd-menu-service-item-renderer></ytd-menu-service-item-renderer>
    </div>
  `;
  return menu;
}

function rect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...overrides
  } as DOMRect;
}
