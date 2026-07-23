import { describe, expect, it } from 'vitest';
import { parseYouTubeChatFeedBatchDetail } from './batch';
import {
  createYouTubeChatFeedEventBatch,
  parseYouTubeChatFeedControl
} from './page-events';
import type { YouTubeChatFeedAction } from './protocol';

describe('YouTube chat feed batch validation', () => {
  it('accepts sanitized member badges and Top-fan ranks', () => {
    const batch = createBatch({
      badges: [{ kind: 'member', label: 'Member' }],
      name: '@Viewer',
      topFanRank: 2
    });

    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify(batch))).toEqual(batch);
  });

  it('validates YouTube fields by shape without size ceilings', () => {
    const longText = 't'.repeat(20_001);
    const longUrl = `https://example.com/${'u'.repeat(4_500)}`;
    const batch = {
      actions: [{
        record: {
          author: {
            avatarUrl: longUrl,
            badges: Array.from({ length: 25 }, (_value, index) => ({
              iconUrl: longUrl,
              label: `${index}-${'b'.repeat(500)}`
            })),
            channelId: `UC-${'c'.repeat(240)}`,
            name: `@${'a'.repeat(500)}`
          },
          gift: {
            alt: 'g'.repeat(501),
            count: 10_001,
            giftType: 'purchase',
            headerText: 'h'.repeat(2_001),
            imageUrl: longUrl
          },
          id: `message-${'m'.repeat(240)}`,
          kind: 'gift',
          plainText: longText,
          runs: [
            { href: longUrl, text: longText, type: 'text' },
            ...Array.from({ length: 499 }, () => ({ text: 'x', type: 'text' })),
            {
              alt: 'e'.repeat(501),
              emojiId: 'i'.repeat(501),
              imageUrl: longUrl,
              shortcuts: Array.from({ length: 25 }, (_value, index) => `:${index}:`),
              type: 'emoji'
            }
          ],
          timestampText: '1'.repeat(121),
          timestampUsec: '1'.repeat(25)
        },
        type: 'upsert'
      }],
      compatibilityWarnings: Array.from(
        { length: 51 },
        (_value, index) => `${index}-${'w'.repeat(241)}`
      ),
      continuationTimeoutMs: 600_001,
      receivedAt: 100_000,
      sequence: 1,
      source: 'live'
    };

    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify(batch))).toEqual(batch);
  });

  it('accepts complete valid batches regardless of serialized size or action count', () => {
    const longText = 'x'.repeat(2_000_001);
    const batch = {
      actions: Array.from({ length: 501 }, (_value, index) => ({
        record: {
          id: `message-${index}`,
          kind: 'text',
          plainText: index === 0 ? longText : String(index),
          runs: [{ text: index === 0 ? longText : String(index), type: 'text' }]
        },
        type: 'upsert'
      })),
      receivedAt: 100_000,
      sequence: 1,
      source: 'live'
    };
    const detail = JSON.stringify(batch);

    expect(detail.length).toBeGreaterThan(2_000_000);
    const parsed = parseYouTubeChatFeedBatchDetail(detail);
    expect(parsed?.actions).toHaveLength(501);
    expect(parsed?.actions[0]).toMatchObject({
      record: { plainText: longText },
      type: 'upsert'
    });
  });

  it('rejects Top-fan ranks outside the sanitized protocol', () => {
    const batch = createBatch({
      badges: [],
      name: '@Viewer',
      topFanRank: 4
    });

    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify(batch))).toBeNull();
  });

  it('validates the optional startup boundary marker', () => {
    const batch = createBatch({ badges: [], name: '@Viewer' });

    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify({ ...batch, startup: true })))
      .toMatchObject({ startup: true });
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify({ ...batch, startup: 'yes' })))
      .toBeNull();
  });

  it('validates and preserves a snapshot marker on a complete event batch', () => {
    const actions: YouTubeChatFeedAction[] = Array.from({ length: 501 }, (_, index) => ({
      record: {
        author: { badges: [], name: '@Viewer' },
        id: `message-${index}`,
        kind: 'text',
        plainText: `Message ${index}`,
        runs: [{ text: `Message ${index}`, type: 'text' }]
      },
      type: 'upsert'
    }));

    const batch = createYouTubeChatFeedEventBatch({
      actions,
      receivedAt: 100_000,
      snapshot: true,
      source: 'live'
    }, 0);

    expect(batch.actions).toHaveLength(501);
    expect(batch.snapshot).toBe(true);
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify(batch)))
      .toMatchObject({ snapshot: true });
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify({
      ...batch,
      snapshot: 'yes'
    }))).toBeNull();
  });

  it('validates additive rendered-row requests without mixing snapshot modes', () => {
    expect(parseYouTubeChatFeedControl(JSON.stringify({
      consumer: 'records',
      enabled: true,
      requestRendered: true
    }))).toEqual({
      consumer: 'records',
      enabled: true,
      requestRendered: true
    });
    expect(parseYouTubeChatFeedControl(JSON.stringify({
      consumer: 'records',
      enabled: true,
      requestRendered: 'yes'
    }))).toBeNull();
    expect(parseYouTubeChatFeedControl(JSON.stringify({
      consumer: 'records',
      enabled: true,
      requestInitial: true,
      requestRendered: true
    }))).toBeNull();
  });
});

function createBatch(author: Record<string, unknown>): Record<string, unknown> {
  return {
    actions: [{
      record: {
        author,
        id: 'message-1',
        kind: 'text',
        plainText: 'hello',
        runs: [{ text: 'hello', type: 'text' }]
      },
      type: 'upsert'
    }],
    receivedAt: 100_000,
    sequence: 1,
    source: 'live'
  };
}
