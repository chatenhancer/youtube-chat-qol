import { describe, expect, it } from 'vitest';
import { parseYouTubeChatFeedBatchDetail } from './batch';
import {
  createYouTubeChatFeedEventBatches,
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

  it('validates and preserves a snapshot marker across split event batches', () => {
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

    const batches = createYouTubeChatFeedEventBatches({
      actions,
      receivedAt: 100_000,
      snapshot: true,
      source: 'live'
    }, 0);

    expect(batches).toHaveLength(2);
    expect(batches.every((batch) => batch.snapshot === true)).toBe(true);
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify(batches[0])))
      .toMatchObject({ snapshot: true });
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify({
      ...batches[0],
      snapshot: 'yes'
    }))).toBeNull();
  });

  it('validates additive rendered-row requests without mixing snapshot modes', () => {
    expect(parseYouTubeChatFeedControl(JSON.stringify({
      consumer: 'records',
      enabled: true,
      requestRendered: true,
      version: 1
    }))).toEqual({
      consumer: 'records',
      enabled: true,
      requestRendered: true,
      version: 1
    });
    expect(parseYouTubeChatFeedControl(JSON.stringify({
      consumer: 'records',
      enabled: true,
      requestRendered: 'yes',
      version: 1
    }))).toBeNull();
    expect(parseYouTubeChatFeedControl(JSON.stringify({
      consumer: 'records',
      enabled: true,
      requestInitial: true,
      requestRendered: true,
      version: 1
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
    source: 'live',
    version: 1
  };
}
