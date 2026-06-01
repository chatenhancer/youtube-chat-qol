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
