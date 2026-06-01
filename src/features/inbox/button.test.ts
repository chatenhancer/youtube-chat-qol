import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupStaleInboxButtons, refreshInboxSurfaces, wireInboxButton } from './button';

describe('inbox header button', () => {
  beforeEach(() => {
    document.body.replaceChildren();
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
