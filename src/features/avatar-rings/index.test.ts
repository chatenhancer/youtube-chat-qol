import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AVATAR_RING_ACTIVE_BADGE_PATH, AVATAR_RING_ADD_BADGE_PATH } from '../../shared/icons';

const chatFeedRecordMocks = vi.hoisted(() => ({
  requestRenderedYouTubeChatFeedRecord: vi.fn(
    (_message: HTMLElement): Promise<unknown> => Promise.resolve(null)
  )
}));

vi.mock('../../youtube/chat-feed/records', () => chatFeedRecordMocks);

describe('avatar rings', () => {
  beforeEach(async () => {
    document.body.replaceChildren();
    await chrome.storage.local.clear();
    vi.clearAllMocks();
    chatFeedRecordMocks.requestRenderedYouTubeChatFeedRecord.mockReset();
    chatFeedRecordMocks.requestRenderedYouTubeChatFeedRecord.mockResolvedValue(null);
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores independent per-user ring choices and updates existing avatar targets', async () => {
    const addedAt = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(addedAt);
    await chrome.storage.local.set({
      ytcqBookmarks: {
        'message:stream-a:message-1': { authorName: '@ViewerOne' }
      }
    });
    const feature = await import('./index');
    feature.initAvatarRings();
    await flushAsyncWork();

    const avatar = document.createElement('span');
    document.body.append(avatar);
    feature.applyAvatarRing(avatar, {
      authorName: '@ViewerOne',
      channelId: 'viewer-channel'
    });
    expect(avatar.classList.contains('ytcq-avatar-ring-active')).toBe(false);

    await expect(
      feature.toggleAvatarRing({ authorName: '@ViewerOne', channelId: 'viewer-channel' })
    ).resolves.toBe(true);

    expect(avatar.classList.contains('ytcq-avatar-ring-active')).toBe(true);
    expect(avatar.style.getPropertyValue('--ytcq-avatar-ring-color')).toBe(
      feature.getAvatarRingColor({ authorName: '@ViewerOne' })
    );
    await expect(chrome.storage.local.get(null)).resolves.toMatchObject({
      [feature.AVATAR_RINGS_STORAGE_KEY]: {
        'channel:viewer-channel': {
          addedAt,
          authorName: '@ViewerOne',
          channelId: 'viewer-channel'
        }
      },
      ytcqBookmarks: {
        'message:stream-a:message-1': { authorName: '@ViewerOne' }
      }
    });
  });

  it('matches author-only and channel identities and removes duplicate matches together', async () => {
    await chrome.storage.local.set({
      ytcqAvatarRings: {
        'author:@viewerone': { authorName: '@ViewerOne' },
        'channel:viewer-channel': {
          authorName: '@ViewerOne',
          channelId: 'viewer-channel'
        }
      }
    });
    const feature = await import('./index');
    feature.initAvatarRings();
    await flushAsyncWork();

    const nativeAvatar = document.createElement('span');
    const liteAvatar = document.createElement('span');
    document.body.append(nativeAvatar, liteAvatar);
    feature.applyAvatarRing(nativeAvatar, { authorName: '@ViewerOne' });
    feature.applyAvatarRing(liteAvatar, {
      authorName: '@ViewerOne',
      channelId: 'viewer-channel'
    });

    expect(nativeAvatar.classList.contains('ytcq-avatar-ring-active')).toBe(true);
    expect(liteAvatar.classList.contains('ytcq-avatar-ring-active')).toBe(true);

    await expect(
      feature.toggleAvatarRing({ authorName: '@ViewerOne', channelId: 'viewer-channel' })
    ).resolves.toBe(false);
    expect(nativeAvatar.classList.contains('ytcq-avatar-ring-active')).toBe(false);
    expect(liteAvatar.classList.contains('ytcq-avatar-ring-active')).toBe(false);
    await expect(chrome.storage.local.get(feature.AVATAR_RINGS_STORAGE_KEY)).resolves.toEqual({
      [feature.AVATAR_RINGS_STORAGE_KEY]: {}
    });
  });

  it('renders a purpose-built header toggle with add and active states', async () => {
    const addedAt = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(addedAt);
    const feature = await import('./index');
    feature.initAvatarRings();
    await flushAsyncWork();

    const button = feature.createAvatarRingToggleButton({ authorName: '@ViewerOne' });
    document.body.append(button);
    expect(button.title).toBe('Add avatar ring');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.querySelector('.ytcq-avatar-ring-icon-badge-symbol')?.getAttribute('d')).toBe(
      AVATAR_RING_ADD_BADGE_PATH
    );

    button.click();
    await flushAsyncWork();

    expect(button.title).toBe(
      `Remove avatar ring\nAvatar ring added ${new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(addedAt)}`
    );
    expect(button.getAttribute('aria-label')).toBe(button.title);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.classList.contains('ytcq-avatar-ring-toggle-active')).toBe(true);
    expect(button.style.getPropertyValue('--ytcq-avatar-ring-color')).toBe(
      feature.getAvatarRingColor({ authorName: '@ViewerOne' })
    );
    expect(button.querySelector('.ytcq-avatar-ring-icon-badge-symbol')?.getAttribute('d')).toBe(
      AVATAR_RING_ACTIVE_BADGE_PATH
    );
  });

  it('wires message avatars and upgrades them with stable feed channel metadata', async () => {
    const feature = await import('./index');
    const lifecycle = await import('../../content/feature-runtime');
    feature.initAvatarRings();
    await flushAsyncWork();
    await feature.toggleAvatarRing({
      authorName: '@ViewerOne',
      channelId: 'viewer-channel'
    });

    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.id = 'message-1';
    message.innerHTML = `
      <span id="author-photo"></span>
      <span id="author-name">@ViewerOne</span>
    `;
    document.body.append(message);
    chatFeedRecordMocks.requestRenderedYouTubeChatFeedRecord.mockResolvedValueOnce({
      author: { channelId: 'viewer-channel', name: '@ViewerOne' },
      id: 'message-1'
    });

    lifecycle.handleFeatureMessage(message, { source: 'existing' });
    await flushAsyncWork();

    const avatar = message.querySelector<HTMLElement>('#author-photo')!;
    expect(avatar.dataset.ytcqAvatarRingKey).toBe('channel:viewer-channel');
    expect(avatar.classList.contains('ytcq-avatar-ring-active')).toBe(true);
  });

  it('reacts only to local ring storage changes and removes its listener and DOM state', async () => {
    const feature = await import('./index');
    feature.initAvatarRings();
    await flushAsyncWork();

    const avatar = document.createElement('span');
    document.body.append(avatar);
    feature.applyAvatarRing(avatar, { authorName: '@ViewerOne' });
    const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls.at(-1)?.[0];

    listener?.(
      {
        [feature.AVATAR_RINGS_STORAGE_KEY]: {
          newValue: { 'author:@viewerone': { authorName: '@ViewerOne' } }
        } as chrome.storage.StorageChange
      },
      'sync'
    );
    expect(avatar.classList.contains('ytcq-avatar-ring-active')).toBe(false);

    listener?.(
      {
        [feature.AVATAR_RINGS_STORAGE_KEY]: {
          newValue: { 'author:@viewerone': { authorName: '@ViewerOne' } }
        } as chrome.storage.StorageChange
      },
      'local'
    );
    expect(avatar.classList.contains('ytcq-avatar-ring-active')).toBe(true);

    feature.cleanupAvatarRings();
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(listener);
    expect(avatar.hasAttribute('data-ytcq-avatar-ring-key')).toBe(false);
    expect(avatar.classList.contains('ytcq-avatar-ring-active')).toBe(false);
  });
});

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await Promise.resolve();
}
