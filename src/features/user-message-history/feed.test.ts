import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { YouTubeChatFeedBatch } from '../../youtube/chat-feed/source';
import type {
  YouTubeChatFeedAction,
  YouTubeChatMessageRecord
} from '../../youtube/chat-feed/protocol';

const feedMocks = vi.hoisted(() => ({
  onBatch: null as ((batch: YouTubeChatFeedBatch) => void) | null,
  requestRenderedRecord: vi.fn<(
    message: HTMLElement
  ) => Promise<YouTubeChatMessageRecord | null>>(),
  snapshot: [] as YouTubeChatMessageRecord[],
  subscribe: vi.fn((subscription: { onBatch: (batch: YouTubeChatFeedBatch) => void }) => {
    feedMocks.onBatch = subscription.onBatch;
    return feedMocks.unsubscribe;
  }),
  unsubscribe: vi.fn()
}));

vi.mock('../../youtube/chat-feed/records', () => ({
  getYouTubeChatFeedRecordState: vi.fn(() => ({
    ready: true,
    records: feedMocks.snapshot
  })),
  requestRenderedYouTubeChatFeedRecord: feedMocks.requestRenderedRecord
}));
vi.mock('../../youtube/chat-feed/source', () => ({
  subscribeYouTubeChatFeed: feedMocks.subscribe
}));

describe('feed-backed user message history', () => {
  let cleanupFeatures: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    feedMocks.onBatch = null;
    feedMocks.requestRenderedRecord.mockReset();
    feedMocks.requestRenderedRecord.mockResolvedValue(null);
    feedMocks.snapshot = [];
    document.body.replaceChildren();
    window.history.replaceState({}, '', '/live_chat');
  });

  afterEach(() => {
    cleanupFeatures?.();
    cleanupFeatures = null;
    document.body.replaceChildren();
  });

  it('creates recent history directly from normalized feed records', async () => {
    const history = await initHistory();
    const listener = vi.fn();
    history.onUserMessagesChanged(listener);

    dispatchActions([upsert(createRecord('message-1', '@FeedViewer', 'hello feed'))]);

    expect(history.getRecentMessagesForIdentity({
      authorName: '@FeedViewer',
      channelId: 'feed-channel'
    })).toMatchObject([{
      authorName: '@FeedViewer',
      avatarSrc: 'https://example.test/avatar.jpg',
      channelId: 'feed-channel',
      contentParts: [{ text: 'hello feed', type: 'text' }],
      messageId: 'message-1',
      text: 'hello feed'
    }]);
    expect(listener).toHaveBeenCalledWith('channel:feed-channel');
  });

  it('notifies each changed user only once per feed batch', async () => {
    const history = await initHistory();
    const listener = vi.fn();
    history.onUserMessagesChanged(listener);

    dispatchActions([
      upsert(createRecord('message-1', '@FeedViewer', 'first')),
      upsert(createRecord('message-2', '@FeedViewer', 'second')),
      upsert(createRecord('message-3', '@FeedViewer', 'third'))
    ]);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('channel:feed-channel');
  });

  it('seeds the current record snapshot without requesting another initial load', async () => {
    feedMocks.snapshot = [createRecord('message-0', '@ExistingViewer', 'existing feed')];

    const history = await initHistory();

    expect(history.getLatestMessageForIdentity({
      authorName: '@ExistingViewer',
      channelId: 'feed-channel'
    })?.text).toBe('existing feed');
    expect(feedMocks.subscribe).toHaveBeenCalledWith(expect.not.objectContaining({
      requestInitial: true
    }));
  });

  it('uses replay offsets for history order and display time', async () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    const history = await initHistory();

    dispatchActions([
      {
        ...upsert(createRecord('message-1', '@ReplayViewer', 'current replay message')),
        replayOffsetMs: 1_142_000
      }
    ], 'replay');

    expect(history.getLatestMessageForIdentity({
      authorName: '@ReplayViewer',
      channelId: 'feed-channel'
    })).toMatchObject({
      text: 'current replay message',
      timestampText: '19:02'
    });
  });

  it('binds a matching DOM row without replacing feed-owned message data', async () => {
    const history = await initHistory();
    dispatchActions([upsert(createRecord('message-1', '@FeedViewer', 'feed text'))]);
    const knownMessage = createDomMessage('message-1', '@RenderedViewer', 'rendered text');
    knownMessage.querySelector('#author-photo')?.append(createImage('https://example.test/dom-avatar.jpg'));
    knownMessage.querySelector('#timestamp')!.textContent = '1:23 PM';
    const unknownMessage = createDomMessage('unknown-message', '@UnknownViewer', 'DOM only');

    history.recordUserMessage(knownMessage);
    history.recordUserMessage(unknownMessage);

    const knownRecord = history.getLatestMessageForIdentity({
      authorName: '@FeedViewer',
      channelId: 'feed-channel'
    });
    expect(knownRecord).toMatchObject({
      authorName: '@FeedViewer',
      avatarSrc: 'https://example.test/avatar.jpg',
      contentParts: [{ text: 'feed text', type: 'text' }],
      text: 'feed text',
      timestampText: '10:30 PM'
    });
    expect(knownRecord?.messageRef?.deref()).toBe(knownMessage);
    expect(history.getRecentMessagesForIdentity({ authorName: '@UnknownViewer' })).toEqual([]);

    const translationEvents = await import('../translation/events');
    translationEvents.emitMessageTranslationRendered({
      message: knownMessage,
      originalText: 'feed text',
      protectedTokens: [],
      result: { sourceLanguage: 'es', targetLanguage: 'en', text: 'translated text' },
      sourceText: 'feed text'
    });
    expect(knownRecord?.translation?.result.text).toBe('translated text');

    dispatchActions([upsert(createRecord('unknown-message', '@UnknownViewer', 'late feed text'))]);
    history.recordUserMessage(unknownMessage);
    expect(history.getLatestMessageForIdentity({
      authorName: '@UnknownViewer',
      channelId: 'feed-channel'
    })?.messageRef?.deref()).toBe(unknownMessage);
  });

  it('binds a DOM row when its feed record arrives afterward', async () => {
    let resolveRecord: (record: YouTubeChatMessageRecord | null) => void = () => undefined;
    const requestedRecord = new Promise<YouTubeChatMessageRecord | null>((resolve) => {
      resolveRecord = resolve;
    });
    feedMocks.requestRenderedRecord.mockReturnValue(requestedRecord);
    const history = await initHistory();
    const message = createDomMessage('message-late', '@RenderedViewer', 'rendered text');

    history.recordUserMessage(message);
    const feedRecord = createRecord('message-late', '@FeedViewer', 'feed text');
    dispatchActions([upsert(feedRecord)]);
    resolveRecord(feedRecord);
    await requestedRecord;

    expect(history.getLatestMessageForIdentity({
      authorName: '@FeedViewer',
      channelId: 'feed-channel'
    })?.messageRef?.deref()).toBe(message);
  });

  it('does not bind a row that was recycled while waiting for its feed record', async () => {
    let resolveRecord: (record: YouTubeChatMessageRecord | null) => void = () => undefined;
    const requestedRecord = new Promise<YouTubeChatMessageRecord | null>((resolve) => {
      resolveRecord = resolve;
    });
    feedMocks.requestRenderedRecord.mockReturnValue(requestedRecord);
    const history = await initHistory();
    const message = createDomMessage('message-late', '@RenderedViewer', 'rendered text');

    history.recordUserMessage(message);
    const feedRecord = createRecord('message-late', '@FeedViewer', 'feed text');
    dispatchActions([upsert(feedRecord)]);
    message.setAttribute('data-message-id', 'recycled-message');
    resolveRecord(feedRecord);
    await requestedRecord;

    expect(history.getLatestMessageForIdentity({
      authorName: '@FeedViewer',
      channelId: 'feed-channel'
    })?.messageRef).toBeUndefined();
  });

  it('associates a translation when its DOM row arrives before the feed record', async () => {
    let resolveRecord: (record: YouTubeChatMessageRecord | null) => void = () => undefined;
    const requestedRecord = new Promise<YouTubeChatMessageRecord | null>((resolve) => {
      resolveRecord = resolve;
    });
    feedMocks.requestRenderedRecord.mockReturnValue(requestedRecord);
    const history = await initHistory();
    const message = createDomMessage('message-late', '@RenderedViewer', 'rendered text');
    const translationEvents = await import('../translation/events');

    translationEvents.emitMessageTranslationRendered({
      message,
      originalText: 'feed text',
      protectedTokens: [],
      result: { sourceLanguage: 'es', targetLanguage: 'en', text: 'translated text' },
      sourceText: 'feed text'
    });
    const feedRecord = createRecord('message-late', '@FeedViewer', 'feed text');
    dispatchActions([upsert(feedRecord)]);
    resolveRecord(feedRecord);
    await requestedRecord;

    const historyRecord = history.getLatestMessageForIdentity({
      authorName: '@FeedViewer',
      channelId: 'feed-channel'
    });
    expect(historyRecord).toMatchObject({
      translation: {
        result: { text: 'translated text' }
      }
    });
    expect(historyRecord?.messageRef?.deref()).toBe(message);
  });

  it('limits recent-message views without truncating shared page history', async () => {
    const history = await initHistory();
    dispatchActions(Array.from({ length: 13 }, (_, index) => upsert(createRecord(
      `message-${index}`,
      '@BusyViewer',
      `message ${index}`
    ))));

    const recent = history.getRecentMessagesForIdentity({
      authorName: '@BusyViewer',
      channelId: 'feed-channel'
    });

    expect(recent).toHaveLength(12);
    expect(recent[0].text).toBe('message 1');
    expect(recent.at(-1)?.text).toBe('message 12');
    expect(history.getUserMessageHistorySnapshot()).toHaveLength(13);
  });

  it('limits recent-user matching without deleting older user history', async () => {
    const history = await initHistory();
    const baseTimestampUsec = 1_780_317_000_000_000;
    dispatchActions(Array.from({ length: 161 }, (_, index) => upsert(createRecord(
      `message-${index}`,
      `@User${index}`,
      `message ${index}`,
      {
        channelId: `channel-${index}`,
        timestampUsec: String(baseTimestampUsec + index * 1_000_000)
      }
    ))));

    expect(history.findRecentUsersByHandle('@User0')).toEqual([]);
    expect(history.findRecentUsersByHandle('@User160')).toMatchObject([{
      authorName: '@User160',
      latestMessage: { text: 'message 160' }
    }]);
    expect(history.getRecentMessagesForIdentity({
      authorName: '@User0',
      channelId: 'channel-0'
    })).toMatchObject([{ text: 'message 0' }]);
  });

  it('looks up history by stable channel identity and author fallback', async () => {
    const history = await initHistory();
    dispatchActions([
      upsert(createRecord('channel-message', '@OldHandle', 'channel-backed', {
        channelId: 'stable-channel'
      })),
      upsert(createRecord('author-message', '@FallbackHandle', 'author-backed', {
        omitChannelId: true
      }))
    ]);

    expect(history.getRecentMessagesForIdentity({
      authorName: '@NewHandle',
      channelId: 'stable-channel'
    })).toMatchObject([{ authorName: '@OldHandle', text: 'channel-backed' }]);
    expect(history.getRecentMessagesForIdentity({
      authorName: '@FallbackHandle'
    })).toMatchObject([{ text: 'author-backed' }]);
  });

  it('prefers exact recent-handle matches and dedupes shared handle fallbacks', async () => {
    const history = await initHistory();
    dispatchActions([
      upsert(createRecord('prefix', '@ViewerExtra', 'prefix match', {
        channelId: 'prefix-channel',
        timestampUsec: '1780317000000000'
      })),
      upsert(createRecord('older-shared', '@Viewer', 'older exact match', {
        channelId: 'older-channel',
        timestampUsec: '1780317001000000'
      })),
      upsert(createRecord('newer-shared', '@Viewer', 'newer exact match', {
        channelId: 'newer-channel',
        timestampUsec: '1780317002000000'
      }))
    ]);

    expect(history.findRecentUsersByHandle('@Viewer')).toMatchObject([{
      identity: { channelId: 'newer-channel' },
      latestMessage: { text: 'newer exact match' }
    }]);
    expect(history.findRecentUsersByHandle('   ')).toEqual([]);
  });

  it('notifies history listeners until they unsubscribe', async () => {
    const history = await initHistory();
    const listener = vi.fn();
    const unsubscribe = history.onUserMessagesChanged(listener);

    dispatchActions([upsert(createRecord('first', '@ListenerViewer', 'first'))]);
    unsubscribe();
    dispatchActions([upsert(createRecord('second', '@ListenerViewer', 'second'))]);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('channel:feed-channel');
  });

  it('binds visible DOM rows without treating unknown rows as message data', async () => {
    const history = await initHistory();
    dispatchActions([upsert(createRecord('visible-message', '@VisibleViewer', 'feed text'))]);
    const known = createDomMessage('visible-message', '@RenderedViewer', 'rendered text');
    createDomMessage('unknown-message', '@UnknownViewer', 'DOM only');

    history.recordVisibleUserMessages();

    expect(history.getLatestMessageForIdentity({
      authorName: '@VisibleViewer',
      channelId: 'feed-channel'
    })?.messageRef?.deref()).toBe(known);
    expect(history.getRecentMessagesForIdentity({ authorName: '@UnknownViewer' })).toEqual([]);
  });

  it('clears one or all rendered translations from feed-backed records', async () => {
    const history = await initHistory();
    dispatchActions([
      upsert(createRecord('translated', '@TranslatedViewer', 'hola', {
        channelId: 'translated-channel'
      })),
      upsert(createRecord('other', '@OtherViewer', 'adios', {
        channelId: 'other-channel'
      }))
    ]);
    const translated = createDomMessage('translated', '@TranslatedViewer', 'hola');
    const other = createDomMessage('other', '@OtherViewer', 'adios');
    history.recordUserMessage(translated);
    history.recordUserMessage(other);
    const translationEvents = await import('../translation/events');

    emitTranslation(translationEvents, translated, 'hello');
    translationEvents.emitMessageTranslationCleared(translated);
    expect(history.getLatestMessageForIdentity({
      authorName: '@TranslatedViewer',
      channelId: 'translated-channel'
    })?.translation).toBeUndefined();

    emitTranslation(translationEvents, translated, 'hello again');
    emitTranslation(translationEvents, other, 'goodbye');
    translationEvents.emitMessageTranslationsCleared();
    expect(history.getLatestMessageForIdentity({
      authorName: '@TranslatedViewer',
      channelId: 'translated-channel'
    })?.translation).toBeUndefined();
    expect(history.getLatestMessageForIdentity({
      authorName: '@OtherViewer',
      channelId: 'other-channel'
    })?.translation).toBeUndefined();
  });

  it('bounds the complete retained history', async () => {
    const history = await initHistory();
    const baseTimestampUsec = 1_780_317_000_000_000;
    dispatchActions(Array.from({ length: 1_921 }, (_, index) => upsert(createRecord(
      `message-${index}`,
      `@PruneUser${index}`,
      `message ${index}`,
      {
        channelId: `prune-channel-${index}`,
        timestampUsec: String(baseTimestampUsec + index * 1_000)
      }
    ))));

    expect(history.getUserMessageHistorySnapshot()).toHaveLength(1_920);
    expect(history.getRecentMessagesForIdentity({
      authorName: '@PruneUser0',
      channelId: 'prune-channel-0'
    })).toEqual([]);
    expect(history.getLatestMessageForIdentity({
      authorName: '@PruneUser1920',
      channelId: 'prune-channel-1920'
    })?.text).toBe('message 1920');
  });

  it('returns empty values when identity or record data is unavailable', async () => {
    const history = await initHistory();

    expect(history.getLatestMessageForIdentity({ authorName: '@MissingViewer' })).toBeNull();
    expect(history.getRecentMessagesForIdentity({ authorName: '' })).toEqual([]);
    expect(history.getAvatarSrcForIdentity({ authorName: '@MissingViewer' })).toBe('');
    expect(history.getLiveMessageForRecord({
      authorName: '@Detached',
      contentParts: [],
      id: 1,
      text: 'detached',
      timestamp: 1,
      timestampText: '12:00 PM'
    })).toBeNull();
  });

  it('removes and resets feed-owned history records', async () => {
    const history = await initHistory();
    dispatchActions([upsert(createRecord('message-1', '@FeedViewer', 'first'))]);
    dispatchActions([{ id: 'message-1', type: 'remove' }]);
    expect(history.getUserMessageHistorySnapshot()).toEqual([]);

    dispatchActions([upsert(createRecord('message-2', '@FeedViewer', 'second'))]);
    dispatchActions([{ type: 'reset' }], 'replay');
    expect(history.getUserMessageHistorySnapshot()).toEqual([]);
  });

  async function initHistory(): Promise<typeof import('./index')> {
    const history = await import('./index');
    const runtime = await import('../../content/feature-runtime');
    runtime.initFeatures({ saveOptions: vi.fn() });
    cleanupFeatures = runtime.cleanupFeatures;
    return history;
  }
});

function dispatchActions(
  actions: YouTubeChatFeedAction[],
  source: YouTubeChatFeedBatch['source'] = 'live'
): void {
  feedMocks.onBatch?.({
    activity: 'new',
    actions,
    delivery: source === 'replay' ? 'replay-timeline' : 'transport',
    receivedAt: 1_780_318_000_000,
    sequence: 1,
    source,
    version: 1
  });
}

function upsert(record: YouTubeChatMessageRecord): YouTubeChatFeedAction {
  return { record, type: 'upsert' };
}

function createRecord(
  id: string,
  authorName: string,
  plainText: string,
  options: {
    channelId?: string;
    omitChannelId?: boolean;
    timestampUsec?: string;
  } = {}
): YouTubeChatMessageRecord {
  return {
    author: {
      avatarUrl: 'https://example.test/avatar.jpg',
      badges: [],
      ...(!options.omitChannelId
        ? { channelId: options.channelId || 'feed-channel' }
        : {}),
      name: authorName
    },
    id,
    kind: 'text',
    plainText,
    runs: [{ text: plainText, type: 'text' }],
    timestampText: '10:30 PM',
    timestampUsec: options.timestampUsec || '1780317000123000'
  };
}

function emitTranslation(
  events: typeof import('../translation/events'),
  message: HTMLElement,
  text: string
): void {
  events.emitMessageTranslationRendered({
    message,
    originalText: message.querySelector('#message')?.textContent || '',
    protectedTokens: [],
    result: { sourceLanguage: 'es', targetLanguage: 'en', text },
    sourceText: message.querySelector('#message')?.textContent || ''
  });
}

function createDomMessage(
  messageId: string,
  authorName: string,
  text: string
): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer');
  message.setAttribute('data-message-id', messageId);
  message.innerHTML = `
    <span id="timestamp">10:30 PM</span>
    <span id="author-photo"></span>
    <a href="/channel/feed-channel"><span id="author-name">${authorName}</span></a>
    <span id="message">${text}</span>
  `;
  document.body.append(message);
  return message;
}

function createImage(src: string): HTMLImageElement {
  const image = document.createElement('img');
  image.src = src;
  return image;
}
