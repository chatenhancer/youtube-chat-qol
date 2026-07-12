import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOKMARK_FILLED_ICON_PATH,
  BOOKMARK_ICON_PATH,
  MATERIAL_ICON_VIEW_BOX
} from '../../shared/icons';

describe('marked users', () => {
  beforeEach(async () => {
    document.body.replaceChildren();
    document.title = '';
    window.history.replaceState({}, '', '/');
    await chrome.storage.local.clear();
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('persists global user marks and applies deterministic avatar rings', async () => {
    const markedUsers = await import('./index');
    markedUsers.initMarkedUsers();
    await Promise.resolve();

    const avatar = document.createElement('span');
    document.body.append(avatar);
    markedUsers.applyMarkedUserRing(avatar, { authorName: '@ViewerOne', channelId: 'viewer-channel' });
    expect(avatar.classList.contains('ytcq-marked-user-avatar')).toBe(false);

    await markedUsers.toggleMarkedUser({ authorName: '@ViewerOne', channelId: 'viewer-channel' });
    expect(markedUsers.isMarkedUser({ authorName: '@ViewerOne', channelId: 'viewer-channel' })).toBe(true);
    expect(avatar.classList.contains('ytcq-marked-user-avatar')).toBe(true);
    expect(avatar.style.getPropertyValue('--ytcq-marked-user-color')).toBe(markedUsers.getMarkedUserColor({ authorName: '@ViewerOne' }));

    await expect(chrome.storage.local.get(markedUsers.MARKED_USERS_STORAGE_KEY)).resolves.toEqual({
      [markedUsers.MARKED_USERS_STORAGE_KEY]: {
        'channel:viewer-channel': {
          authorName: '@ViewerOne',
          channelId: 'viewer-channel',
          markedAt: expect.any(Number),
          markedSourceTitle: undefined,
          markedSourceUrl: expect.any(String)
        }
      }
    });
  });

  it('treats native handle and Lite channel identities as the same bookmark', async () => {
    const markedUsers = await import('./index');
    markedUsers.initMarkedUsers();
    await Promise.resolve();

    const nativeAvatar = document.createElement('span');
    const liteAvatar = document.createElement('span');
    document.body.append(nativeAvatar, liteAvatar);
    markedUsers.applyMarkedUserRing(nativeAvatar, { authorName: '@ViewerOne' });
    markedUsers.applyMarkedUserRing(liteAvatar, {
      authorName: '@ViewerOne',
      channelId: 'viewer-channel'
    });

    await markedUsers.toggleMarkedUser({ authorName: '@ViewerOne' });

    expect(markedUsers.isMarkedUser({
      authorName: '@ViewerOne',
      channelId: 'viewer-channel'
    })).toBe(true);
    expect(nativeAvatar.classList.contains('ytcq-marked-user-avatar')).toBe(true);
    expect(liteAvatar.classList.contains('ytcq-marked-user-avatar')).toBe(true);
    await expect(chrome.storage.local.get(markedUsers.MARKED_USERS_STORAGE_KEY)).resolves.toMatchObject({
      [markedUsers.MARKED_USERS_STORAGE_KEY]: {
        'author:@viewerone': { authorName: '@ViewerOne' }
      }
    });

    await markedUsers.toggleMarkedUser({
      authorName: '@ViewerOne',
      channelId: 'viewer-channel'
    });
    expect(nativeAvatar.classList.contains('ytcq-marked-user-avatar')).toBe(false);
    expect(liteAvatar.classList.contains('ytcq-marked-user-avatar')).toBe(false);

    await markedUsers.toggleMarkedUser({
      authorName: '@ViewerOne',
      channelId: 'viewer-channel'
    });

    expect(markedUsers.isMarkedUser({ authorName: '@ViewerOne' })).toBe(true);
    expect(nativeAvatar.classList.contains('ytcq-marked-user-avatar')).toBe(true);
    expect(liteAvatar.classList.contains('ytcq-marked-user-avatar')).toBe(true);
    await expect(chrome.storage.local.get(markedUsers.MARKED_USERS_STORAGE_KEY)).resolves.toMatchObject({
      [markedUsers.MARKED_USERS_STORAGE_KEY]: {
        'channel:viewer-channel': {
          authorName: '@ViewerOne',
          channelId: 'viewer-channel'
        }
      }
    });

    await markedUsers.toggleMarkedUser({ authorName: '@ViewerOne' });
    expect(markedUsers.isMarkedUser({ authorName: '@ViewerOne' })).toBe(false);
    expect(markedUsers.isMarkedUser({
      authorName: '@ViewerOne',
      channelId: 'viewer-channel'
    })).toBe(false);
  });

  it('removes duplicate handle and channel bookmarks together', async () => {
    await chrome.storage.local.set({
      ytcqMarkedUsers: {
        'author:@viewerone': {
          authorName: '@ViewerOne',
          markedAt: 1
        },
        'channel:viewer-channel': {
          authorName: '@ViewerOne',
          channelId: 'viewer-channel',
          markedAt: 2
        }
      }
    });
    const markedUsers = await import('./index');
    markedUsers.initMarkedUsers();
    await Promise.resolve();

    await markedUsers.toggleMarkedUser({
      authorName: '@ViewerOne',
      channelId: 'viewer-channel'
    });

    await expect(chrome.storage.local.get(markedUsers.MARKED_USERS_STORAGE_KEY)).resolves.toEqual({
      [markedUsers.MARKED_USERS_STORAGE_KEY]: {}
    });
  });

  it('stores bookmark time and stream context for marked-user tooltips', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    window.history.replaceState({}, '', '/watch?v=stream-a');
    document.title = 'Example Stream - YouTube';

    const markedUsers = await import('./index');
    markedUsers.initMarkedUsers();
    await markedUsers.toggleMarkedUser({ authorName: '@ViewerOne' });

    const button = markedUsers.createMarkedUserToggleButton({ authorName: '@ViewerOne' });
    const formattedDate = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(1_700_000_000_000);

    expect(button.title).toContain('Remove bookmark');
    expect(button.title).toContain(formattedDate);
    expect(button.title).toContain('Example Stream');
    expect(button.classList.contains('ytcq-marked-user-toggle-active')).toBe(true);
    expect(button.querySelector('svg')?.getAttribute('viewBox')).toBe(MATERIAL_ICON_VIEW_BOX);
    expect(button.querySelector('path')?.getAttribute('d')).toBe(BOOKMARK_FILLED_ICON_PATH);
    await expect(chrome.storage.local.get(markedUsers.MARKED_USERS_STORAGE_KEY)).resolves.toMatchObject({
      [markedUsers.MARKED_USERS_STORAGE_KEY]: {
        'author:@viewerone': {
          authorName: '@ViewerOne',
          markedAt: 1_700_000_000_000,
          markedSourceTitle: 'Example Stream',
          markedSourceUrl: 'https://www.youtube.com/watch?v=stream-a'
        }
      }
    });
  });

  it('stores avatar URLs and refreshes them when a better avatar appears later', async () => {
    const markedUsers = await import('./index');
    markedUsers.initMarkedUsers();
    await Promise.resolve();

    await markedUsers.toggleMarkedUser({
      authorName: '@ViewerOne',
      avatarUrl: 'https://yt3.ggpht.com/avatar=s32-c-k',
      channelId: 'viewer-channel'
    });
    await expect(chrome.storage.local.get(markedUsers.MARKED_USERS_STORAGE_KEY)).resolves.toMatchObject({
      [markedUsers.MARKED_USERS_STORAGE_KEY]: {
        'channel:viewer-channel': {
          avatarUrl: 'https://yt3.ggpht.com/avatar=s32-c-k'
        }
      }
    });

    const avatar = document.createElement('span');
    document.body.append(avatar);
    markedUsers.applyMarkedUserRing(avatar, {
      authorName: '@ViewerOne',
      avatarUrl: 'https://yt3.ggpht.com/avatar=s88-c-k',
      channelId: 'viewer-channel'
    });
    await Promise.resolve();
    await expect(chrome.storage.local.get(markedUsers.MARKED_USERS_STORAGE_KEY)).resolves.toMatchObject({
      [markedUsers.MARKED_USERS_STORAGE_KEY]: {
        'channel:viewer-channel': {
          avatarUrl: 'https://yt3.ggpht.com/avatar=s88-c-k'
        }
      }
    });

    markedUsers.applyMarkedUserRing(avatar, {
      authorName: '@ViewerOne',
      avatarUrl: 'https://yt3.ggpht.com/avatar=s24-c-k',
      channelId: 'viewer-channel'
    });
    await Promise.resolve();
    await expect(chrome.storage.local.get(markedUsers.MARKED_USERS_STORAGE_KEY)).resolves.toMatchObject({
      [markedUsers.MARKED_USERS_STORAGE_KEY]: {
        'channel:viewer-channel': {
          avatarUrl: 'https://yt3.ggpht.com/avatar=s88-c-k'
        }
      }
    });
  });

  it('toggles marked users off without losing unrelated marks', async () => {
    const markedUsers = await import('./index');
    markedUsers.initMarkedUsers();
    await markedUsers.toggleMarkedUser({ authorName: '@ViewerOne', channelId: 'viewer-channel' });
    const button = markedUsers.createMarkedUserToggleButton({ authorName: '@ViewerOne', channelId: 'viewer-channel' });
    document.body.append(button);
    expect(button.querySelector('path')?.getAttribute('d')).toBe(BOOKMARK_FILLED_ICON_PATH);

    await markedUsers.toggleMarkedUser({ authorName: '@ViewerTwo' });
    await markedUsers.toggleMarkedUser({ authorName: '@ViewerOne', channelId: 'viewer-channel' });

    expect(markedUsers.isMarkedUser({ authorName: '@ViewerOne', channelId: 'viewer-channel' })).toBe(false);
    expect(markedUsers.isMarkedUser({ authorName: '@ViewerTwo' })).toBe(true);
    expect(button.classList.contains('ytcq-marked-user-toggle-active')).toBe(false);
    expect(button.querySelector('path')?.getAttribute('d')).toBe(BOOKMARK_ICON_PATH);
  });

  it('toggles users from the header button click handler', async () => {
    const markedUsers = await import('./index');
    markedUsers.initMarkedUsers();
    await Promise.resolve();

    const button = markedUsers.createMarkedUserToggleButton({ authorName: '@ViewerOne' });
    document.body.append(button);

    button.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(markedUsers.isMarkedUser({ authorName: '@ViewerOne' })).toBe(true);
    expect(button.classList.contains('ytcq-marked-user-toggle-active')).toBe(true);
    expect(button.querySelector('path')?.getAttribute('d')).toBe(BOOKMARK_FILLED_ICON_PATH);
  });

  it('loads existing marks from storage before rendering toggle state', async () => {
    await chrome.storage.local.set({
      ytcqMarkedUsers: {
        'author:@viewerone': {
          authorName: '@ViewerOne',
          markedAt: 0
        }
      }
    });

    const markedUsers = await import('./index');
    markedUsers.initMarkedUsers();
    await Promise.resolve();

    const button = markedUsers.createMarkedUserToggleButton({ authorName: '@ViewerOne' });
    expect(button.classList.contains('ytcq-marked-user-toggle-active')).toBe(true);
    expect(button.title).toBe('Remove bookmark');
  });

  it('refreshes rings and toggle icons when marked users change in storage', async () => {
    const markedUsers = await import('./index');
    markedUsers.initMarkedUsers();
    await Promise.resolve();

    const avatar = document.createElement('span');
    document.body.append(avatar);
    markedUsers.applyMarkedUserRing(avatar, { authorName: '@ViewerOne' });

    const button = document.createElement('button');
    button.className = 'ytcq-marked-user-toggle';
    button.dataset.ytcqMarkedUserToggleName = '@ViewerOne';
    document.body.append(button);

    const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls.at(-1)?.[0];
    expect(listener).toBeTypeOf('function');

    listener?.({
      [markedUsers.MARKED_USERS_STORAGE_KEY]: {
        newValue: {
          'author:@viewerone': {
            authorName: '@ViewerOne',
            markedAt: 1_700_000_000_000
          }
        }
      } as chrome.storage.StorageChange
    }, 'sync');
    expect(avatar.classList.contains('ytcq-marked-user-avatar')).toBe(false);

    listener?.({
      unrelated: {
        newValue: true
      } as chrome.storage.StorageChange
    }, 'local');
    expect(avatar.classList.contains('ytcq-marked-user-avatar')).toBe(false);

    listener?.({
      [markedUsers.MARKED_USERS_STORAGE_KEY]: {
        newValue: {
          'author:@viewerone': {
            authorName: '@ViewerOne',
            markedAt: 1_700_000_000_000
          }
        }
      } as chrome.storage.StorageChange
    }, 'local');

    expect(avatar.classList.contains('ytcq-marked-user-avatar')).toBe(true);
    expect(button.classList.contains('ytcq-marked-user-toggle-active')).toBe(true);
    expect(button.querySelector('path')?.getAttribute('d')).toBe(BOOKMARK_FILLED_ICON_PATH);

    const unboundButton = document.createElement('button');
    unboundButton.className = 'ytcq-marked-user-toggle';
    document.body.append(unboundButton);
    markedUsers.refreshMarkedUserRings();
    expect(unboundButton.querySelector('path')?.getAttribute('d')).toBe(BOOKMARK_ICON_PATH);

    markedUsers.cleanupStaleMarkedUsers();
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(listener);
  });

  it('uses stable username colors and ignores empty identities', async () => {
    const markedUsers = await import('./index');
    expect(markedUsers.getMarkedUserColor({ authorName: '@ViewerOne' })).toBe(markedUsers.getMarkedUserColor({ authorName: '@ViewerOne' }));
    expect(markedUsers.getMarkedUserColor({ authorName: '@ViewerOne' })).not.toBe(markedUsers.getMarkedUserColor({ authorName: '@ViewerTwo' }));

    const target = document.createElement('span');
    markedUsers.applyMarkedUserRing(target, {});
    expect(target.hasAttribute('data-ytcq-marked-user-key')).toBe(false);
    expect(await markedUsers.toggleMarkedUser({})).toBe(false);
    markedUsers.applyMarkedUserRing(null, { authorName: '@ViewerOne' });

    const emptyButton = markedUsers.createMarkedUserToggleButton({});
    expect(emptyButton.title).toBe('Bookmark');
  });

  it('handles channel-only identities and clears stale empty ring targets', async () => {
    const markedUsers = await import('./index');
    markedUsers.initMarkedUsers();
    await Promise.resolve();

    await expect(markedUsers.toggleMarkedUser({ channelId: 'channel-only' })).resolves.toBe(true);
    await expect(chrome.storage.local.get(markedUsers.MARKED_USERS_STORAGE_KEY)).resolves.toMatchObject({
      [markedUsers.MARKED_USERS_STORAGE_KEY]: {
        'channel:channel-only': {
          authorName: '',
          channelId: 'channel-only'
        }
      }
    });

    const avatar = document.createElement('span');
    document.body.append(avatar);
    markedUsers.applyMarkedUserRing(avatar, { channelId: 'channel-only' });
    expect(avatar.dataset.ytcqMarkedUserName).toBe('channel:channel-only');
    expect(avatar.classList.contains('ytcq-marked-user-avatar')).toBe(true);

    const stale = document.createElement('span');
    stale.dataset.ytcqMarkedUserKey = '';
    stale.className = 'ytcq-markable-user-avatar ytcq-marked-user-avatar';
    const staleAnimation = document.createElement('span');
    staleAnimation.className = 'ytcq-marked-user-ring-animation';
    stale.append(staleAnimation);
    document.body.append(stale);

    markedUsers.refreshMarkedUserRings();

    expect(stale.hasAttribute('data-ytcq-marked-user-key')).toBe(false);
    expect(stale.classList.contains('ytcq-marked-user-avatar')).toBe(false);
    expect(stale.querySelector('.ytcq-marked-user-ring-animation')).toBeNull();
  });

  it('handles message author mark helpers for missing and present authors', async () => {
    const markedUsers = await import('./index');
    const message = document.createElement('yt-live-chat-text-message-renderer');

    expect(markedUsers.getMarkedUserIdentityFromMessage(message)).toBeNull();
    expect(markedUsers.isMessageAuthorMarked(message)).toBe(false);
    expect(markedUsers.getMessageAuthorMarkTitle(message)).toBe('Mark');
    await expect(markedUsers.toggleMessageAuthorMark(message)).resolves.toBe(false);

    const authoredMessage = document.createElement('yt-live-chat-text-message-renderer');
    authoredMessage.innerHTML = `
      <span id="author-photo"><img src="https://example.test/avatar.png"></span>
      <span id="author-name">@ViewerOne</span>
    `;

    expect(markedUsers.getMarkedUserIdentityFromMessage(authoredMessage)).toEqual({
      authorName: '@ViewerOne',
      avatarUrl: 'https://example.test/avatar.png',
      channelId: undefined
    });
    expect(markedUsers.getMessageAuthorMarkTitle(authoredMessage)).toContain('Mark');
    await expect(markedUsers.toggleMessageAuthorMark(authoredMessage)).resolves.toBe(true);
    expect(markedUsers.isMessageAuthorMarked(authoredMessage)).toBe(true);
    expect(markedUsers.getMessageAuthorMarkTitle(authoredMessage)).toContain('Unmark');
  });

  it('renders message rings through the feature lifecycle', async () => {
    const markedUsers = await import('./index');
    const lifecycle = await import('../../content/lifecycle');
    markedUsers.initMarkedUsers();
    await Promise.resolve();

    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.innerHTML = `
      <span id="author-photo"></span>
      <a href="/channel/viewer-channel"><span id="author-name">@ViewerOne</span></a>
    `;
    document.body.append(message);

    lifecycle.handleFeatureMessage(message, { source: 'existing' });

    const avatar = message.querySelector<HTMLElement>('#author-photo')!;
    expect(avatar.dataset.ytcqMarkedUserKey).toBe('channel:viewer-channel');

    await markedUsers.toggleMarkedUser({
      authorName: '@ViewerOne',
      channelId: 'viewer-channel'
    });

    expect(avatar.classList.contains('ytcq-marked-user-avatar')).toBe(true);

    const messageWithoutAvatar = document.createElement('yt-live-chat-text-message-renderer');
    messageWithoutAvatar.innerHTML = '<span id="author-name">@ViewerTwo</span>';
    lifecycle.handleFeatureMessage(messageWithoutAvatar, { source: 'existing' });
    expect(messageWithoutAvatar.querySelector('[data-ytcq-marked-user-key]')).toBeNull();
  });

  it('upgrades native message rings with stable channel metadata', async () => {
    const markedUsers = await import('./index');
    const lifecycle = await import('../../content/lifecycle');
    markedUsers.initMarkedUsers();
    await Promise.resolve();
    await markedUsers.toggleMarkedUser({
      authorName: '@ViewerOne',
      channelId: 'viewer-channel'
    });

    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.id = 'native-message';
    message.innerHTML = `
      <span id="author-photo"></span>
      <span id="author-name">@ViewerOne</span>
    `;
    document.body.append(message);
    lifecycle.handleFeatureMessage(message, {
      messageData: Promise.resolve({
        authorExternalChannelId: 'viewer-channel',
        authorName: '@ViewerOne',
        messageId: 'native-message'
      }),
      source: 'existing'
    });
    await Promise.resolve();

    const avatar = message.querySelector<HTMLElement>('#author-photo')!;
    expect(avatar.dataset.ytcqMarkedUserKey).toBe('channel:viewer-channel');
    expect(avatar.classList.contains('ytcq-marked-user-avatar')).toBe(true);
  });

  it('does not reapply delayed message metadata after cleanup', async () => {
    const markedUsers = await import('./index');
    const lifecycle = await import('../../content/lifecycle');
    markedUsers.initMarkedUsers();
    await Promise.resolve();
    let resolveMessageData: (value: {
      authorExternalChannelId: string;
      authorName: string;
      messageId: string;
    }) => void = () => undefined;
    const messageData = new Promise<{
      authorExternalChannelId: string;
      authorName: string;
      messageId: string;
    }>((resolve) => {
      resolveMessageData = resolve;
    });
    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.id = 'native-message';
    message.innerHTML = `
      <span id="author-photo"></span>
      <span id="author-name">@ViewerOne</span>
    `;
    document.body.append(message);
    lifecycle.handleFeatureMessage(message, { messageData, source: 'existing' });

    markedUsers.cleanupStaleMarkedUsers();
    resolveMessageData({
      authorExternalChannelId: 'viewer-channel',
      authorName: '@ViewerOne',
      messageId: 'native-message'
    });
    await Promise.resolve();

    const avatar = message.querySelector<HTMLElement>('#author-photo')!;
    expect(avatar.hasAttribute('data-ytcq-marked-user-key')).toBe(false);
  });

  it('animates marked-user rings when an existing avatar is marked or unmarked', async () => {
    vi.useFakeTimers();
    const markedUsers = await import('./index');
    markedUsers.initMarkedUsers();
    await Promise.resolve();

    const avatar = document.createElement('span');
    avatar.getBoundingClientRect = () => rect({ width: 24, height: 24, left: 10, top: 20 });
    document.body.append(avatar);
    markedUsers.applyMarkedUserRing(avatar, { authorName: '@ViewerOne' });
    expect(document.querySelector('.ytcq-marked-user-ring-animation')).toBeNull();

    await markedUsers.toggleMarkedUser({ authorName: '@ViewerOne' });
    const enterAnimation = avatar.querySelector<HTMLElement>(':scope > .ytcq-marked-user-ring-animation-enter');
    expect(enterAnimation).not.toBeNull();
    expect(avatar.classList.contains('ytcq-marked-user-ring-host')).toBe(true);
    expect(avatar.classList.contains('ytcq-marked-user-avatar-entering')).toBe(true);
    enterAnimation?.dispatchEvent(new Event('animationend'));
    expect(enterAnimation?.isConnected).toBe(false);
    expect(avatar.classList.contains('ytcq-marked-user-avatar-entering')).toBe(false);

    await markedUsers.toggleMarkedUser({ authorName: '@ViewerOne' });
    expect(avatar.querySelector(':scope > .ytcq-marked-user-ring-animation-exit')).not.toBeNull();
    vi.advanceTimersByTime(700);

    const button = markedUsers.createMarkedUserToggleButton({ authorName: '@ViewerOne' });
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('skips ring overlays for reduced motion and image elements', async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: true,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn()
    }));

    const markedUsers = await import('./index');
    markedUsers.initMarkedUsers();
    await Promise.resolve();

    const reducedMotionAvatar = document.createElement('span');
    document.body.append(reducedMotionAvatar);
    markedUsers.applyMarkedUserRing(reducedMotionAvatar, { authorName: '@ViewerOne' });
    await markedUsers.toggleMarkedUser({ authorName: '@ViewerOne' });

    expect(reducedMotionAvatar.classList.contains('ytcq-marked-user-avatar')).toBe(true);
    expect(reducedMotionAvatar.classList.contains('ytcq-marked-user-avatar-entering')).toBe(false);
    expect(reducedMotionAvatar.querySelector('.ytcq-marked-user-ring-animation')).toBeNull();

    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn()
    }));

    const imageAvatar = document.createElement('img');
    document.body.append(imageAvatar);
    markedUsers.applyMarkedUserRing(imageAvatar, { authorName: '@ViewerTwo' });
    await markedUsers.toggleMarkedUser({ authorName: '@ViewerTwo' });

    expect(imageAvatar.classList.contains('ytcq-marked-user-avatar')).toBe(true);
    expect(imageAvatar.classList.contains('ytcq-marked-user-avatar-entering')).toBe(false);
    expect(imageAvatar.querySelector('.ytcq-marked-user-ring-animation')).toBeNull();
  });

  it('cleans stale marked-user rings and animation hosts', async () => {
    const markedUsers = await import('./index');
    markedUsers.initMarkedUsers();
    await Promise.resolve();

    const avatar = document.createElement('span');
    avatar.getBoundingClientRect = () => rect({ width: 24, height: 24, left: 10, top: 20 });
    document.body.append(avatar);
    markedUsers.applyMarkedUserRing(avatar, { authorName: '@ViewerOne' });
    await markedUsers.toggleMarkedUser({ authorName: '@ViewerOne' });

    expect(avatar.classList.contains('ytcq-marked-user-avatar')).toBe(true);
    expect(avatar.querySelector('.ytcq-marked-user-ring-animation')).not.toBeNull();

    markedUsers.cleanupStaleMarkedUsers();

    expect(avatar.classList.contains('ytcq-marked-user-avatar')).toBe(false);
    expect(avatar.classList.contains('ytcq-markable-user-avatar')).toBe(false);
    expect(avatar.hasAttribute('data-ytcq-marked-user-key')).toBe(false);
    expect(document.querySelector('.ytcq-marked-user-ring-animation')).toBeNull();
  });

  it('positions native chat avatar ring animations inside the message row', async () => {
    const markedUsers = await import('./index');
    markedUsers.initMarkedUsers();
    await Promise.resolve();

    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.getBoundingClientRect = () => rect({ width: 320, height: 40, left: 100, top: 200 });
    message.innerHTML = `
      <span id="author-photo"></span>
      <span id="author-name">@ViewerOne</span>
    `;
    const avatar = message.querySelector<HTMLElement>('#author-photo')!;
    avatar.getBoundingClientRect = () => rect({ width: 24, height: 24, left: 110, top: 206 });
    document.body.append(message);

    markedUsers.applyMarkedUserRing(avatar, { authorName: '@ViewerOne' });
    await markedUsers.toggleMarkedUser({ authorName: '@ViewerOne' });

    const animation = message.querySelector<HTMLElement>(':scope > .ytcq-marked-user-ring-animation-enter');
    expect(animation).not.toBeNull();
    expect(animation?.classList.contains('ytcq-marked-user-ring-animation-positioned')).toBe(true);
    expect(animation?.style.left).toBe('6px');
    expect(animation?.style.top).toBe('2px');
    expect(animation?.style.width).toBe('32px');
    expect(animation?.style.height).toBe('32px');
    expect(avatar.querySelector(':scope > .ytcq-marked-user-ring-animation')).toBeNull();
    expect(avatar.classList.contains('ytcq-marked-user-avatar-entering')).toBe(true);

    await markedUsers.toggleMarkedUser({ authorName: '@ViewerOne' });
    expect(message.querySelectorAll(':scope > .ytcq-marked-user-ring-animation-enter')).toHaveLength(0);
  });

  it('falls back to avatar-hosted animation when the message row is not measurable', async () => {
    const markedUsers = await import('./index');
    markedUsers.initMarkedUsers();
    await Promise.resolve();

    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.getBoundingClientRect = () => rect();
    message.innerHTML = `
      <span id="author-photo"></span>
      <span id="author-name">@ViewerOne</span>
    `;
    const avatar = message.querySelector<HTMLElement>('#author-photo')!;
    avatar.getBoundingClientRect = () => rect({ width: 24, height: 24, left: 110, top: 206 });
    document.body.append(message);

    markedUsers.applyMarkedUserRing(avatar, { authorName: '@ViewerOne' });
    await markedUsers.toggleMarkedUser({ authorName: '@ViewerOne' });

    const animation = avatar.querySelector<HTMLElement>(':scope > .ytcq-marked-user-ring-animation-enter');
    expect(animation).not.toBeNull();
    expect(animation?.classList.contains('ytcq-marked-user-ring-animation-positioned')).toBe(false);
    expect(message.querySelector(':scope > .ytcq-marked-user-ring-animation-enter')).toBeNull();
  });

  it('applies marked-user rings to participant list avatars', async () => {
    const markedUsers = await import('./index');
    const lifecycle = await import('../../content/lifecycle');
    markedUsers.initMarkedUsers();
    await Promise.resolve();

    const participant = document.createElement('yt-live-chat-participant-renderer');
    participant.innerHTML = `
      <yt-img-shadow><img src="https://example.test/participant.png"></yt-img-shadow>
      <a href="/channel/participant-channel"><span id="author-name">@ParticipantUser</span></a>
    `;
    document.body.append(participant);

    lifecycle.handleFeatureParticipant(participant);

    const avatar = participant.querySelector<HTMLElement>('yt-img-shadow')!;
    expect(avatar.dataset.ytcqMarkedUserKey).toBe('channel:participant-channel');
    expect(avatar.classList.contains('ytcq-marked-user-avatar')).toBe(false);

    await markedUsers.toggleMarkedUser({
      authorName: '@ParticipantUser',
      channelId: 'participant-channel'
    });

    expect(avatar.classList.contains('ytcq-marked-user-avatar')).toBe(true);

    const textOnlyParticipant = document.createElement('yt-live-chat-participant-renderer');
    textOnlyParticipant.textContent = '@ParticipantWithoutAvatar';
    expect(markedUsers.getMarkedUserIdentityFromParticipant(textOnlyParticipant)).toEqual({
      authorName: '@ParticipantWithoutAvatar',
      avatarUrl: undefined,
      channelId: undefined
    });
    lifecycle.handleFeatureParticipant(textOnlyParticipant);
    expect(textOnlyParticipant.querySelector('[data-ytcq-marked-user-key]')).toBeNull();
  });
});

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
