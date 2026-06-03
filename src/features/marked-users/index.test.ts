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

    expect(button.title).toContain('Unmark');
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

  it('uses stable username colors and ignores empty identities', async () => {
    const markedUsers = await import('./index');
    expect(markedUsers.getMarkedUserColor({ authorName: '@ViewerOne' })).toBe(markedUsers.getMarkedUserColor({ authorName: '@ViewerOne' }));
    expect(markedUsers.getMarkedUserColor({ authorName: '@ViewerOne' })).not.toBe(markedUsers.getMarkedUserColor({ authorName: '@ViewerTwo' }));

    const target = document.createElement('span');
    markedUsers.applyMarkedUserRing(target, {});
    expect(target.hasAttribute('data-ytcq-marked-user-key')).toBe(false);
    expect(await markedUsers.toggleMarkedUser({})).toBe(false);
  });

  it('animates marked-user rings when an existing avatar is marked or unmarked', async () => {
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

    await markedUsers.toggleMarkedUser({ authorName: '@ViewerOne' });
    expect(avatar.querySelector(':scope > .ytcq-marked-user-ring-animation-exit')).not.toBeNull();

    const button = markedUsers.createMarkedUserToggleButton({ authorName: '@ViewerOne' });
    expect(button.querySelector('svg')).not.toBeNull();
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
  });

  it('applies marked-user rings to participant list avatars', async () => {
    const markedUsers = await import('./index');
    const lifecycle = await import('../../content/lifecycle');
    markedUsers.initMarkedUsers();
    await Promise.resolve();

    const participant = document.createElement('yt-live-chat-participant-renderer') as HTMLElement & {
      data?: unknown;
    };
    participant.data = {
      authorChannelId: 'participant-channel',
      authorName: { simpleText: '@ParticipantUser' }
    };
    participant.innerHTML = `
      <yt-img-shadow><img src="https://example.test/participant.png"></yt-img-shadow>
      <span id="author-name">@ParticipantUser</span>
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
