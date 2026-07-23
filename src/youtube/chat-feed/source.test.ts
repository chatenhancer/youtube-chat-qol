import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  YOUTUBE_CHAT_FEED_BATCH_EVENT,
  YOUTUBE_CHAT_FEED_CONTROL_EVENT,
  type YouTubeChatFeedAction,
  type YouTubeChatFeedTransportBatch,
  type YouTubeChatFeedControl
} from './protocol';

const cleanups: Array<() => void> = [];

describe('YouTube chat feed source', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.replaceChildren();
    window.history.replaceState({}, '', '/live_chat');
  });

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('validates one event once and fans the same normalized batch out to every consumer', async () => {
    const batchModule = await import('./batch');
    const parseSpy = vi.spyOn(batchModule, 'parseYouTubeChatFeedBatchDetail');
    const { subscribeYouTubeChatFeed } = await import('./source');
    const firstConsumer = vi.fn();
    const secondConsumer = vi.fn();
    const liteConsumer = vi.fn();

    cleanups.push(subscribeYouTubeChatFeed({
      consumer: 'inbox',
      onBatch: firstConsumer
    }));
    cleanups.push(subscribeYouTubeChatFeed({
      consumer: 'inbox',
      onBatch: secondConsumer
    }));
    cleanups.push(subscribeYouTubeChatFeed({
      consumer: 'lite',
      onBatch: liteConsumer
    }));

    dispatchBatch(createBatch(1));

    expect(parseSpy).toHaveBeenCalledOnce();
    expect(firstConsumer).toHaveBeenCalledOnce();
    expect(secondConsumer).toHaveBeenCalledOnce();
    expect(liteConsumer).toHaveBeenCalledOnce();
    const normalizedBatch = firstConsumer.mock.calls[0][0];
    expect(secondConsumer.mock.calls[0][0]).toBe(normalizedBatch);
    expect(liteConsumer.mock.calls[0][0]).toBe(normalizedBatch);
  });

  it('withholds prefetched replay actions until their player offsets are due', async () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    const {
      getYouTubeChatFeedReplayDiagnostics,
      subscribeYouTubeChatFeed
    } = await import('./source');
    const deliveries: string[] = [];

    cleanups.push(subscribeYouTubeChatFeed({
      consumer: 'inbox',
      onBatch: (batch) => batch.actions.forEach((action) => {
        if (action.type === 'upsert') deliveries.push(`inbox:${action.record.id}`);
      })
    }));
    cleanups.push(subscribeYouTubeChatFeed({
      consumer: 'lite',
      onBatch: (batch) => batch.actions.forEach((action) => {
        if (action.type === 'upsert') deliveries.push(`lite:${action.record.id}`);
      })
    }));

    dispatchPlayerProgress(5);
    dispatchBatch({
      ...createBatch(1, [createUpsert('due', 5_000), createUpsert('future', 6_000)]),
      replayPlayerOffsetMs: 5_000,
      source: 'replay'
    });

    expect(deliveries).toHaveLength(2);
    expect(deliveries).toEqual(expect.arrayContaining(['inbox:due', 'lite:due']));
    expect(getYouTubeChatFeedReplayDiagnostics().pendingActions).toBe(1);
    dispatchPlayerProgress(5.999);
    expect(deliveries).toHaveLength(2);
    dispatchPlayerProgress(6);
    expect(deliveries).toHaveLength(4);
    expect(deliveries).toEqual(expect.arrayContaining([
      'inbox:due',
      'lite:due',
      'inbox:future',
      'lite:future'
    ]));
    expect(getYouTubeChatFeedReplayDiagnostics().pendingActions).toBe(0);
  });

  it('retains every prefetched replay action regardless of queue count or serialized size', async () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    const {
      getYouTubeChatFeedReplayDiagnostics,
      subscribeYouTubeChatFeed
    } = await import('./source');
    const errors = vi.fn();
    const timelineDeliveries: number[] = [];

    cleanups.push(subscribeYouTubeChatFeed({
      consumer: 'lite',
      onBatch: (batch) => {
        if (batch.delivery === 'replay-timeline') {
          timelineDeliveries.push(batch.actions.length);
        }
      },
      onError: errors
    }));

    const largeAction = createUpsert('future-0', 6_000);
    if (largeAction.type !== 'upsert') throw new Error('Expected an upsert fixture');
    largeAction.record.plainText = 'x'.repeat(8 * 1024 * 1024);
    largeAction.record.runs = [];
    const actions = [
      largeAction,
      ...Array.from({ length: 2_000 }, (_value, index) =>
        createUpsert(`future-${index + 1}`, 6_000)
      )
    ];

    dispatchPlayerProgress(5);
    dispatchBatch({
      ...createBatch(1, actions),
      replayPlayerOffsetMs: 5_000,
      source: 'replay'
    });

    const queued = getYouTubeChatFeedReplayDiagnostics();
    expect(queued.pendingActions).toBe(2_001);
    expect(errors).not.toHaveBeenCalled();

    dispatchPlayerProgress(6);
    expect(timelineDeliveries).toEqual([2_001]);
    expect(getYouTubeChatFeedReplayDiagnostics().pendingActions).toBe(0);
  });

  it('advances through a replay message that YouTube has already rendered', async () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    const {
      getYouTubeChatFeedReplayDiagnostics,
      reconcileYouTubeChatFeedReplayWithRenderedMessage,
      subscribeYouTubeChatFeed
    } = await import('./source');
    const deliveries: Array<{ activity: string; ids: string[] }> = [];

    cleanups.push(subscribeYouTubeChatFeed({
      consumer: 'records',
      onBatch: (batch) => deliveries.push({
        activity: batch.activity,
        ids: batch.actions.flatMap((action) => action.type === 'upsert'
          ? [action.record.id]
          : [])
      })
    }));

    dispatchBatch({
      ...createBatch(1, [
        { type: 'reset' },
        createUpsert('before-visible', 4_000),
        createUpsert('visible', 5_000),
        createUpsert('future', 6_000)
      ]),
      source: 'initial'
    });

    expect(deliveries).toEqual([{ activity: 'existing', ids: [] }]);
    expect(reconcileYouTubeChatFeedReplayWithRenderedMessage(
      createRenderedMessage('missing')
    )).toBe(false);
    expect(reconcileYouTubeChatFeedReplayWithRenderedMessage(
      createRenderedMessage('visible')
    )).toBe(true);
    expect(deliveries).toEqual([
      { activity: 'existing', ids: [] },
      { activity: 'existing', ids: ['before-visible', 'visible'] }
    ]);
    expect(getYouTubeChatFeedReplayDiagnostics().pendingActions).toBe(1);
  });

  it('keeps startup replay backlog existing while future timeline actions become new', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    window.history.replaceState({}, '', '/live_chat_replay');
    const { subscribeYouTubeChatFeed } = await import('./source');
    const deliveries: Array<{
      activity: 'existing' | 'new';
      delivery: 'replay-timeline' | 'transport';
      ids: string[];
    }> = [];

    cleanups.push(subscribeYouTubeChatFeed({
      consumer: 'inbox',
      onBatch: (batch) => deliveries.push({
        activity: batch.activity,
        delivery: batch.delivery,
        ids: batch.actions.flatMap((action) => action.type === 'upsert' ? [action.record.id] : [])
      })
    }));

    dispatchPlayerProgress(5);
    dispatchBatch({
      ...createBatch(1, [
        { type: 'reset' },
        createUpsert('startup-current', 5_000),
        createUpsert('startup-future', 6_000)
      ]),
      receivedAt: 9_000,
      source: 'initial'
    });

    expect(deliveries).toEqual([
      { activity: 'existing', delivery: 'transport', ids: [] },
      { activity: 'existing', delivery: 'replay-timeline', ids: ['startup-current'] }
    ]);

    dispatchPlayerProgress(6);
    expect(deliveries.at(-1)).toEqual({
      activity: 'new',
      delivery: 'replay-timeline',
      ids: ['startup-future']
    });
  });

  it('adds a rendered-row snapshot without clearing prefetched replay actions', async () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    const {
      getYouTubeChatFeedReplayDiagnostics,
      subscribeYouTubeChatFeed
    } = await import('./source');
    const deliveries: string[] = [];

    cleanups.push(subscribeYouTubeChatFeed({
      consumer: 'records',
      onBatch: (batch) => batch.actions.forEach((action) => {
        if (action.type === 'upsert') deliveries.push(action.record.id);
      })
    }));

    dispatchPlayerProgress(5);
    dispatchBatch({
      ...createBatch(1, [createUpsert('future', 6_000)]),
      replayPlayerOffsetMs: 5_000,
      source: 'replay'
    });
    expect(getYouTubeChatFeedReplayDiagnostics().pendingActions).toBe(1);

    dispatchBatch({
      ...createBatch(2, [createUpsert('rendered')]),
      source: 'initial'
    });
    expect(deliveries).toEqual(['rendered']);
    expect(getYouTubeChatFeedReplayDiagnostics().pendingActions).toBe(1);

    dispatchPlayerProgress(6);
    expect(deliveries).toEqual(['rendered', 'future']);
  });

  it('keeps replay seek history existing while later timeline actions become new', async () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    const { subscribeYouTubeChatFeed } = await import('./source');
    const deliveries: Array<{
      activity: 'existing' | 'new';
      delivery: 'replay-timeline' | 'transport';
      ids: string[];
    }> = [];

    cleanups.push(subscribeYouTubeChatFeed({
      consumer: 'inbox',
      onBatch: (batch) => deliveries.push({
        activity: batch.activity,
        delivery: batch.delivery,
        ids: batch.actions.flatMap((action) => action.type === 'upsert' ? [action.record.id] : [])
      })
    }));

    dispatchBatch({
      ...createBatch(1, [
        { type: 'reset' },
        createUpsert('seek-history', 50_000),
        createUpsert('after-seek', 51_000)
      ]),
      replayPlayerOffsetMs: 50_000,
      source: 'replay'
    });

    expect(deliveries).toEqual([
      { activity: 'new', delivery: 'transport', ids: [] },
      { activity: 'existing', delivery: 'replay-timeline', ids: ['seek-history'] }
    ]);

    dispatchPlayerProgress(51);
    expect(deliveries.at(-1)).toEqual({
      activity: 'new',
      delivery: 'replay-timeline',
      ids: ['after-seek']
    });
  });

  it('marks responses captured before the shared source starts as existing', async () => {
    const { subscribeYouTubeChatFeed } = await import('./source');
    const activities: string[] = [];

    cleanups.push(subscribeYouTubeChatFeed({
      consumer: 'inbox',
      onBatch: (batch) => activities.push(batch.activity)
    }));
    dispatchBatch({ ...createBatch(1), startup: true });
    dispatchBatch(createBatch(2));

    expect(activities).toEqual(['existing', 'new']);
  });

  it('keeps offsetless replay seek history existing when the response is a snapshot', async () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    const { subscribeYouTubeChatFeed } = await import('./source');
    const deliveries: Array<{ activity: string; ids: string[] }> = [];

    cleanups.push(subscribeYouTubeChatFeed({
      consumer: 'inbox',
      onBatch: (batch) => deliveries.push({
        activity: batch.activity,
        ids: batch.actions.flatMap((action) => action.type === 'upsert'
          ? [action.record.id]
          : [])
      })
    }));

    dispatchBatch({
      ...createBatch(1, [
        { type: 'reset' },
        createUpsert('snapshot-history')
      ]),
      replayPlayerOffsetMs: 50_000,
      snapshot: true,
      source: 'replay'
    });

    expect(deliveries).toEqual([
      { activity: 'existing', ids: ['snapshot-history'] }
    ]);
  });

  it('waits for fresh progress before classifying an offsetless replay seek', async () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    const {
      getYouTubeChatFeedReplayDiagnostics,
      subscribeYouTubeChatFeed
    } = await import('./source');
    const deliveries: Array<{ activity: string; id: string }> = [];

    cleanups.push(subscribeYouTubeChatFeed({
      consumer: 'inbox',
      onBatch: (batch) => batch.actions.forEach((action) => {
        if (action.type === 'upsert') {
          deliveries.push({ activity: batch.activity, id: action.record.id });
        }
      })
    }));

    dispatchBatch({
      ...createBatch(1),
      replayPlayerOffsetMs: 10_000,
      source: 'replay'
    });
    dispatchBatch({
      ...createBatch(2, [
        { type: 'reset' },
        createUpsert('seek-current', 50_000),
        createUpsert('seek-future', 51_000)
      ]),
      source: 'replay'
    });

    expect(deliveries).toEqual([]);
    expect(getYouTubeChatFeedReplayDiagnostics().pendingActions).toBe(2);

    dispatchPlayerProgress(50);
    expect(deliveries).toEqual([{ activity: 'existing', id: 'seek-current' }]);

    dispatchPlayerProgress(51);
    expect(deliveries).toEqual([
      { activity: 'existing', id: 'seek-current' },
      { activity: 'new', id: 'seek-future' }
    ]);
  });

  it('advances the replay timeline from request offsets when player messages are unavailable', async () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    const { subscribeYouTubeChatFeed } = await import('./source');
    const deliveredIds: string[] = [];

    cleanups.push(subscribeYouTubeChatFeed({
      consumer: 'inbox',
      onBatch: (batch) => batch.actions.forEach((action) => {
        if (action.type === 'upsert') deliveredIds.push(action.record.id);
      })
    }));

    dispatchBatch({
      ...createBatch(1, [createUpsert('prefetched', 8_000)]),
      replayPlayerOffsetMs: 5_000,
      source: 'replay'
    });
    expect(deliveredIds).toEqual([]);

    dispatchBatch({
      ...createBatch(2),
      replayPlayerOffsetMs: 8_000,
      source: 'replay'
    });
    expect(deliveredIds).toEqual(['prefetched']);
  });

  it('controls Inbox and Lite independently and disables each after its final unsubscribe', async () => {
    const controls: YouTubeChatFeedControl[] = [];
    const onControl = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        controls.push(JSON.parse(event.detail) as YouTubeChatFeedControl);
      }
    };
    window.addEventListener(YOUTUBE_CHAT_FEED_CONTROL_EVENT, onControl);
    cleanups.push(() => window.removeEventListener(YOUTUBE_CHAT_FEED_CONTROL_EVENT, onControl));
    const { subscribeYouTubeChatFeed } = await import('./source');
    const inboxOne = vi.fn();
    const inboxTwo = vi.fn();
    const lite = vi.fn();

    const unsubscribeInboxOne = subscribeYouTubeChatFeed({
      consumer: 'inbox',
      onBatch: inboxOne,
      requestInitial: true
    });
    const unsubscribeInboxTwo = subscribeYouTubeChatFeed({
      consumer: 'inbox',
      onBatch: inboxTwo
    });
    const unsubscribeLite = subscribeYouTubeChatFeed({
      consumer: 'lite',
      onBatch: lite
    });
    cleanups.push(unsubscribeInboxOne, unsubscribeInboxTwo, unsubscribeLite);

    expect(controls).toEqual([
      { consumer: 'inbox', enabled: true, requestInitial: true },
      { consumer: 'lite', enabled: true }
    ]);

    unsubscribeInboxOne();
    expect(controls).toHaveLength(2);
    unsubscribeInboxTwo();
    unsubscribeInboxTwo();
    expect(controls.at(-1)).toEqual({ consumer: 'inbox', enabled: false });
    unsubscribeLite();
    expect(controls.at(-1)).toEqual({ consumer: 'lite', enabled: false });

    dispatchBatch(createBatch(1));
    expect(inboxOne).not.toHaveBeenCalled();
    expect(inboxTwo).not.toHaveBeenCalled();
    expect(lite).not.toHaveBeenCalled();
  });

  it('reports invalid batches, sequence gaps, and non-monotonic sequences to every subscriber', async () => {
    const { subscribeYouTubeChatFeed } = await import('./source');
    const inboxErrors = vi.fn();
    const liteErrors = vi.fn();
    const inboxBatch = vi.fn();
    const liteBatch = vi.fn();

    cleanups.push(subscribeYouTubeChatFeed({
      consumer: 'inbox',
      onBatch: inboxBatch,
      onError: inboxErrors
    }));
    cleanups.push(subscribeYouTubeChatFeed({
      consumer: 'lite',
      onBatch: liteBatch,
      onError: liteErrors
    }));

    window.dispatchEvent(new Event(YOUTUBE_CHAT_FEED_BATCH_EVENT));
    window.dispatchEvent(new CustomEvent(YOUTUBE_CHAT_FEED_BATCH_EVENT, { detail: '{broken' }));
    dispatchBatch(createBatch(1));
    dispatchBatch(createBatch(3));
    dispatchBatch(createBatch(2));
    dispatchBatch(createBatch(2));

    const expectedErrors = [
      ['invalid-batch'],
      ['invalid-batch'],
      ['sequence-gap'],
      ['non-monotonic-sequence']
    ];
    expect(inboxErrors.mock.calls).toEqual(expectedErrors);
    expect(liteErrors.mock.calls).toEqual(expectedErrors);
    expect(inboxBatch.mock.calls.map(([batch]) => batch.sequence)).toEqual([1, 2]);
    expect(liteBatch.mock.calls.map(([batch]) => batch.sequence)).toEqual([1, 2]);
  });
});

function createBatch(sequence: number, actions: YouTubeChatFeedAction[] = []): YouTubeChatFeedTransportBatch {
  return {
    actions,
    receivedAt: 1_000,
    sequence,
    source: 'live'
  };
}

function createUpsert(id: string, replayOffsetMs?: number): YouTubeChatFeedAction {
  return {
    record: {
      author: { badges: [], name: '@ReplayTest' },
      id,
      kind: 'text',
      plainText: id,
      runs: [{ text: id, type: 'text' }]
    },
    ...(replayOffsetMs !== undefined ? { replayOffsetMs } : {}),
    type: 'upsert'
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
