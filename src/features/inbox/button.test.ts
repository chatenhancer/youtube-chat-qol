import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupStaleInboxButtons, refreshInboxSurfaces, scheduleInboxButtonWire, wireInboxButton } from './button';

describe('inbox header button', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanupStaleInboxButtons();
  });

  it('inserts the inbox button before the native menu anchor and toggles from clicks', () => {
    const onToggle = vi.fn();
    const header = createHeader();
    document.body.append(header);

    wireInboxButton({
      getUnreadCount: () => 0,
      onToggle
    });

    const button = header.querySelector<HTMLButtonElement>('.ytcq-inbox-button')!;
    expect(button).not.toBeNull();
    expect(button.nextElementSibling?.id).toBe('live-chat-header-context-menu');

    button.click();
    expect(onToggle).toHaveBeenCalledWith(button);
  });

  it('refreshes unread badge, icon state, and aria label', () => {
    let unread = 3;
    const header = createHeader();
    document.body.append(header);

    wireInboxButton({
      getUnreadCount: () => unread,
      onToggle: vi.fn()
    });

    const button = header.querySelector<HTMLButtonElement>('.ytcq-inbox-button')!;
    expect(button.classList.contains('ytcq-inbox-button-has-unread')).toBe(true);
    expect(button.querySelector('.ytcq-inbox-badge')?.textContent).toBe('3');
    expect(button.getAttribute('aria-label')).toBe('Inbox, 3 unread');

    unread = 0;
    refreshInboxSurfaces(() => unread);

    expect(button.classList.contains('ytcq-inbox-button-has-unread')).toBe(false);
    expect(button.querySelector<HTMLElement>('.ytcq-inbox-badge')?.hidden).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('Inbox');
  });

  it('schedules inbox wiring once and does nothing when no header exists', async () => {
    const onToggle = vi.fn();

    scheduleInboxButtonWire({ getUnreadCount: () => 0, onToggle });
    scheduleInboxButtonWire({ getUnreadCount: () => 0, onToggle });
    await vi.runOnlyPendingTimersAsync();
    expect(document.querySelector('.ytcq-inbox-button')).toBeNull();

    document.body.append(createHeader());
    scheduleInboxButtonWire({ getUnreadCount: () => 0, onToggle });
    await vi.runOnlyPendingTimersAsync();
    expect(document.querySelector('.ytcq-inbox-button')).not.toBeNull();
  });

  it('reuses this content script button and replaces stale owner buttons', () => {
    const header = createHeader();
    document.body.append(header);

    wireInboxButton({ getUnreadCount: () => 1, onToggle: vi.fn() });
    const button = header.querySelector<HTMLButtonElement>('.ytcq-inbox-button')!;
    wireInboxButton({ getUnreadCount: () => 100, onToggle: vi.fn() });
    expect(header.querySelector('.ytcq-inbox-button')).toBe(button);
    expect(button.querySelector('.ytcq-inbox-badge')?.textContent).toBe('99+');

    button.dataset.ytcqInboxOwner = 'old-owner';
    wireInboxButton({ getUnreadCount: () => 0, onToggle: vi.fn() });
    expect(header.querySelector('.ytcq-inbox-button')).not.toBe(button);
  });

  it('places the inbox button before supported native header anchors', () => {
    const nestedHeader = document.createElement('yt-live-chat-header-renderer');
    const wrapper = document.createElement('span');
    const more = document.createElement('button');
    more.setAttribute('aria-label', 'More options');
    wrapper.append(more);
    nestedHeader.append(wrapper);
    document.body.append(nestedHeader);
    wireInboxButton({ getUnreadCount: () => 0, onToggle: vi.fn() });
    expect(nestedHeader.firstElementChild?.classList.contains('ytcq-inbox-button')).toBe(true);

    cleanupStaleInboxButtons();
    document.body.replaceChildren();
    const titleHeader = document.createElement('yt-live-chat-header-renderer');
    const titleMore = document.createElement('button');
    titleMore.title = 'More options';
    titleHeader.append(titleMore);
    document.body.append(titleHeader);
    wireInboxButton({ getUnreadCount: () => 0, onToggle: vi.fn() });
    expect(titleHeader.firstElementChild?.classList.contains('ytcq-inbox-button')).toBe(true);

    cleanupStaleInboxButtons();
    document.body.replaceChildren();
    const closeHeader = document.createElement('yt-live-chat-header-renderer');
    const close = document.createElement('button');
    close.id = 'close-button';
    closeHeader.append(close);
    document.body.append(closeHeader);
    wireInboxButton({ getUnreadCount: () => 0, onToggle: vi.fn() });
    expect(closeHeader.firstElementChild?.classList.contains('ytcq-inbox-button')).toBe(true);
  });

  it('appends the inbox button when no native anchor is available', () => {
    const header = document.createElement('yt-live-chat-header-renderer');
    document.body.append(header);

    wireInboxButton({ getUnreadCount: () => 0, onToggle: vi.fn() });

    expect(header.lastElementChild?.classList.contains('ytcq-inbox-button')).toBe(true);
  });

  it('removes stale inbox buttons during cleanup', () => {
    const header = createHeader();
    document.body.append(header);
    wireInboxButton({ getUnreadCount: () => 0, onToggle: vi.fn() });

    cleanupStaleInboxButtons();

    expect(document.querySelector('.ytcq-inbox-button')).toBeNull();
  });
});

function createHeader(): HTMLElement {
  const header = document.createElement('yt-live-chat-header-renderer');
  const menu = document.createElement('div');
  menu.id = 'live-chat-header-context-menu';
  header.append(menu);
  return header;
}
