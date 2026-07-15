import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { YouTubeChatFeedBatch } from '../../../../youtube/chat-feed/source';
import type {
  YouTubeChatFeedAction,
  YouTubeChatMessageRecord
} from '../../../../youtube/chat-feed/protocol';

const feedMocks = vi.hoisted(() => ({
  onBatch: null as ((batch: YouTubeChatFeedBatch) => void) | null,
  snapshot: [] as YouTubeChatMessageRecord[],
  unsubscribe: vi.fn()
}));

vi.mock('../../../../youtube/chat-feed/records', () => ({
  getYouTubeChatFeedRecordState: vi.fn(() => ({
    ready: true,
    records: feedMocks.snapshot
  }))
}));
vi.mock('../../../../youtube/chat-feed/source', () => ({
  isYouTubeChatFeedPage: vi.fn(() => true),
  subscribeYouTubeChatFeed: vi.fn((subscription: {
    onBatch: (batch: YouTubeChatFeedBatch) => void;
  }) => {
    feedMocks.onBatch = subscription.onBatch;
    return feedMocks.unsubscribe;
  })
}));

import {
  createStickAroundChatTrafficObserver,
  type StickAroundChatTrafficObserver
} from './chat-traffic';

describe('Stick Around chat traffic observer', () => {
  let observer: StickAroundChatTrafficObserver | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    feedMocks.onBatch = null;
    feedMocks.snapshot = [];
  });

  afterEach(() => {
    observer?.close();
    observer = null;
    vi.useRealTimers();
  });

  it('seeds existing records without counting them and counts each later stable id once', () => {
    feedMocks.snapshot = [createRecord('message-0', 'existing text')];
    const observations: Array<{ count: number; messageIds: string[] }> = [];
    observer = createStickAroundChatTrafficObserver((observation) => {
      observations.push({
        count: observation.count,
        messageIds: observation.messageIds
      });
    });

    dispatchActions([upsert(createRecord('message-1', 'first text'))]);
    vi.advanceTimersByTime(1_000);

    expect(observations).toEqual([{
      count: 1,
      messageIds: ['message-1']
    }]);
    expect(observer.getMessageTexts().get('message-0')).toBe('existing text');
    expect(observer.getMessageTexts().get('message-1')).toBe('first text');

    dispatchActions([upsert(createRecord('message-1', 'late text'))]);
    vi.advanceTimersByTime(1_000);

    expect(observations).toHaveLength(1);
    expect(observer.getMessageTexts().get('message-1')).toBe('late text');
  });

  it('caches existing-history batches without counting them as traffic', () => {
    const observations: Array<{ count: number; messageIds: string[] }> = [];
    observer = createStickAroundChatTrafficObserver((observation) => {
      observations.push({
        count: observation.count,
        messageIds: observation.messageIds
      });
    });

    dispatchActions(
      [upsert(createRecord('history-message', 'existing history'))],
      'existing'
    );
    vi.advanceTimersByTime(1_000);

    expect(observations).toEqual([]);
    expect(observer.getMessageTexts().get('history-message')).toBe('existing history');

    dispatchActions([upsert(createRecord('new-message', 'new traffic'))]);
    vi.advanceTimersByTime(1_000);

    expect(observations).toEqual([{
      count: 1,
      messageIds: ['new-message']
    }]);
  });

  it('caches rich feed segments for custom emoji bubble rendering', () => {
    observer = createStickAroundChatTrafficObserver(vi.fn());
    dispatchActions([upsert({
      ...createRecord('message-emoji', 'hello :party: chat'),
      runs: [
        { text: 'hello ', type: 'text' },
        {
          alt: ':party:',
          emojiId: 'party-id',
          imageUrl: 'https://example.test/party.png',
          shortcuts: [':party:'],
          type: 'emoji'
        },
        { text: ' chat', type: 'text' }
      ]
    })]);

    expect(observer.getMessageRichTextSegments().get('message-emoji')).toEqual([
      { text: 'hello ', type: 'text' },
      {
        alt: ':party:',
        className: 'emoji yt-formatted-string style-scope yt-live-chat-text-message-renderer',
        emojiId: 'party-id',
        src: 'https://example.test/party.png',
        tooltip: ':party:',
        type: 'emoji'
      },
      { text: ' chat', type: 'text' }
    ]);
  });

  it('clears pending round traffic without clearing cached message text', () => {
    const observations: Array<{ count: number; messageIds: string[] }> = [];
    observer = createStickAroundChatTrafficObserver((observation) => {
      observations.push({
        count: observation.count,
        messageIds: observation.messageIds
      });
    });
    dispatchActions([upsert(createRecord('message-1', 'countdown text'))]);

    observer.reset();
    vi.advanceTimersByTime(1_000);

    expect(observations).toEqual([]);
    expect(observer.getMessageTexts().get('message-1')).toBe('countdown text');
  });

  it('clears timeline state when the shared feed resets', () => {
    observer = createStickAroundChatTrafficObserver(vi.fn());
    dispatchActions([upsert(createRecord('message-1', 'old timeline'))]);

    dispatchActions([{ type: 'reset' }]);

    expect(observer.getMessageTexts()).toHaveLength(0);
    expect(observer.getMessageRichTextSegments()).toHaveLength(0);
  });
});

function dispatchActions(
  actions: YouTubeChatFeedAction[],
  activity: YouTubeChatFeedBatch['activity'] = 'new'
): void {
  feedMocks.onBatch?.({
    activity,
    actions,
    delivery: 'transport',
    receivedAt: Date.now(),
    sequence: 1,
    source: 'live',
    version: 1
  });
}

function upsert(record: YouTubeChatMessageRecord): YouTubeChatFeedAction {
  return { record, type: 'upsert' };
}

function createRecord(id: string, plainText: string): YouTubeChatMessageRecord {
  return {
    author: {
      badges: [],
      channelId: 'channel-1',
      name: '@Viewer'
    },
    id,
    kind: 'text',
    plainText,
    runs: [{ text: plainText, type: 'text' }]
  };
}
