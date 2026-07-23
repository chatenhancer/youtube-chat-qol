import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOKMARK_FILLED_ICON_PATH, BOOKMARK_ICON_PATH } from '../../shared/icons';
import { BOOKMARKS_STORAGE_KEY, LEGACY_BOOKMARKS_STORAGE_KEY } from '../../shared/bookmarks';

const chatFeedRecordMocks = vi.hoisted(() => ({
  requestRenderedYouTubeChatFeedRecord: vi.fn(
    (_message: HTMLElement): Promise<unknown> => Promise.resolve(null)
  )
}));
const liteModeMocks = vi.hoisted(() => ({
  hasRetainedLiteModeMessage: vi.fn(() => false),
  isLiteModeActive: vi.fn(() => false),
  revealRetainedLiteModeMessage: vi.fn(() => null as HTMLElement | null)
}));

vi.mock('../../youtube/chat-feed/records', () => chatFeedRecordMocks);
vi.mock('../lite-mode/controller', () => liteModeMocks);

describe('bookmarks', () => {
  beforeEach(async () => {
    document.body.replaceChildren();
    document.title = '';
    window.history.replaceState({}, '', '/watch?v=stream-a');
    await chrome.storage.local.clear();
    vi.clearAllMocks();
    chatFeedRecordMocks.requestRenderedYouTubeChatFeedRecord.mockReset();
    chatFeedRecordMocks.requestRenderedYouTubeChatFeedRecord.mockResolvedValue(null);
    liteModeMocks.hasRetainedLiteModeMessage.mockReset().mockReturnValue(false);
    liteModeMocks.isLiteModeActive.mockReset().mockReturnValue(false);
    liteModeMocks.revealRetainedLiteModeMessage.mockReset().mockReturnValue(null);
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('stores and removes multiple messages from the same author independently', async () => {
    const feature = await import('./index');
    feature.initBookmarks();
    await flushAsyncWork();

    await expect(feature.toggleBookmark(bookmark('message-1'))).resolves.toBe(true);
    await expect(feature.toggleBookmark(bookmark('message-2'))).resolves.toBe(true);

    const stored = await chrome.storage.local.get(BOOKMARKS_STORAGE_KEY);
    expect(Object.keys(stored[BOOKMARKS_STORAGE_KEY])).toEqual([
      'message:stream-a:message-1',
      'message:stream-a:message-2'
    ]);

    await expect(feature.toggleBookmark(bookmark('message-1'))).resolves.toBe(false);
    expect(
      Object.keys((await chrome.storage.local.get(BOOKMARKS_STORAGE_KEY))[BOOKMARKS_STORAGE_KEY])
    ).toEqual(['message:stream-a:message-2']);

    await expect(feature.toggleBookmark(bookmark('message-2'))).resolves.toBe(false);
    expect((await chrome.storage.local.get(BOOKMARKS_STORAGE_KEY))[BOOKMARKS_STORAGE_KEY]).toEqual(
      {}
    );
  });

  it('migrates author-only bookmarks and replaces a placeholder with the first saved message', async () => {
    await chrome.storage.local.set({
      [LEGACY_BOOKMARKS_STORAGE_KEY]: {
        'channel:viewer-channel': {
          authorName: '@ViewerOne',
          avatarUrl: 'https://example.test/avatar=s32-c-k',
          channelId: 'viewer-channel',
          markedAt: 123,
          markedSourceTitle: 'Older stream',
          markedSourceUrl: 'https://www.youtube.com/watch?v=older-stream'
        }
      }
    });

    const feature = await import('./index');
    feature.initBookmarks();
    await flushAsyncWork();

    await expect(chrome.storage.local.get(null)).resolves.toMatchObject({
      [BOOKMARKS_STORAGE_KEY]: {
        'channel:viewer-channel': {
          authorName: '@ViewerOne',
          channelId: 'viewer-channel',
          message: null,
          savedAt: 123,
          sourceKey: '',
          sourceTitle: 'Older stream'
        }
      }
    });
    expect((await chrome.storage.local.get(null))[LEGACY_BOOKMARKS_STORAGE_KEY]).toBeUndefined();

    await feature.toggleBookmark(bookmark('message-1'));
    const migrated = (await chrome.storage.local.get(BOOKMARKS_STORAGE_KEY))[BOOKMARKS_STORAGE_KEY];
    expect(Object.keys(migrated)).toEqual(['message:stream-a:message-1']);
    expect(migrated['message:stream-a:message-1'].message.text).toBe('Message message-1');
  });

  it('creates compact exact-message bookmark buttons', async () => {
    const savedAt = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(savedAt);
    const feature = await import('./index');
    feature.initBookmarks();
    await flushAsyncWork();

    const first = feature.createBookmarkToggleButton(bookmark('message-1'))!;
    const second = feature.createBookmarkToggleButton(bookmark('message-2'))!;
    document.body.append(first, second);
    expect(first.classList.contains('ytcq-bookmark-toggle')).toBe(true);
    expect(first.title).toBe('Save message');
    expect(first.querySelector('path')?.getAttribute('d')).toBe(BOOKMARK_ICON_PATH);

    await feature.toggleBookmark(bookmark('message-1'));
    expect(first.classList.contains('ytcq-bookmark-toggle-active')).toBe(true);
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(first.title).toBe(
      `Remove saved message\nBookmark added ${new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(savedAt)}`
    );
    expect(first.getAttribute('aria-label')).toBe(first.title);
    expect(first.querySelector('path')?.getAttribute('d')).toBe(BOOKMARK_FILLED_ICON_PATH);
    expect(second.classList.contains('ytcq-bookmark-toggle-active')).toBe(false);
  });

  it('stores the watch-page video offset for live bookmarks', async () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 328.9
    });
    document.body.append(video);
    const feature = await import('./index');
    feature.initBookmarks();
    await flushAsyncWork();

    await feature.toggleBookmark(bookmark('message-1', {
      // A 24-hour live clock must not be mistaken for a replay offset.
      timestampText: '17:22'
    }));

    await expect(chrome.storage.local.get(BOOKMARKS_STORAGE_KEY)).resolves.toMatchObject({
      [BOOKMARKS_STORAGE_KEY]: {
        'message:stream-a:message-1': {
          message: {
            messageId: 'message-1',
            videoOffsetSeconds: 328
          }
        }
      }
    });
  });

  it('jumps to and highlights a linked message when it appears', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/watch?v=stream-a#ytcq-message=message-1');
    const feature = await import('./index');
    feature.initBookmarks();
    const dispatcher = await import('../../content/dispatcher');
    const otherMessage = createChatMessage('message-2', 'Other message');
    const targetMessage = createChatMessage('message-1', 'Linked message');
    document.body.append(otherMessage, targetMessage);

    dispatcher.handleFeatureMessage(otherMessage, { source: 'existing' });
    expect(otherMessage.classList.contains('ytcq-message-jump-target')).toBe(false);

    dispatcher.handleFeatureMessage(targetMessage, { source: 'existing' });
    expect(targetMessage.classList.contains('ytcq-message-jump-target')).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(targetMessage.classList.contains('ytcq-message-jump-target')).toBe(true);
    await vi.advanceTimersByTimeAsync(1_600);
    expect(targetMessage.classList.contains('ytcq-message-jump-target')).toBe(false);
  });

  it('waits for the visible Lite row instead of jumping to its hidden native source', async () => {
    vi.useFakeTimers();
    liteModeMocks.isLiteModeActive.mockReturnValue(true);
    window.history.replaceState({}, '', '/watch?v=stream-a#ytcq-message=message-1');
    const feature = await import('./index');
    feature.initBookmarks();
    const dispatcher = await import('../../content/dispatcher');
    const nativeMessage = createChatMessage('message-1', 'Native source');
    document.body.append(nativeMessage);

    dispatcher.handleFeatureMessage(nativeMessage, { source: 'existing' });
    expect(nativeMessage.classList.contains('ytcq-message-jump-target')).toBe(false);

    const scroller = document.createElement('div');
    const liteMessage = createChatMessage('message-1', 'Visible Lite row');
    const scrollTo = vi.fn();
    scroller.id = 'item-scroller';
    liteMessage.className = 'ytcq-lite-message';
    Object.defineProperty(scroller, 'scrollTo', {
      configurable: true,
      value: scrollTo
    });
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 }
    });
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(
      rect({
        left: 0,
        top: 0,
        width: 300,
        height: 100
      })
    );
    vi.spyOn(liteMessage, 'getBoundingClientRect').mockReturnValue(
      rect({
        left: 0,
        top: 300,
        width: 300,
        height: 20
      })
    );
    scroller.append(liteMessage);
    document.body.append(scroller);

    dispatcher.handleFeatureMessage(liteMessage, { source: 'added' });

    expect(nativeMessage.classList.contains('ytcq-message-jump-target')).toBe(false);
    expect(liteMessage.classList.contains('ytcq-message-jump-target')).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({
      behavior: 'smooth',
      top: 260
    });
    await vi.advanceTimersByTimeAsync(20);
    expect(liteMessage.classList.contains('ytcq-message-jump-target')).toBe(true);
  });

  it('saves normalized feed text and custom emoji instead of translated DOM text', async () => {
    document.title = 'Example Stream - YouTube';
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_001_000);
    chatFeedRecordMocks.requestRenderedYouTubeChatFeedRecord.mockResolvedValueOnce({
      author: {
        avatarUrl: 'https://example.test/feed-avatar.png',
        badges: [],
        channelId: 'viewer-channel',
        name: '@ViewerOne'
      },
      id: 'message-1',
      kind: 'text',
      plainText: 'Original :wave:',
      runs: [
        { text: 'Original ', type: 'text' },
        {
          alt: ':wave:',
          emojiId: 'wave',
          imageUrl: 'https://example.test/wave.png',
          shortcuts: [':wave:'],
          type: 'emoji'
        }
      ],
      timestampText: '10:00 PM',
      timestampUsec: '1700000000000000'
    });

    const feature = await import('./index');
    feature.initBookmarks();
    await flushAsyncWork();
    const message = createChatMessage('message-1', 'Translated text');
    document.body.append(message);

    await expect(feature.toggleChatBookmark(message)).resolves.toBe(true);
    await expect(chrome.storage.local.get(BOOKMARKS_STORAGE_KEY)).resolves.toMatchObject({
      [BOOKMARKS_STORAGE_KEY]: {
        'message:stream-a:message-1': {
          authorName: '@ViewerOne',
          avatarUrl: 'https://example.test/feed-avatar.png',
          channelId: 'viewer-channel',
          message: {
            contentParts: [
              { text: 'Original ', type: 'text' },
              {
                alt: ':wave:',
                emojiId: 'wave',
                src: 'https://example.test/wave.png',
                type: 'emoji'
              }
            ],
            messageId: 'message-1',
            text: 'Original :wave:',
            timestamp: 1_700_000_000_000,
            timestampText: '10:00 PM'
          },
          savedAt: 1_700_000_001_000,
          sourceKey: 'stream-a',
          sourceTitle: 'Example Stream',
          sourceUrl: 'https://www.youtube.com/watch?v=stream-a'
        }
      }
    });
  });

  it('removes its storage listener during cleanup', async () => {
    const feature = await import('./index');
    feature.initBookmarks();
    await flushAsyncWork();

    feature.cleanupBookmarks();
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(expect.any(Function));
  });
});

function bookmark(
  messageId: string,
  overrides: Partial<ReturnType<typeof createBookmarkFixture>> = {}
) {
  return createBookmarkFixture(messageId, overrides);
}

function createBookmarkFixture(
  messageId: string,
  overrides: Partial<{
    authorName: string;
    avatarSrc: string;
    channelId: string;
    contentParts: Array<{ text: string; type: 'text' }>;
    messageId: string;
    text: string;
    timestamp: number;
    timestampText: string;
  }> = {}
) {
  return {
    authorName: '@ViewerOne',
    avatarSrc: 'https://example.test/avatar.png',
    channelId: 'viewer-channel',
    contentParts: [{ text: `Message ${messageId}`, type: 'text' as const }],
    messageId,
    text: `Message ${messageId}`,
    timestamp: 1_700_000_000_000,
    timestampText: '10:00 PM',
    ...overrides
  };
}

function createChatMessage(messageId: string, text: string): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer');
  message.id = messageId;
  message.innerHTML = `
    <span id="author-photo"><img src="https://example.test/dom-avatar.png"></span>
    <a href="/channel/viewer-channel"><span id="author-name">@ViewerOne</span></a>
    <span id="timestamp">10:00 PM</span>
    <span id="message">${text}</span>
  `;
  return message;
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
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top
  } as DOMRect;
}

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await Promise.resolve();
}
