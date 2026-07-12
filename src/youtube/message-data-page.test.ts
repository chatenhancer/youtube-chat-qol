import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  YOUTUBE_MESSAGE_DATA_EVENT,
  YOUTUBE_MESSAGE_DATA_REQUEST_EVENT
} from './message-data-events';
import {
  LITE_CHAT_BATCH_EVENT,
  LITE_CHAT_CONTROL_EVENT,
  LITE_MODE_BOOTSTRAP_INTENT_ATTRIBUTE,
  type LiteChatBatch
} from '../features/lite-mode/protocol';

const LITE_CHAT_TRANSPORT_STATE_KEY = Symbol.for('ytcq:lite-chat-transport:v1');
const originalWindowFetch = window.fetch;

describe('YouTube message data page adapter', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/live_chat');
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanupLiteChatTransport();
    document.documentElement.removeAttribute(LITE_MODE_BOOTSTRAP_INTENT_ATTRIBUTE);
    Reflect.deleteProperty(globalThis, 'ytInitialData');
    document.body.replaceChildren();
  });

  it('emits sanitized data from requested messages, dedupes repeats, and retries late renderer data', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    document.body.replaceChildren();
    const events: CustomEvent<string>[] = [];
    window.addEventListener(YOUTUBE_MESSAGE_DATA_EVENT, (event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') events.push(event);
    });
    await import('./message-data-page');

    const message = document.createElement('yt-live-chat-text-message-renderer') as HTMLElement & { data?: unknown };
    message.id = 'msg-1';
    message.data = {
      authorExternalChannelId: 'UC123',
      authorName: { runs: [{ text: '@Example' }] },
      authorPhoto: {
        thumbnails: [
          { url: 'https://example.test/small.jpg' },
          { url: 'https://example.test/large.jpg' }
        ]
      },
      ignored: { raw: true },
      timestampUsec: '1782000000000000'
    };
    document.body.append(message);

    expect(events).toEqual([]);

    message.dispatchEvent(new CustomEvent(YOUTUBE_MESSAGE_DATA_REQUEST_EVENT, {
      bubbles: true,
      composed: true
    }));

    expect(events).toHaveLength(1);
    expect(events[0].target).toBe(message);
    expect(JSON.parse(events[0].detail || '{}')).toEqual({
      authorExternalChannelId: 'UC123',
      authorName: '@Example',
      authorPhotoUrl: 'https://example.test/large.jpg',
      messageId: 'msg-1',
      timestampUsec: '1782000000000000'
    });

    message.dispatchEvent(new CustomEvent(YOUTUBE_MESSAGE_DATA_REQUEST_EVENT, {
      bubbles: true,
      composed: true
    }));

    expect(events).toHaveLength(1);

    const lateMessage = document.createElement('yt-live-chat-text-message-renderer') as HTMLElement & { data?: unknown };
    lateMessage.id = 'msg-2';
    document.body.append(lateMessage);
    lateMessage.dispatchEvent(new CustomEvent(YOUTUBE_MESSAGE_DATA_REQUEST_EVENT, {
      bubbles: true,
      composed: true
    }));

    expect(events).toHaveLength(1);

    lateMessage.data = {
      authorName: { simpleText: '@Late' },
      timestampUsec: '1782000000000001'
    };
    await vi.advanceTimersByTimeAsync(0);

    expect(events).toHaveLength(2);
    expect(events[1].target).toBe(lateMessage);
    expect(JSON.parse(events[1].detail || '{}')).toEqual({
      authorName: '@Late',
      messageId: 'msg-2',
      timestampUsec: '1782000000000001'
    });

    const liteMessage = document.createElement('div');
    liteMessage.className = 'ytcq-lite-message';
    document.body.append(liteMessage);
    liteMessage.dispatchEvent(new CustomEvent(YOUTUBE_MESSAGE_DATA_REQUEST_EVENT, {
      bubbles: true,
      composed: true
    }));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(events).toHaveLength(2);
  });

  it('installs one serialized fetch tap and emits initial and live sanitized batches', async () => {
    vi.resetModules();
    document.body.replaceChildren();
    const batches: LiteChatBatch[] = [];
    const listener = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== 'string') return;
      batches.push(JSON.parse(event.detail) as LiteChatBatch);
    };
    window.addEventListener(LITE_CHAT_BATCH_EVENT, listener);

    Object.assign(globalThis, {
      ytInitialData: {
        contents: {
          liveChatRenderer: {
            contents: {
              liveChatItemListRenderer: {
                contents: [{
                  liveChatTextMessageRenderer: {
                    id: 'initial-message',
                    authorName: { simpleText: '@Initial' },
                    message: { simpleText: 'Initial text' }
                  }
                }]
              }
            }
          }
        }
      }
    });

    let originalPromise: Promise<Response> | null = null;
    const fetchMock = vi.fn(() => {
      originalPromise = Promise.resolve(jsonResponse({
        continuationContents: {
          liveChatContinuation: {
            actions: [{
              addChatItemAction: {
                item: {
                  liveChatTextMessageRenderer: {
                    id: 'live-message',
                    authorName: { simpleText: '@Live' },
                    message: { simpleText: 'Live text' }
                  }
                }
              }
            }],
            continuations: [{
              invalidationContinuationData: {
                continuation: 'must-not-cross',
                timeoutMs: 9_000
              }
            }]
          }
        }
      }));
      return originalPromise;
    });
    window.fetch = fetchMock as typeof window.fetch;

    await import('./message-data-page');
    const installedWrapper = window.fetch;
    window.dispatchEvent(new CustomEvent(LITE_CHAT_CONTROL_EVENT, {
      detail: { enabled: true, version: 1 }
    }));
    await flushAsyncWork();
    expect(batches).toEqual([]);

    window.dispatchEvent(new CustomEvent(LITE_CHAT_CONTROL_EVENT, {
      detail: JSON.stringify({ enabled: true, requestInitial: true, version: 1 })
    }));
    await flushAsyncWork();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      actions: [
        { type: 'reset' },
        { record: { id: 'initial-message', plainText: 'Initial text' }, type: 'upsert' }
      ],
      sequence: 1,
      source: 'initial',
      version: 1
    });

    const returnedPromise = window.fetch('https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?prettyPrint=false');
    expect(returnedPromise).not.toBe(originalPromise);
    await returnedPromise;
    await flushAsyncWork();

    expect(batches).toHaveLength(2);
    expect(batches[1]).toMatchObject({
      actions: [{
        record: { id: 'live-message', plainText: 'Live text' },
        type: 'upsert'
      }],
      continuationTimeoutMs: 9_000,
      sequence: 2,
      source: 'live',
      version: 1
    });
    expect(JSON.stringify(batches)).not.toContain('must-not-cross');

    vi.resetModules();
    await import('./message-data-page');
    expect(window.fetch).toBe(installedWrapper);

    window.dispatchEvent(new CustomEvent(LITE_CHAT_CONTROL_EVENT, {
      detail: JSON.stringify({ enabled: false, version: 1 })
    }));
    await window.fetch('https://www.youtube.com/youtubei/v1/live_chat/get_live_chat');
    await flushAsyncWork();
    expect(batches).toHaveLength(2);

    window.removeEventListener(LITE_CHAT_BATCH_EVENT, listener);
  });

  it('seeds Lite mode from sanitized native rows when the initial global has no backlog', async () => {
    vi.resetModules();
    document.body.replaceChildren();
    const batches: LiteChatBatch[] = [];
    const listener = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        batches.push(JSON.parse(event.detail) as LiteChatBatch);
      }
    };
    window.addEventListener(LITE_CHAT_BATCH_EVENT, listener);
    window.fetch = vi.fn(() => Promise.resolve(jsonResponse({}))) as typeof window.fetch;

    const nativeMessage = document.createElement('yt-live-chat-text-message-renderer') as MessageRendererFixture;
    nativeMessage.id = 'native-seed-message';
    nativeMessage.data = {
      authorExternalChannelId: 'UCNativeSeed',
      authorName: { simpleText: '@NativeSeed' },
      ignoredSecret: 'must-not-cross',
      message: {
        runs: [
          { text: 'Visible backlog ' },
          {
            emoji: {
              emojiId: 'seed-wave',
              image: { thumbnails: [{ url: 'https://yt3.ggpht.com/seed-wave' }] },
              shortcuts: [':wave:']
            }
          }
        ]
      }
    };
    document.body.append(nativeMessage);

    await import('./message-data-page');
    window.dispatchEvent(new CustomEvent(LITE_CHAT_CONTROL_EVENT, {
      detail: JSON.stringify({ enabled: true, requestInitial: true, version: 1 })
    }));
    await flushAsyncWork();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      actions: [
        { type: 'reset' },
        {
          record: {
            author: {
              channelId: 'UCNativeSeed',
              name: '@NativeSeed'
            },
            id: 'native-seed-message',
            plainText: 'Visible backlog :wave:'
          },
          type: 'upsert'
        }
      ],
      source: 'initial'
    });
    expect(JSON.stringify(batches)).not.toContain('must-not-cross');
    window.removeEventListener(LITE_CHAT_BATCH_EVENT, listener);
  });

  it('uses native history when the optional initial-data global cannot be read', async () => {
    vi.resetModules();
    const batches: LiteChatBatch[] = [];
    const listener = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        batches.push(JSON.parse(event.detail) as LiteChatBatch);
      }
    };
    window.addEventListener(LITE_CHAT_BATCH_EVENT, listener);
    window.fetch = vi.fn(() => Promise.resolve(jsonResponse({}))) as typeof window.fetch;
    Object.defineProperty(globalThis, 'ytInitialData', {
      configurable: true,
      get: () => {
        throw new Error('Initial data is unavailable');
      }
    });
    document.body.append(createNativeMessage('native-without-global', 'Native fallback history'));

    await import('./message-data-page');
    window.dispatchEvent(new CustomEvent(LITE_CHAT_CONTROL_EVENT, {
      detail: JSON.stringify({ enabled: true, requestInitial: true, version: 1 })
    }));
    await flushAsyncWork();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      actions: [
        { type: 'reset' },
        { record: { id: 'native-without-global' }, type: 'upsert' }
      ],
      source: 'initial'
    });
    expect(batches[0].fatalErrors).toBeUndefined();
    window.removeEventListener(LITE_CHAT_BATCH_EVENT, listener);
  });

  it('buffers a replay response that finishes before the first storage control decision', async () => {
    vi.resetModules();
    const batches: LiteChatBatch[] = [];
    const listener = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        batches.push(JSON.parse(event.detail) as LiteChatBatch);
      }
    };
    window.addEventListener(LITE_CHAT_BATCH_EVENT, listener);
    window.fetch = vi.fn(() => Promise.resolve(jsonResponse({
      continuationContents: {
        liveChatContinuation: {
          actions: [textAction('pre-control-replay', 'Captured before storage resolved')]
        }
      }
    }))) as typeof window.fetch;

    await import('./message-data-page');
    await window.fetch('https://www.youtube.com/youtubei/v1/live_chat/get_live_chat_replay');
    await flushAsyncWork();
    expect(batches).toEqual([]);

    dispatchLiteChatControl(true);
    await flushAsyncWork();
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      actions: [{ record: { id: 'pre-control-replay' }, type: 'upsert' }],
      source: 'replay'
    });

    window.dispatchEvent(new CustomEvent(LITE_CHAT_CONTROL_EVENT, {
      detail: JSON.stringify({ enabled: true, requestInitial: true, version: 1 })
    }));
    await flushAsyncWork();
    expect(batches.at(-2)).toMatchObject({
      actions: [
        { type: 'reset' },
        { record: { id: 'pre-control-replay' }, type: 'upsert' }
      ],
      source: 'initial'
    });
    expect(batches.at(-1)).toMatchObject({
      actions: [],
      source: 'replay'
    });
    window.removeEventListener(LITE_CHAT_BATCH_EVENT, listener);
  });

  it('resets replay state from YouTube’s player-seek continuation without resetting normal polls', async () => {
    vi.resetModules();
    window.history.replaceState({}, '', '/live_chat_replay');
    const batches: LiteChatBatch[] = [];
    const listener = collectLiteChatBatches(batches);
    window.addEventListener(LITE_CHAT_BATCH_EVENT, listener);
    window.fetch = vi.fn()
      .mockResolvedValueOnce(replayResponse('baseline', 1_000, 'replay-1', 'seek-1'))
      .mockResolvedValueOnce(replayResponse('seek-result', 100_000, 'replay-2', 'seek-2'))
      .mockResolvedValueOnce(replayResponse('normal-result', 100_100, 'replay-3', 'seek-3')) as typeof window.fetch;

    await import('./message-data-page');
    dispatchLiteChatControl(true);

    await window.fetch(replayRequestInput('initial', 1_000));
    await waitForLiteChatBatchCount(batches, 1);
    await window.fetch(await gzipReplayRequestInput('seek-1', 100_000));
    await waitForLiteChatBatchCount(batches, 2);
    await window.fetch(replayRequestInput('replay-2', 100_100));
    await waitForLiteChatBatchCount(batches, 3);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toMatchObject({
      actions: [{ record: { id: 'baseline' }, type: 'upsert' }],
      replayPlayerOffsetMs: 1_000,
      source: 'replay'
    });
    expect(batches[1]).toMatchObject({
      actions: [
        { type: 'reset' },
        { record: { id: 'seek-result' }, replayOffsetMs: 100_000, type: 'upsert' }
      ],
      replayPlayerOffsetMs: 100_000,
      source: 'replay'
    });
    expect(batches[2]).toMatchObject({
      actions: [{ record: { id: 'normal-result' }, type: 'upsert' }],
      replayPlayerOffsetMs: 100_100,
      source: 'replay'
    });
    window.removeEventListener(LITE_CHAT_BATCH_EVENT, listener);
  });

  it('drops a slow replay response after a newer seek starts', async () => {
    vi.resetModules();
    window.history.replaceState({}, '', '/live_chat_replay');
    const batches: LiteChatBatch[] = [];
    const listener = collectLiteChatBatches(batches);
    window.addEventListener(LITE_CHAT_BATCH_EVENT, listener);

    let resolveSlowBody: (value: string) => void = () => undefined;
    let markSlowReadStarted: () => void = () => undefined;
    const slowBody = new Promise<string>((resolve) => {
      resolveSlowBody = resolve;
    });
    const slowReadStarted = new Promise<void>((resolve) => {
      markSlowReadStarted = resolve;
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(replayResponse('baseline', 1_000, 'replay-1', 'seek-1'))
      .mockResolvedValueOnce(deferredResponse(slowBody, markSlowReadStarted))
      .mockResolvedValueOnce(replayResponse('current-seek', 200_000, 'replay-2', 'seek-2'));
    window.fetch = fetchMock as typeof window.fetch;

    await import('./message-data-page');
    dispatchLiteChatControl(true);
    await window.fetch(replayRequestInput('initial', 1_000));
    await waitForLiteChatBatchCount(batches, 1);

    const slowFetch = window.fetch(replayRequestInput('seek-1', 100_000));
    await slowReadStarted;
    await window.fetch(replayRequestInput('seek-1', 200_000));
    await waitForLiteChatBatchCount(batches, 2);

    expect(batches.map((batch) => batch.actions.at(-1))).toMatchObject([
      { record: { id: 'baseline' } },
      { record: { id: 'current-seek' } }
    ]);
    resolveSlowBody(JSON.stringify(replayPayload('obsolete-seek', 100_000, 'old', 'old-seek')));
    await slowFetch;
    await flushAsyncWork();
    expect(batches).toHaveLength(2);
    window.removeEventListener(LITE_CHAT_BATCH_EVENT, listener);
  });

  it('starts from document intent when its first control event preceded the page adapter', async () => {
    vi.resetModules();
    const batches: LiteChatBatch[] = [];
    const listener = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        batches.push(JSON.parse(event.detail) as LiteChatBatch);
      }
    };
    window.addEventListener(LITE_CHAT_BATCH_EVENT, listener);
    document.documentElement.setAttribute(LITE_MODE_BOOTSTRAP_INTENT_ATTRIBUTE, 'true');
    window.fetch = vi.fn(() => Promise.resolve(jsonResponse({
      continuationContents: {
        liveChatContinuation: {
          actions: [textAction('intent-replay', 'Captured from document intent')]
        }
      }
    }))) as typeof window.fetch;

    await import('./message-data-page');
    await window.fetch('https://www.youtube.com/youtubei/v1/live_chat/get_live_chat_replay');
    await flushAsyncWork();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      actions: [{ record: { id: 'intent-replay' }, type: 'upsert' }],
      source: 'replay'
    });
    window.removeEventListener(LITE_CHAT_BATCH_EVENT, listener);
  });

  it('drains document-start history after the controller attaches its receiver', async () => {
    vi.resetModules();
    document.body.replaceChildren();
    window.fetch = vi.fn(() => Promise.resolve(jsonResponse({}))) as typeof window.fetch;

    const first = createNativeMessage('native-first', 'First history row');
    document.body.append(first);
    await import('./message-data-page');

    window.dispatchEvent(new CustomEvent(LITE_CHAT_CONTROL_EVENT, {
      detail: JSON.stringify({ enabled: true, version: 1 })
    }));
    await flushAsyncWork();

    const batches: LiteChatBatch[] = [];
    const listener = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        batches.push(JSON.parse(event.detail) as LiteChatBatch);
      }
    };
    window.addEventListener(LITE_CHAT_BATCH_EVENT, listener);
    document.body.append(createNativeMessage('native-second', 'Second history row'));

    window.dispatchEvent(new CustomEvent(LITE_CHAT_CONTROL_EVENT, {
      detail: JSON.stringify({ enabled: true, requestInitial: true, version: 1 })
    }));
    // The controller discards native chat synchronously after the control event.
    document.body.replaceChildren();
    await flushAsyncWork();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      actions: [
        { type: 'reset' },
        { record: { id: 'native-first', plainText: 'First history row' }, type: 'upsert' },
        { record: { id: 'native-second', plainText: 'Second history row' }, type: 'upsert' }
      ],
      sequence: 1,
      source: 'initial'
    });
    window.removeEventListener(LITE_CHAT_BATCH_EVENT, listener);
  });

  it('accepts incomplete native history as an empty non-fatal startup snapshot', async () => {
    vi.resetModules();
    document.body.replaceChildren();
    const batches: LiteChatBatch[] = [];
    const listener = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        batches.push(JSON.parse(event.detail) as LiteChatBatch);
      }
    };
    window.addEventListener(LITE_CHAT_BATCH_EVENT, listener);
    window.fetch = vi.fn(() => Promise.resolve(jsonResponse({}))) as typeof window.fetch;

    const incomplete = document.createElement(
      'yt-live-chat-text-message-renderer'
    ) as MessageRendererFixture;
    incomplete.id = 'incomplete-native-seed';
    incomplete.data = {
      authorName: { simpleText: '@StillLoading' },
      timestampUsec: '1780000000000000'
    };
    document.body.append(incomplete);

    await import('./message-data-page');
    window.dispatchEvent(new CustomEvent(LITE_CHAT_CONTROL_EVENT, {
      detail: JSON.stringify({ enabled: true, requestInitial: true, version: 1 })
    }));
    await flushAsyncWork();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      actions: [{ type: 'reset' }],
      source: 'initial'
    });
    expect(batches[0].fatalErrors).toBeUndefined();
    window.removeEventListener(LITE_CHAT_BATCH_EVENT, listener);
  });

  it('keeps a full native seed within the isolated-world 500-action boundary', async () => {
    vi.resetModules();
    const batches: LiteChatBatch[] = [];
    const listener = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        batches.push(JSON.parse(event.detail) as LiteChatBatch);
      }
    };
    window.addEventListener(LITE_CHAT_BATCH_EVENT, listener);
    window.fetch = vi.fn(() => Promise.resolve(jsonResponse({}))) as typeof window.fetch;

    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 500; index += 1) {
      const message = document.createElement(
        'yt-live-chat-text-message-renderer'
      ) as MessageRendererFixture;
      message.id = `native-${index}`;
      message.data = {
        id: `native-${index}`,
        authorName: { simpleText: '@Seed' },
        message: { simpleText: `Seed ${index}` }
      };
      fragment.append(message);
    }
    document.body.append(fragment);

    await import('./message-data-page');
    window.dispatchEvent(new CustomEvent(LITE_CHAT_CONTROL_EVENT, {
      detail: JSON.stringify({ enabled: true, requestInitial: true, version: 1 })
    }));
    await flushAsyncWork();

    expect(batches).toHaveLength(1);
    expect(batches[0].actions).toHaveLength(500);
    expect(batches[0].actions[0]).toEqual({ type: 'reset' });
    expect(batches[0].actions.at(-1)).toMatchObject({
      record: { id: 'native-499' },
      type: 'upsert'
    });
    window.removeEventListener(LITE_CHAT_BATCH_EVENT, listener);
  });

  it('classifies only exact YouTube live, replay, and send endpoint paths', async () => {
    vi.resetModules();
    const batches: LiteChatBatch[] = [];
    const listener = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        batches.push(JSON.parse(event.detail) as LiteChatBatch);
      }
    };
    window.addEventListener(LITE_CHAT_BATCH_EVENT, listener);
    window.fetch = vi.fn(() => Promise.resolve(jsonResponse({ actions: [] }))) as typeof window.fetch;
    await import('./message-data-page');
    window.dispatchEvent(new CustomEvent(LITE_CHAT_CONTROL_EVENT, {
      detail: JSON.stringify({ enabled: true, version: 1 })
    }));

    await Promise.all([
      window.fetch('https://www.youtube.com/youtubei/v1/live_chat/get_live_chat'),
      window.fetch('https://www.youtube.com/youtubei/v1/live_chat/get_live_chat_replay'),
      window.fetch('https://studio.youtube.com/youtubei/v1/live_chat/send_message'),
      window.fetch('https://www.youtube.com/youtubei/v1/live_chat/get_live_chats'),
      window.fetch('https://example.com/youtubei/v1/live_chat/get_live_chat')
    ]);
    await flushAsyncWork();

    expect(batches.map((batch) => batch.source)).toEqual(['live', 'replay', 'send']);
    expect(batches.map((batch) => batch.sequence)).toEqual([1, 2, 3]);
    expect(batches.map((batch) => batch.fatalErrors)).toEqual([
      ['response:unrecognized-chat-payload'],
      ['response:unrecognized-chat-payload'],
      undefined
    ]);
    window.removeEventListener(LITE_CHAT_BATCH_EVENT, listener);
  });

  it('emits unsupported feed rows as non-fatal compatibility metadata', async () => {
    vi.resetModules();
    const batches: LiteChatBatch[] = [];
    const listener = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        batches.push(JSON.parse(event.detail) as LiteChatBatch);
      }
    };
    window.addEventListener(LITE_CHAT_BATCH_EVENT, listener);
    window.fetch = vi.fn(() => Promise.resolve(jsonResponse({
      continuationContents: {
        liveChatContinuation: {
          actions: [{
            addChatItemAction: {
              item: { liveChatFutureRenderer: { id: 'future-row' } }
            }
          }]
        }
      }
    }))) as typeof window.fetch;
    await import('./message-data-page');
    dispatchLiteChatControl(true);

    await window.fetch('https://www.youtube.com/youtubei/v1/live_chat/get_live_chat');
    await flushAsyncWork();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      actions: [],
      compatibilityWarnings: ['feed:liveChatFutureRenderer'],
      source: 'live',
      unreadableFeed: true
    });
    expect(batches[0].fatalErrors).toBeUndefined();
    window.removeEventListener(LITE_CHAT_BATCH_EVENT, listener);
  });

  it('accepts large official feed responses without treating send failures as feed failures', async () => {
    vi.resetModules();
    const batches: LiteChatBatch[] = [];
    const listener = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        batches.push(JSON.parse(event.detail) as LiteChatBatch);
      }
    };
    window.addEventListener(LITE_CHAT_BATCH_EVENT, listener);
    const largeOfficialBody = JSON.stringify({
      continuationContents: {
        liveChatContinuation: {
          actions: [textAction('large-official', 'Large official response')]
        }
      },
      padding: 'x'.repeat(5 * 1024 * 1024 + 1)
    });
    window.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{broken'))
      .mockResolvedValueOnce(new Response(largeOfficialBody))
      .mockResolvedValueOnce(new Response('{broken')) as typeof window.fetch;
    await import('./message-data-page');
    dispatchLiteChatControl(true);

    await window.fetch('https://www.youtube.com/youtubei/v1/live_chat/get_live_chat');
    await window.fetch('https://www.youtube.com/youtubei/v1/live_chat/get_live_chat');
    await window.fetch('https://www.youtube.com/youtubei/v1/live_chat/send_message');
    await flushAsyncWork();

    expect(batches.map((batch) => batch.fatalErrors)).toEqual([
      ['response:invalid-json'],
      undefined,
      undefined
    ]);
    expect(batches[1].actions).toEqual([
      expect.objectContaining({
        record: expect.objectContaining({ id: 'large-official' }),
        type: 'upsert'
      })
    ]);
    window.removeEventListener(LITE_CHAT_BATCH_EVENT, listener);
  });

  it('splits large official action sets across valid isolated-world batches', async () => {
    vi.resetModules();
    const batches: LiteChatBatch[] = [];
    const detailLengths: number[] = [];
    const listener = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== 'string') return;
      detailLengths.push(event.detail.length);
      batches.push(JSON.parse(event.detail) as LiteChatBatch);
    };
    window.addEventListener(LITE_CHAT_BATCH_EVENT, listener);
    const longText = 'x'.repeat(4_000);
    window.fetch = vi.fn(() => Promise.resolve(jsonResponse({
      continuationContents: {
        liveChatContinuation: {
          actions: Array.from({ length: 550 }, (_value, index) => (
            textAction(`large-${index}`, longText)
          ))
        }
      }
    }))) as typeof window.fetch;
    await import('./message-data-page');
    window.dispatchEvent(new CustomEvent(LITE_CHAT_CONTROL_EVENT, {
      detail: JSON.stringify({ enabled: true, requestInitial: true, version: 1 })
    }));
    await flushAsyncWork();
    batches.length = 0;
    detailLengths.length = 0;

    let fetchSettled = false;
    const fetchPromise = window.fetch('https://www.youtube.com/youtubei/v1/live_chat/get_live_chat')
      .then(() => {
        fetchSettled = true;
      });
    await fetchPromise;
    await flushAsyncWork();

    expect(fetchSettled).toBe(true);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flatMap((batch) => batch.actions)).toHaveLength(550);
    expect(batches.map((batch) => batch.sequence)).toEqual(
      batches.map((_batch, index) => index + 2)
    );
    expect(batches.every((batch) => batch.actions.length <= 500)).toBe(true);
    expect(detailLengths.every((length) => length <= 2_000_000)).toBe(true);
    expect(batches.every((batch) => batch.fatalErrors === undefined)).toBe(true);
    window.removeEventListener(LITE_CHAT_BATCH_EVENT, listener);
  });

  it('calls native fetch before inspecting its input and drops parsing from an obsolete enable generation', async () => {
    vi.resetModules();
    const batches: LiteChatBatch[] = [];
    const listener = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        batches.push(JSON.parse(event.detail) as LiteChatBatch);
      }
    };
    window.addEventListener(LITE_CHAT_BATCH_EVENT, listener);

    let resolvePayload: (value: string) => void = () => undefined;
    const payloadPromise = new Promise<string>((resolve) => {
      resolvePayload = resolve;
    });
    const clone = {
      headers: new Headers(),
      ok: true,
      status: 200,
      text: () => payloadPromise,
      url: ''
    } as Response;
    const response = {
      clone: () => clone,
      url: ''
    } as Response;
    const originalPromise = Promise.resolve(response);
    let originalCalled = false;
    const fetchMock = vi.fn(() => {
      originalCalled = true;
      return originalPromise;
    });
    window.fetch = fetchMock as typeof window.fetch;
    await import('./message-data-page');
    window.dispatchEvent(new CustomEvent(LITE_CHAT_CONTROL_EVENT, {
      detail: JSON.stringify({ enabled: true, version: 1 })
    }));

    let getterObservedOriginalCall = false;
    const unusualInput = Object.defineProperty({}, 'url', {
      get() {
        getterObservedOriginalCall = originalCalled;
        throw new Error('URL unavailable');
      }
    }) as unknown as Request;
    await expect(window.fetch(unusualInput)).resolves.toBe(response);
    expect(getterObservedOriginalCall).toBe(true);

    const matchedPromise = window.fetch('https://www.youtube.com/youtubei/v1/live_chat/get_live_chat');
    expect(matchedPromise).not.toBe(originalPromise);
    await Promise.resolve();
    await Promise.resolve();

    window.dispatchEvent(new CustomEvent(LITE_CHAT_CONTROL_EVENT, {
      detail: JSON.stringify({ enabled: false, version: 1 })
    }));
    window.dispatchEvent(new CustomEvent(LITE_CHAT_CONTROL_EVENT, {
      detail: JSON.stringify({ enabled: true, version: 1 })
    }));
    resolvePayload(JSON.stringify({
      actions: [textAction('obsolete-message', 'Must not render')]
    }));
    await matchedPromise;
    await flushAsyncWork();

    expect(batches).toEqual([]);
    window.removeEventListener(LITE_CHAT_BATCH_EVENT, listener);
  });

  it('starts a fresh parse chain after disable and re-enable', async () => {
    vi.resetModules();
    const batches: LiteChatBatch[] = [];
    const listener = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        batches.push(JSON.parse(event.detail) as LiteChatBatch);
      }
    };
    window.addEventListener(LITE_CHAT_BATCH_EVENT, listener);

    let resolveObsoletePayload: (value: string) => void = () => undefined;
    let markObsoleteParseStarted: () => void = () => undefined;
    const obsoletePayload = new Promise<string>((resolve) => {
      resolveObsoletePayload = resolve;
    });
    const obsoleteParseStarted = new Promise<void>((resolve) => {
      markObsoleteParseStarted = resolve;
    });
    const obsoleteClone = {
      headers: new Headers(),
      ok: true,
      status: 200,
      text: () => {
        markObsoleteParseStarted();
        return obsoletePayload;
      },
      url: ''
    } as Response;
    const obsoleteResponse = {
      clone: () => obsoleteClone,
      url: ''
    } as Response;
    const currentResponse = jsonResponse({
      continuationContents: {
        liveChatContinuation: {
          actions: [textAction('current-message', 'Current generation')]
        }
      }
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(obsoleteResponse)
      .mockResolvedValueOnce(currentResponse);
    window.fetch = fetchMock as typeof window.fetch;

    await import('./message-data-page');
    dispatchLiteChatControl(true);

    const obsoleteFetch = window.fetch(
      'https://www.youtube.com/youtubei/v1/live_chat/get_live_chat'
    );
    await obsoleteParseStarted;

    dispatchLiteChatControl(false);
    dispatchLiteChatControl(true);
    await window.fetch('https://www.youtube.com/youtubei/v1/live_chat/get_live_chat');
    await flushAsyncWork();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      actions: [{
        record: { id: 'current-message', plainText: 'Current generation' },
        type: 'upsert'
      }],
      source: 'live'
    });

    resolveObsoletePayload(JSON.stringify({
      continuationContents: {
        liveChatContinuation: {
          actions: [textAction('obsolete-message', 'Obsolete generation')]
        }
      }
    }));
    await obsoleteFetch;
    await flushAsyncWork();

    expect(batches).toHaveLength(1);
    window.removeEventListener(LITE_CHAT_BATCH_EVENT, listener);
  });

  it('serializes concurrent official responses without dropping any clones', async () => {
    vi.resetModules();
    const batches: LiteChatBatch[] = [];
    const listener = collectLiteChatBatches(batches);
    window.addEventListener(LITE_CHAT_BATCH_EVENT, listener);
    const resolvers: Array<(value: string) => void> = [];
    const bodies = Array.from({ length: 2 }, () => new Promise<string>((resolve) => {
      resolvers.push(resolve);
    }));
    const clones = bodies.map((body) => ({
      headers: new Headers(),
      ok: true,
      status: 200,
      text: () => body,
      url: ''
    }) as Response);
    const queuedResponses = ['three', 'four', 'five'].map((id) => jsonResponse({
      continuationContents: {
        liveChatContinuation: { actions: [textAction(id, id)] }
      }
    }));
    const cloneSpies = [
      vi.fn(() => clones[0]),
      vi.fn(() => clones[1]),
      vi.fn(() => queuedResponses[0]),
      vi.fn(() => queuedResponses[1]),
      vi.fn(() => queuedResponses[2])
    ];
    window.fetch = vi.fn()
      .mockResolvedValueOnce({ clone: cloneSpies[0], url: '' } as unknown as Response)
      .mockResolvedValueOnce({ clone: cloneSpies[1], url: '' } as unknown as Response)
      .mockResolvedValueOnce({ clone: cloneSpies[2], url: '' } as unknown as Response)
      .mockResolvedValueOnce({ clone: cloneSpies[3], url: '' } as unknown as Response)
      .mockResolvedValueOnce({ clone: cloneSpies[4], url: '' } as unknown as Response) as typeof window.fetch;
    await import('./message-data-page');
    dispatchLiteChatControl(true);

    const fetches = Array.from({ length: 5 }, () => (
      window.fetch('https://www.youtube.com/youtubei/v1/live_chat/get_live_chat')
    ));
    await Promise.resolve();
    await Promise.resolve();

    cloneSpies.forEach((clone) => expect(clone).toHaveBeenCalledOnce());

    resolvers[0](JSON.stringify({
      continuationContents: {
        liveChatContinuation: { actions: [textAction('one', 'One')] }
      }
    }));
    resolvers[1](JSON.stringify({
      continuationContents: {
        liveChatContinuation: { actions: [textAction('two', 'Two')] }
      }
    }));
    await Promise.all(fetches);
    await flushAsyncWork();

    expect(batches).toHaveLength(5);
    expect(batches.flatMap((batch) => batch.actions).map((action) => (
      action.type === 'upsert' ? action.record.id : action.type
    ))).toEqual(['one', 'two', 'three', 'four', 'five']);
    expect(batches.every((batch) => batch.fatalErrors === undefined)).toBe(true);
    window.removeEventListener(LITE_CHAT_BATCH_EVENT, listener);
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
    status: 200
  });
}

function replayEndpoint(): string {
  return 'https://www.youtube.com/youtubei/v1/live_chat/get_live_chat_replay';
}

function replayRequest(continuation: string, playerOffsetMs: number): RequestInit {
  return {
    body: JSON.stringify({
      continuation,
      currentPlayerState: { playerOffsetMs: String(playerOffsetMs) }
    }),
    method: 'POST'
  };
}

function replayRequestInput(continuation: string, playerOffsetMs: number): Request {
  return new Request(replayEndpoint(), replayRequest(continuation, playerOffsetMs));
}

async function gzipReplayRequestInput(
  continuation: string,
  playerOffsetMs: number
): Promise<Request> {
  const body = replayRequest(continuation, playerOffsetMs).body as string;
  const source = new Response(body).body;
  if (!source) throw new Error('Replay request fixture body is unavailable.');
  const compressed = await new Response(
    source.pipeThrough(new CompressionStream('gzip'))
  ).arrayBuffer();
  return new Request(replayEndpoint(), {
    body: compressed,
    headers: { 'content-encoding': 'gzip' },
    method: 'POST'
  });
}

function replayResponse(
  id: string,
  playerOffsetMs: number,
  replayContinuation: string,
  seekContinuation: string
): Response {
  return jsonResponse(replayPayload(
    id,
    playerOffsetMs,
    replayContinuation,
    seekContinuation
  ));
}

function replayPayload(
  id: string,
  playerOffsetMs: number,
  replayContinuation: string,
  seekContinuation: string
): unknown {
  return {
    continuationContents: {
      liveChatContinuation: {
        actions: [{
          replayChatItemAction: {
            actions: [textAction(id, id)],
            videoOffsetTimeMsec: String(playerOffsetMs)
          }
        }],
        continuations: [
          {
            liveChatReplayContinuationData: {
              continuation: replayContinuation,
              timeUntilLastMessageMsec: 1_000
            }
          },
          {
            playerSeekContinuationData: { continuation: seekContinuation }
          }
        ]
      }
    }
  };
}

function deferredResponse(
  body: Promise<string>,
  onRead: () => void
): Response {
  const clone = {
    headers: new Headers(),
    ok: true,
    status: 200,
    text: () => {
      onRead();
      return body;
    },
    url: ''
  } as Response;
  return {
    clone: () => clone,
    url: ''
  } as Response;
}

function collectLiteChatBatches(batches: LiteChatBatch[]): EventListener {
  return (event) => {
    if (event instanceof CustomEvent && typeof event.detail === 'string') {
      batches.push(JSON.parse(event.detail) as LiteChatBatch);
    }
  };
}

type MessageRendererFixture = HTMLElement & { data?: unknown };

function createNativeMessage(id: string, text: string): MessageRendererFixture {
  const message = document.createElement(
    'yt-live-chat-text-message-renderer'
  ) as MessageRendererFixture;
  message.id = id;
  message.data = {
    id,
    authorName: { simpleText: '@History' },
    message: { simpleText: text }
  };
  return message;
}

function textAction(id: string, text: string) {
  return {
    addChatItemAction: {
      item: {
        liveChatTextMessageRenderer: {
          id,
          authorName: { simpleText: '@Example' },
          message: { simpleText: text }
        }
      }
    }
  };
}

function dispatchLiteChatControl(enabled: boolean): void {
  window.dispatchEvent(new CustomEvent(LITE_CHAT_CONTROL_EVENT, {
    detail: JSON.stringify({ enabled, version: 1 })
  }));
}

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForLiteChatBatchCount(
  batches: readonly LiteChatBatch[],
  count: number
): Promise<void> {
  await vi.waitFor(() => expect(batches).toHaveLength(count));
}

function cleanupLiteChatTransport(): void {
  const registry = window as unknown as Record<PropertyKey, unknown>;
  const state = registry[LITE_CHAT_TRANSPORT_STATE_KEY] as {
    handleControl?: (event: Event) => void;
    wrapper?: typeof window.fetch;
  } | undefined;
  if (state?.handleControl) {
    dispatchLiteChatControl(false);
    window.removeEventListener(LITE_CHAT_CONTROL_EVENT, state.handleControl);
  }
  Reflect.deleteProperty(registry, LITE_CHAT_TRANSPORT_STATE_KEY);
  if (originalWindowFetch) {
    window.fetch = originalWindowFetch;
  } else {
    Reflect.deleteProperty(window, 'fetch');
  }
}
