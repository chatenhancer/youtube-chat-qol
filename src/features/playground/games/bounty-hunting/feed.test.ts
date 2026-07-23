import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { YouTubeChatFeedBatch } from '../../../../youtube/chat-feed/source';
import type {
  YouTubeChatFeedAction,
  YouTubeChatMessageRecord
} from '../../../../youtube/chat-feed/protocol';

const feedMocks = vi.hoisted(() => ({
  onBatch: null as ((batch: YouTubeChatFeedBatch) => void) | null,
  snapshot: [] as YouTubeChatMessageRecord[],
  subscribe: vi.fn((subscription: { onBatch: (batch: YouTubeChatFeedBatch) => void }) => {
    feedMocks.onBatch = subscription.onBatch;
    return feedMocks.unsubscribe;
  }),
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
  subscribeYouTubeChatFeed: feedMocks.subscribe
}));

import {
  createBountyHuntingChatFeed,
  createBountyHuntingChatFeedMessage
} from './feed';

describe('Bounty Hunting chat feed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    feedMocks.onBatch = null;
    feedMocks.snapshot = [];
  });

  it('derives candidate facts from normalized records rather than rendered DOM', () => {
    const message = createBountyHuntingChatFeedMessage({
      ...createRecord('message-1', '🤠 :party_parrot:'),
      author: {
        badges: [
          { kind: 'member', label: 'Miembro' },
          { kind: 'moderator', label: 'Modérateur' },
          { kind: 'verified', label: 'Verifiziert' }
        ],
        channelId: 'channel-1',
        isOwner: true,
        name: '@RankedFan',
        topFanRank: 2
      },
      kind: 'paid',
      paid: { amountText: '$5.00' },
      runs: [
        {
          alt: '🤠',
          imageUrl: 'https://example.test/cowboy.png',
          shortcuts: [],
          type: 'emoji'
        },
        {
          alt: ':party_parrot:',
          emojiId: 'custom-1',
          imageUrl: 'https://example.test/parrot.png',
          shortcuts: [':party_parrot:'],
          type: 'emoji'
        }
      ],
      timestampUsec: '103000001'
    });

    expect(message).toMatchObject({
      authorName: '@RankedFan',
      channelId: 'channel-1',
      emojiCount: 2,
      hasCustomEmoji: true,
      hasOnlyEmojis: true,
      isChannelMemberAuthor: true,
      isChannelOwnerAuthor: true,
      isModeratorAuthor: true,
      isSuperChat: true,
      isTopFanAuthor: true,
      isVerifiedAuthor: true,
      messageId: 'message-1',
      messageTimestampUsec: '103000001'
    });
  });

  it('does not infer Top-fan status from message text', () => {
    expect(createBountyHuntingChatFeedMessage(
      createRecord('message-rank-text', 'I am #2 today')
    )).toMatchObject({
      isTopFanAuthor: false,
      messageId: 'message-rank-text'
    });
  });

  it('seeds, updates, removes, and resets one feed-owned message index', () => {
    feedMocks.snapshot = [createRecord('existing', 'existing @mention')];
    const onRemove = vi.fn();
    const onReset = vi.fn();
    const onUpsert = vi.fn();
    const feed = createBountyHuntingChatFeed({ onRemove, onReset, onUpsert });

    expect(feed.getMessage('existing')?.hasMention).toBe(true);
    expect(onUpsert).toHaveBeenCalledOnce();
    expect(feedMocks.subscribe).toHaveBeenCalledWith({
      consumer: 'records',
      onBatch: expect.any(Function)
    });

    dispatchActions([upsert(createRecord('new', 'LOUD? 123'))]);
    expect(feed.getMessage('new')).toMatchObject({
      hasAllCaps: true,
      hasNumber: true,
      hasQuestion: true
    });

    dispatchActions([{ channelId: 'channel-1', type: 'remove-author' }]);
    expect(feed.getMessages()).toEqual([]);
    expect(onRemove).toHaveBeenCalledWith('existing');
    expect(onRemove).toHaveBeenCalledWith('new');

    dispatchActions([upsert(createRecord('after-remove', 'hello'))]);
    dispatchActions([
      { type: 'reset' },
      upsert(createRecord('refreshed-history', 'old message'))
    ], 'existing');
    expect(feed.getMessages().map((message) => message.messageId))
      .toEqual(['refreshed-history']);
    expect(onReset).toHaveBeenCalledOnce();
    expect(onUpsert).toHaveBeenCalledTimes(3);

    feed.close();
    expect(feedMocks.unsubscribe).toHaveBeenCalledOnce();
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
    receivedAt: 100_000,
    sequence: 1,
    source: 'live'
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
