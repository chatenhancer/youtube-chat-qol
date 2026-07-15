import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  YOUTUBE_CHAT_FEED_BATCH_EVENT,
  YOUTUBE_CHAT_FEED_CONTROL_EVENT,
  type YouTubeChatFeedTransportBatch,
  type YouTubeChatFeedControl,
  type YouTubeChatMessageRecord
} from './protocol';

describe('YouTube chat feed record store', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.replaceChildren();
    window.history.replaceState({}, '', '/live_chat');
  });

  afterEach(async () => {
    const records = await import('./records');
    records.stopYouTubeChatFeedRecordStore();
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('starts one records consumer and resolves DOM lookups from normalized upserts', async () => {
    const controls: YouTubeChatFeedControl[] = [];
    const handleControl = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        controls.push(JSON.parse(event.detail) as YouTubeChatFeedControl);
      }
    };
    window.addEventListener(YOUTUBE_CHAT_FEED_CONTROL_EVENT, handleControl, { once: true });
    const records = await import('./records');
    records.startYouTubeChatFeedRecordStore();
    records.startYouTubeChatFeedRecordStore();

    expect(controls).toEqual([
      { consumer: 'records', enabled: true, requestInitial: true, version: 1 }
    ]);
    expect(records.getYouTubeChatFeedRecordState()).toEqual({
      ready: false,
      records: []
    });

    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.id = 'message-1';
    const pending = records.requestYouTubeChatFeedRecord(message);
    const record = createRecord('message-1', '1782000000000000', 'UC-one');
    dispatchBatch(createBatch(1, [{ record, type: 'upsert' }]));

    await expect(pending).resolves.toEqual(record);
    expect(records.getYouTubeChatFeedRecord(message)).toEqual(record);
    expect(records.getYouTubeChatFeedRecordState()).toEqual({
      ready: true,
      records: [record]
    });
    await expect(records.requestYouTubeChatFeedRecord('message-1')).resolves.toEqual(record);
  });

  it('applies reset, remove, and remove-author actions to the current index', async () => {
    const records = await import('./records');
    records.startYouTubeChatFeedRecordStore();
    const first = createRecord('first', '1782000000000000', 'UC-shared');
    const second = createRecord('second', '1782000000000001', 'UC-shared');
    const third = createRecord('third', '1782000000000002', 'UC-other');

    dispatchBatch(createBatch(1, [
      { type: 'reset' },
      { record: first, type: 'upsert' },
      { record: second, type: 'upsert' },
      { record: third, type: 'upsert' }
    ], 'initial'));
    expect(records.getYouTubeChatFeedRecord('first')).toEqual(first);

    dispatchBatch(createBatch(2, [{ id: 'third', type: 'remove' }]));
    expect(records.getYouTubeChatFeedRecord('third')).toBeNull();

    dispatchBatch(createBatch(3, [{ channelId: 'UC-shared', type: 'remove-author' }]));
    expect(records.getYouTubeChatFeedRecord('first')).toBeNull();
    expect(records.getYouTubeChatFeedRecord('second')).toBeNull();
  });

  it('marks a valid empty batch ready without inventing records', async () => {
    const records = await import('./records');
    records.startYouTubeChatFeedRecordStore();

    dispatchBatch(createBatch(1, [], 'initial'));

    expect(records.getYouTubeChatFeedRecordState()).toEqual({
      ready: true,
      records: []
    });
  });

  it('does not expose prefetched replay records before their playback offset', async () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    const records = await import('./records');
    records.startYouTubeChatFeedRecordStore();
    const record = createRecord('future', undefined, 'UC-future');

    dispatchPlayerProgress(5);
    dispatchBatch(createBatch(1, [{
      record,
      replayOffsetMs: 6_000,
      type: 'upsert'
    }], 'replay'));
    expect(records.getYouTubeChatFeedRecord('future')).toBeNull();

    dispatchPlayerProgress(6);
    expect(records.getYouTubeChatFeedRecord('future')).toEqual(record);
  });

  it('keeps ordinary ID requests passive when replay actions are prefetched', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/live_chat_replay');
    const records = await import('./records');
    const source = await import('./source');
    records.startYouTubeChatFeedRecordStore();
    const controls: YouTubeChatFeedControl[] = [];
    const handleControl = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        controls.push(JSON.parse(event.detail) as YouTubeChatFeedControl);
      }
    };
    window.addEventListener(YOUTUBE_CHAT_FEED_CONTROL_EVENT, handleControl);
    const prefetched = createRecord('prefetched', undefined, 'UC-prefetched');

    dispatchBatch(createBatch(1, [
      { type: 'reset' },
      { record: prefetched, replayOffsetMs: 6_000, type: 'upsert' }
    ], 'initial'));

    const pending = records.requestYouTubeChatFeedRecord('prefetched');
    expect(records.getYouTubeChatFeedRecord('prefetched')).toBeNull();
    expect(source.getYouTubeChatFeedReplayDiagnostics().pendingActions).toBe(1);

    await vi.advanceTimersByTimeAsync(1_500);
    await expect(pending).resolves.toBeNull();
    expect(source.getYouTubeChatFeedReplayDiagnostics().pendingActions).toBe(1);
    expect(controls).toEqual([]);
    window.removeEventListener(YOUTUBE_CHAT_FEED_CONTROL_EVENT, handleControl);
  });

  it('requests one additive shared snapshot when rendered native rows are missing', async () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    const records = await import('./records');
    records.startYouTubeChatFeedRecordStore();
    dispatchBatch(createBatch(1, [{ type: 'reset' }], 'initial'));

    const controls: YouTubeChatFeedControl[] = [];
    const handleControl = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        controls.push(JSON.parse(event.detail) as YouTubeChatFeedControl);
      }
    };
    window.addEventListener(YOUTUBE_CHAT_FEED_CONTROL_EVENT, handleControl);
    const firstMessage = createRenderedMessage('first');
    const secondMessage = createRenderedMessage('second');
    const firstPending = records.requestRenderedYouTubeChatFeedRecord(firstMessage);
    const secondPending = records.requestRenderedYouTubeChatFeedRecord(secondMessage);

    expect(controls).toEqual([{
      consumer: 'records',
      enabled: true,
      requestRendered: true,
      version: 1
    }]);

    const first = createRecord('first', undefined, 'UC-first');
    const second = createRecord('second', undefined, 'UC-second');
    dispatchBatch(createBatch(2, [
      { record: first, type: 'upsert' },
      { record: second, type: 'upsert' }
    ], 'initial'));

    await expect(firstPending).resolves.toEqual(first);
    await expect(secondPending).resolves.toEqual(second);
    window.removeEventListener(YOUTUBE_CHAT_FEED_CONTROL_EVENT, handleControl);
  });

  it('resolves a connected rendered replay row from its pending normalized action', async () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    const records = await import('./records');
    records.startYouTubeChatFeedRecordStore();
    const rendered = createRecord('rendered', undefined, 'UC-rendered');
    const future = createRecord('future', undefined, 'UC-future');

    dispatchBatch(createBatch(1, [
      { type: 'reset' },
      { record: rendered, replayOffsetMs: 6_000, type: 'upsert' },
      { record: future, replayOffsetMs: 7_000, type: 'upsert' }
    ], 'initial'));

    expect(records.getYouTubeChatFeedRecord('rendered')).toBeNull();
    const message = createRenderedMessage('rendered');
    await expect(records.requestRenderedYouTubeChatFeedRecord(message)).resolves.toEqual(rendered);
    expect(records.getYouTubeChatFeedRecord('future')).toBeNull();
  });

  it('does not reconcile a disconnected replay row after the DOM has moved on', async () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    const records = await import('./records');
    const source = await import('./source');
    records.startYouTubeChatFeedRecordStore();
    const stale = createRecord('stale', undefined, 'UC-stale');

    dispatchBatch(createBatch(1, [
      { type: 'reset' },
      { record: stale, replayOffsetMs: 6_000, type: 'upsert' }
    ], 'initial'));
    const message = createRenderedMessage('stale');
    message.remove();

    await expect(records.requestRenderedYouTubeChatFeedRecord(message)).resolves.toBeNull();
    expect(records.getYouTubeChatFeedRecord('stale')).toBeNull();
    expect(source.getYouTubeChatFeedReplayDiagnostics().pendingActions).toBe(1);
  });

  it('does not return a record when YouTube recycles the row during reconciliation', async () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    const records = await import('./records');
    const source = await import('./source');
    records.startYouTubeChatFeedRecordStore();
    const rendered = createRecord('rendered', undefined, 'UC-rendered');
    const message = createRenderedMessage('rendered');
    const unsubscribe = source.subscribeYouTubeChatFeed({
      consumer: 'inbox',
      onBatch: (batch) => {
        if (batch.delivery === 'replay-timeline') {
          message.setAttribute('data-message-id', 'recycled');
        }
      }
    });

    dispatchBatch(createBatch(1, [
      { type: 'reset' },
      { record: rendered, replayOffsetMs: 6_000, type: 'upsert' }
    ], 'initial'));

    await expect(records.requestRenderedYouTubeChatFeedRecord(message)).resolves.toBeNull();
    expect(records.getYouTubeChatFeedRecord('rendered')).toEqual(rendered);
    unsubscribe();
  });

  it('does not reconcile a replay queue from a row on a live chat page', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/live_chat_replay');
    const records = await import('./records');
    const source = await import('./source');
    records.startYouTubeChatFeedRecordStore();
    const prefetched = createRecord('prefetched', undefined, 'UC-prefetched');

    dispatchBatch(createBatch(1, [
      { type: 'reset' },
      { record: prefetched, replayOffsetMs: 6_000, type: 'upsert' }
    ], 'initial'));
    window.history.replaceState({}, '', '/live_chat');
    const message = createRenderedMessage('prefetched');
    const pending = records.requestRenderedYouTubeChatFeedRecord(message);

    expect(source.getYouTubeChatFeedReplayDiagnostics().pendingActions).toBe(1);
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(pending).resolves.toBeNull();
    expect(source.getYouTubeChatFeedReplayDiagnostics().pendingActions).toBe(1);
  });

  it('bounds missing-record waits and resolves them when the store stops', async () => {
    vi.useFakeTimers();
    const records = await import('./records');
    records.startYouTubeChatFeedRecordStore();

    const timedOut = records.requestYouTubeChatFeedRecord('missing');
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(timedOut).resolves.toBeNull();

    const stopped = records.requestYouTubeChatFeedRecord('stopped');
    records.stopYouTubeChatFeedRecordStore();
    await expect(stopped).resolves.toBeNull();
  });
});

function createRecord(
  id: string,
  timestampUsec: string | undefined,
  channelId: string
): YouTubeChatMessageRecord {
  return {
    author: {
      badges: [],
      channelId,
      name: `@${id}`
    },
    id,
    kind: 'text',
    plainText: id,
    runs: [{ text: id, type: 'text' }],
    ...(timestampUsec ? { timestampUsec } : {})
  };
}

function createBatch(
  sequence: number,
  actions: YouTubeChatFeedTransportBatch['actions'],
  source: YouTubeChatFeedTransportBatch['source'] = 'live'
): YouTubeChatFeedTransportBatch {
  return {
    actions,
    receivedAt: Date.now(),
    sequence,
    source,
    version: 1
  };
}

function dispatchBatch(batch: YouTubeChatFeedTransportBatch): void {
  window.dispatchEvent(new CustomEvent(YOUTUBE_CHAT_FEED_BATCH_EVENT, {
    detail: JSON.stringify(batch)
  }));
}

function dispatchPlayerProgress(seconds: number): void {
  window.dispatchEvent(new MessageEvent('message', {
    data: { 'yt-player-video-progress': seconds }
  }));
}

function createRenderedMessage(messageId: string): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer');
  message.setAttribute('data-message-id', messageId);
  document.body.append(message);
  return message;
}
