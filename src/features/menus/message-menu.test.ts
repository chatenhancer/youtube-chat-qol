import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replyMocks = vi.hoisted(() => ({
  replyToMessage: vi.fn()
}));

const markedUserMocks = vi.hoisted(() => ({
  getMessageAuthorMarkTitle: vi.fn(() => 'Mark'),
  isMessageAuthorMarked: vi.fn(() => false),
  toggleMessageAuthorMark: vi.fn()
}));

vi.mock('../reply', () => replyMocks);
vi.mock('../marked-users', () => markedUserMocks);

import { BOOKMARK_FILLED_ICON_PATH, BOOKMARK_ICON_PATH, MATERIAL_ICON_VIEW_BOX } from '../../shared/icons';
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
    markedUserMocks.getMessageAuthorMarkTitle.mockReturnValue('Mark');
    markedUserMocks.isMessageAuthorMarked.mockReturnValue(false);
    markedUserMocks.toggleMessageAuthorMark.mockClear();
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

  it('injects mark plus split quote and mention actions that target the active message', () => {
    const message = createChatMessage();
    const menu = createContextMenu();
    document.body.append(message, menu);
    wireMessageContext(message);
    message.querySelector<HTMLElement>('#menu')!.click();

    enhanceMessageContextMenu(menu);
    const items = menu.querySelectorAll<HTMLElement>('.ytcq-context-item');

    expect(items).toHaveLength(2);
    expect(items[0].getAttribute('data-ytcq-action')).toBe('mark-user');
    expect(items[0].querySelector('.ytcq-menu-label')?.textContent).toBe('Mark');
    expect(items[0].title).toBe('Mark');
    expect(items[0].querySelector('svg')?.getAttribute('viewBox')).toBe(MATERIAL_ICON_VIEW_BOX);
    expect(items[0].querySelector('path')?.getAttribute('d')).toBe(BOOKMARK_ICON_PATH);
    expect(items[1].getAttribute('data-ytcq-action')).toBe('reply-actions');
    expect(items[1].querySelector('.ytcq-context-split-row')?.getAttribute('aria-label')).toBe('Mention / Quote');
    expect([...items[1].querySelectorAll<HTMLElement>('.ytcq-context-split-button')].map((button) => {
      return button.getAttribute('data-ytcq-action');
    })).toEqual(['mention', 'quote']);
    expect(items[1].querySelector('[data-ytcq-action="quote"]')?.getAttribute('aria-label')).toBe('Quote');
    expect(items[1].querySelector('[data-ytcq-action="mention"]')?.getAttribute('aria-label')).toBe('Mention');

    items[0].click();
    items[1].querySelector<HTMLElement>('[data-ytcq-action="quote"]')!.click();
    items[1].querySelector<HTMLElement>('[data-ytcq-action="mention"]')!.click();

    expect(markedUserMocks.toggleMessageAuthorMark).toHaveBeenCalledWith(message);
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

  it('does not toggle marks when no active connected message is available', () => {
    const menu = createContextMenu();
    document.body.append(menu);

    enhanceMessageContextMenu(menu);
    menu.querySelector<HTMLElement>('[data-ytcq-action="mark-user"]')!.click();

    expect(markedUserMocks.toggleMessageAuthorMark).not.toHaveBeenCalled();
  });

  it('shows the unmark label when the active message author is already marked', () => {
    markedUserMocks.isMessageAuthorMarked.mockReturnValue(true);
    markedUserMocks.getMessageAuthorMarkTitle.mockReturnValue('Unmark\nNov 14, 2023, 10:13 PM\nExample Stream');
    const message = createChatMessage();
    const menu = createContextMenu();
    document.body.append(message, menu);
    wireMessageContext(message);
    message.querySelector<HTMLElement>('#menu')!.click();

    enhanceMessageContextMenu(menu);

    expect(menu.querySelector('[data-ytcq-action="mark-user"] .ytcq-menu-label')?.textContent).toBe('Unmark');
    expect(menu.querySelector<HTMLElement>('[data-ytcq-action="mark-user"]')?.title).toContain('Example Stream');
    expect(menu.querySelector('[data-ytcq-action="mark-user"] path')?.getAttribute('d')).toBe(BOOKMARK_FILLED_ICON_PATH);
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
