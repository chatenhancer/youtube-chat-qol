import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replyMocks = vi.hoisted(() => ({
  replyToMessage: vi.fn()
}));

vi.mock('../reply', () => replyMocks);

import {
  dispatchYouTubeChatContextMenuResult,
  parseYouTubeChatContextMenuRequest,
  YOUTUBE_CHAT_CONTEXT_MENU_REQUEST_EVENT
} from '../../youtube/chat-feed/context-menu';
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

  it('keeps Save out of the menu and injects split reply actions for the active message', () => {
    const message = createChatMessage();
    const menu = createContextMenu();
    document.body.append(message, menu);
    wireMessageContext(message);
    message.querySelector<HTMLElement>('#menu')!.click();

    enhanceMessageContextMenu(menu);
    const items = menu.querySelectorAll<HTMLElement>('.ytcq-context-item');

    expect(items).toHaveLength(1);
    expect(menu.querySelector('[data-ytcq-action="save-message"]')).toBeNull();
    expect(items[0].getAttribute('data-ytcq-action')).toBe('reply-actions');
    expect(items[0].querySelector('.ytcq-context-split-row')?.getAttribute('aria-label')).toBe('Mention / Quote');
    expect([...items[0].querySelectorAll<HTMLElement>('.ytcq-context-split-button')].map((button) => {
      return button.getAttribute('data-ytcq-action');
    })).toEqual(['mention', 'quote']);
    expect(items[0].querySelector('[data-ytcq-action="quote"]')?.getAttribute('aria-label')).toBe('Quote');
    expect(items[0].querySelector('[data-ytcq-action="mention"]')?.getAttribute('aria-label')).toBe('Mention');

    items[0].querySelector<HTMLElement>('[data-ytcq-action="quote"]')!.click();
    items[0].querySelector<HTMLElement>('[data-ytcq-action="mention"]')!.click();

    expect(replyMocks.replyToMessage).toHaveBeenNthCalledWith(1, message, { quote: true });
    expect(replyMocks.replyToMessage).toHaveBeenNthCalledWith(2, message, { quote: false });
  });

  it('supports keyboard activation on split reply actions', () => {
    const message = createChatMessage();
    const menu = createContextMenu();
    document.body.append(message, menu);
    wireMessageContext(message);
    message.querySelector<HTMLElement>('#menu')!.click();

    enhanceMessageContextMenu(menu);
    const mention = menu.querySelector<HTMLElement>('[data-ytcq-action="mention"]')!;
    const quote = menu.querySelector<HTMLElement>('[data-ytcq-action="quote"]')!;
    mention.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      key: 'Escape'
    }));
    mention.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      key: 'Enter'
    }));
    quote.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      key: ' '
    }));

    expect(replyMocks.replyToMessage).toHaveBeenNthCalledWith(1, message, { quote: false });
    expect(replyMocks.replyToMessage).toHaveBeenNthCalledWith(2, message, { quote: true });
  });

  it('uses YouTube native Lite actions when the page owns an endpoint', () => {
    const message = createLiteChatMessage();
    message.dataset.messageId = 'native-lite-message';
    document.body.append(message);
    wireMessageContext(message);
    const button = message.querySelector<HTMLButtonElement>('button')!;
    button.getBoundingClientRect = () => rect({
      bottom: 240,
      height: 28,
      left: 410,
      right: 438,
      top: 212,
      width: 28
    });
    let requestId = '';
    let requestPoint = { x: 0, y: 0 };
    const pageListener = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const request = parseYouTubeChatContextMenuRequest(event.detail);
      if (!request) return;
      requestId = request.requestId;
      requestPoint = { x: request.x, y: request.y };
      dispatchYouTubeChatContextMenuResult(requestId, 'opening');
    };
    window.addEventListener(YOUTUBE_CHAT_CONTEXT_MENU_REQUEST_EVENT, pageListener);

    message
      .querySelector<HTMLElement>('#message')!
      .dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        clientX: 120,
        clientY: 150
      }));

    expect(requestId).not.toBe('');
    expect(requestPoint).toEqual({ x: 438, y: 240 });
    expect(document.querySelector('[data-ytcq-action="save-message"]')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('true');

    message.remove();
    const nativeMenu = createContextMenu();
    document.body.append(nativeMenu);
    enhanceMessageContextMenu(nativeMenu);
    nativeMenu.querySelector<HTMLElement>('[data-ytcq-action="quote"]')!.click();

    const target = replyMocks.replyToMessage.mock.calls[0]?.[0] as HTMLElement;
    expect(target.dataset.messageId).toBe('native-lite-message');
    expect(replyMocks.replyToMessage).toHaveBeenCalledWith(target, { quote: true });

    dispatchYouTubeChatContextMenuResult(requestId, 'closed');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    window.removeEventListener(YOUTUBE_CHAT_CONTEXT_MENU_REQUEST_EVENT, pageListener);
  });

  it('delegates Lite menu interactions once per renderer root', () => {
    const root = document.createElement('section');
    root.className = 'ytcq-lite-root';
    const first = createLiteChatMessage();
    const second = createLiteChatMessage();
    first.dataset.messageId = 'lite-message-1';
    second.dataset.messageId = 'lite-message-2';
    root.append(first, second);
    document.body.append(root);
    const addEventListener = vi.spyOn(root, 'addEventListener');
    const requestedMessageIds: string[] = [];
    const pageListener = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const request = parseYouTubeChatContextMenuRequest(event.detail);
      if (request) requestedMessageIds.push(request.messageId);
    };
    window.addEventListener(YOUTUBE_CHAT_CONTEXT_MENU_REQUEST_EVENT, pageListener);

    wireMessageContext(first, { record: createMessageRecord('lite-message-1') });
    wireMessageContext(second, { record: createMessageRecord('lite-message-2') });
    first.querySelector<HTMLButtonElement>('.ytcq-lite-message-menu-button')!.click();
    second.querySelector<HTMLButtonElement>('.ytcq-lite-message-menu-button')!.click();

    expect(requestedMessageIds).toEqual(['lite-message-1', 'lite-message-2']);
    expect(addEventListener).toHaveBeenCalledTimes(3);
    expect(first.dataset.ytcqContextWired).toBeUndefined();
    expect(second.dataset.ytcqContextWired).toBeUndefined();
    window.removeEventListener(YOUTUBE_CHAT_CONTEXT_MENU_REQUEST_EVENT, pageListener);
  });

  it('does not create a fallback menu when YouTube has no endpoint', () => {
    const message = createLiteChatMessage();
    message.dataset.messageId = 'missing-native-message';
    document.body.append(message);
    wireMessageContext(message);

    message
      .querySelector<HTMLElement>('#message')!
      .dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        clientX: 120,
        clientY: 150
      }));

    expect(document.querySelector('[data-ytcq-action]')).toBeNull();
    expect(message.querySelector('button')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not duplicate injected menu items and removes stale wiring on cleanup', () => {
    const message = createChatMessage();
    const menu = createContextMenu();
    document.body.append(message, menu);
    wireMessageContext(message);
    message.querySelector<HTMLElement>('#menu')!.click();

    enhanceMessageContextMenu(menu);
    enhanceMessageContextMenu(menu);
    expect(menu.querySelectorAll('.ytcq-context-item')).toHaveLength(1);

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
    menu.querySelector<HTMLElement>('[data-ytcq-action="quote"]')!.click();

    expect(replyMocks.replyToMessage).not.toHaveBeenCalled();
  });

  it('clamps overflowing context menus within the chat viewport', async () => {
    vi.useFakeTimers();
    const app = document.createElement('yt-live-chat-app');
    const menu = createContextMenu();
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
    expect(menu.style.width).toBe('');
    expect(menu.style.minWidth).toBe('');
    expect(menu.style.maxWidth).toBe('');
    expect(menu.style.getPropertyValue('--ytcq-context-shift-y')).toBe('-78px');
  });

  it('clears native inline width caps that crop message context menu labels', () => {
    const menu = createContextMenu();
    menu.style.width = '129.562px';
    menu.style.minWidth = '129.562px';
    menu.style.maxWidth = '129.562px';
    document.body.append(menu);

    enhanceMessageContextMenu(menu);

    expect(menu.classList.contains('ytcq-context-expanded-menu')).toBe(true);
    expect(menu.style.width).toBe('');
    expect(menu.style.minWidth).toBe('');
    expect(menu.style.maxWidth).toBe('');
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

  it('keeps the native menu rectangle when item children are not measurable', async () => {
    vi.useFakeTimers();
    const menu = createContextMenu();
    document.body.append(menu);
    menu.getBoundingClientRect = () => rect({ bottom: 80, height: 80, top: 0, width: 200 });
    menu.querySelector<HTMLElement>('#items')!.firstElementChild!.getBoundingClientRect = () => rect({
      bottom: 0,
      height: 0,
      top: 0,
      width: 0
    });

    enhanceMessageContextMenu(menu);
    await vi.runAllTimersAsync();

    expect(menu.style.getPropertyValue('--ytcq-context-shift-y')).toBe('8px');
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

function createLiteChatMessage(): HTMLElement {
  const message = document.createElement('article');
  message.className = 'ytcq-lite-message';
  message.innerHTML = `
    <span id="menu">
      <button
        type="button"
        class="ytcq-lite-message-menu-button"
        aria-haspopup="menu"
        aria-expanded="false"
      ></button>
    </span>
    <span id="author-name">@ViewerOne</span>
    <span id="message">hello chat</span>
  `;
  return message;
}

function createMessageRecord(id: string) {
  return {
    id,
    kind: 'text' as const,
    plainText: 'hello chat',
    runs: []
  };
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
