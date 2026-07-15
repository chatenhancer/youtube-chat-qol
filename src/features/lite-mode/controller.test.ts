import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  YOUTUBE_CHAT_FEED_BATCH_EVENT,
  YOUTUBE_CHAT_FEED_CONTROL_EVENT,
  type YouTubeChatFeedTransportBatch,
  type YouTubeChatMessageRecord
} from '../../youtube/chat-feed/protocol';

const {
  getYouTubeChatFeedRecordStateMock,
  requestNativeChatRestoreMock,
  requestReplayLiteModeReloadMock
} = vi.hoisted(() => ({
  getYouTubeChatFeedRecordStateMock: vi.fn<() => {
    ready: boolean;
    records: YouTubeChatMessageRecord[];
  }>(() => ({ ready: false, records: [] })),
  requestNativeChatRestoreMock: vi.fn(),
  requestReplayLiteModeReloadMock: vi.fn()
}));

vi.mock('./bootstrap', async (importOriginal) => {
  const original = await importOriginal<typeof import('./bootstrap')>();
  return {
    ...original,
    isSupportedLiteModePage: () => true,
    requestNativeChatRestore: requestNativeChatRestoreMock,
    requestReplayLiteModeReload: requestReplayLiteModeReloadMock
  };
});

vi.mock('../../youtube/chat-feed/records', () => ({
  getYouTubeChatFeedRecordState: getYouTubeChatFeedRecordStateMock
}));

import {
  cleanupLiteMode,
  getLiteModeMessageElement,
  handleLiteModeDomMutations,
  hasRetainedLiteModeMessage,
  isLiteModeActive,
  refreshLiteMode,
  revealRetainedLiteModeMessage,
  setLiteModeRowRenderedCallback,
  startLiteMode,
  stopLiteMode
} from './controller';
import { parseYouTubeChatFeedBatchDetail } from '../../youtube/chat-feed/batch';
import {
  clearLiteModeSessionCooldown,
  hasLiteModeSessionCooldown
} from './bootstrap';

describe('Lite mode controller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    });
    document.documentElement.removeAttribute('data-ytcq-lite-mode-intent');
    document.body.replaceChildren(createChatPage());
    requestNativeChatRestoreMock.mockReset();
    requestReplayLiteModeReloadMock.mockReset();
    getYouTubeChatFeedRecordStateMock.mockReset();
    getYouTubeChatFeedRecordStateMock.mockReturnValue({ ready: false, records: [] });
    clearLiteModeSessionCooldown();
    cleanupLiteMode({ preserveBootstrapIntent: false });
  });

  afterEach(() => {
    setLiteModeRowRenderedCallback(null);
    cleanupLiteMode({ preserveBootstrapIntent: false });
    clearLiteModeSessionCooldown();
    vi.useRealTimers();
  });

  it('discards the native renderer immediately and renders the first healthy batch', () => {
    const nativeList = document.querySelector<HTMLElement>('yt-live-chat-item-list-renderer')!;
    appendNativeMessage(nativeList, 'native-before-lite');
    const initialRecord = createRecord('native-before-lite', 'Native history');
    getYouTubeChatFeedRecordStateMock.mockReturnValue({
      ready: true,
      records: [initialRecord]
    });
    const onRow = vi.fn();
    setLiteModeRowRenderedCallback(onRow);
    const controlDetails: string[] = [];
    const onControl = ((event: CustomEvent<string>) => {
      controlDetails.push(event.detail);
    }) as EventListener;
    window.addEventListener(YOUTUBE_CHAT_FEED_CONTROL_EVENT, onControl, { once: true });

    startLiteMode({ clearCooldown: true });
    expect(isLiteModeActive()).toBe(true);
    expect(document.querySelector('.ytcq-lite-root')).not.toBeNull();
    expect(nativeList.classList.contains('ytcq-lite-native-hidden')).toBe(true);
    expect(nativeList.isConnected).toBe(false);
    expect(nativeList.childElementCount).toBe(0);
    expect(document.querySelector('yt-live-chat-item-list-renderer')).toBeNull();
    expect(document.querySelector('template[data-ytcq-lite-native-retainer]')).toBeNull();
    expect(document.documentElement.getAttribute('data-ytcq-lite-native-discarded')).toBe('true');
    expect(document.querySelector('[data-message-id="native-before-lite"]')).not.toBeNull();
    expect(onRow).toHaveBeenCalledWith(
      expect.objectContaining({ isConnected: true }),
      initialRecord,
      'existing'
    );

    dispatchBatch(createBatch(1, [{
      type: 'upsert',
      record: createRecord('first', 'First message')
    }]));

    expect(nativeList.isConnected).toBe(false);
    expect(document.querySelector('[data-message-id="first"]')).not.toBeNull();
    expect(controlDetails.map((detail) => JSON.parse(detail))).toContainEqual({
      consumer: 'lite',
      enabled: true,
      version: 1
    });
    expect(controlDetails.map((detail) => JSON.parse(detail))).not.toContainEqual(
      expect.objectContaining({ requestInitial: true })
    );
    stopLiteMode();
    expect(isLiteModeActive()).toBe(false);
    expect(nativeList.isConnected).toBe(false);
    expect(document.querySelector('.ytcq-lite-root')).not.toBeNull();
    expect(document.querySelector('.ytcq-lite-handoff-overlay')).toBeNull();
    expect(requestNativeChatRestoreMock).toHaveBeenCalledWith({
      automaticFailure: false,
      message: 'Loading chat'
    });
  });

  it('reveals retained messages that are outside the mounted Lite window', () => {
    getYouTubeChatFeedRecordStateMock.mockReturnValue({
      ready: true,
      records: Array.from({ length: 180 }, (_value, index) =>
        createRecord(`message-${index}`, `Message ${index}`)
      )
    });

    startLiteMode({ clearCooldown: true });

    expect(getLiteModeMessageElement('message-0')).toBeNull();
    expect(hasRetainedLiteModeMessage('message-0')).toBe(true);
    const target = revealRetainedLiteModeMessage('message-0');
    expect(target?.isConnected).toBe(true);
    expect(target?.dataset.messageId).toBe('message-0');
    expect(getLiteModeMessageElement('message-0')).toBe(target);
    expect(document.querySelector('.ytcq-lite-root')?.getAttribute(
      'data-ytcq-following-live-edge'
    )).toBe('false');
    expect(hasRetainedLiteModeMessage('missing')).toBe(false);
    expect(revealRetainedLiteModeMessage('missing')).toBeNull();
  });

  it('requests a final initial snapshot before discarding an uncached native history', () => {
    const nativeList = document.querySelector<HTMLElement>('yt-live-chat-item-list-renderer')!;
    appendNativeMessage(nativeList, 'native-uncached');
    const controlDetails: string[] = [];
    let nativeHistoryConnectedOnRequest = false;
    const onControl = ((event: CustomEvent<string>) => {
      controlDetails.push(event.detail);
      const control = JSON.parse(event.detail) as { requestInitial?: boolean };
      if (control.requestInitial === true) {
        nativeHistoryConnectedOnRequest =
          nativeList.isConnected && nativeList.childElementCount > 0;
      }
    }) as EventListener;
    window.addEventListener(YOUTUBE_CHAT_FEED_CONTROL_EVENT, onControl, { once: true });

    startLiteMode({ clearCooldown: true });

    expect(controlDetails.map((detail) => JSON.parse(detail))).toContainEqual({
      consumer: 'lite',
      enabled: true,
      requestInitial: true,
      version: 1
    });
    expect(nativeHistoryConnectedOnRequest).toBe(true);
    expect(nativeList.isConnected).toBe(false);
  });

  it('treats an initialized empty shared feed as completed replay startup', async () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    getYouTubeChatFeedRecordStateMock.mockReturnValue({ ready: true, records: [] });

    startLiteMode({ clearCooldown: true });
    const root = document.querySelector<HTMLElement>('.ytcq-lite-root')!;

    expect(root.dataset.ytcqConnectionState).toBe('connected');
    expect(root.getAttribute('aria-busy')).toBe('false');
    expect(document.querySelector('.ytcq-lite-empty-state')).not.toBeNull();

    await vi.advanceTimersByTimeAsync(45_000);

    expect(isLiteModeActive()).toBe(true);
    expect(requestNativeChatRestoreMock).not.toHaveBeenCalled();
  });

  it('uses the reload handoff when disabled while Lite is still connecting', () => {
    const nativeList = document.querySelector<HTMLElement>('yt-live-chat-item-list-renderer')!;
    startLiteMode({ clearCooldown: true });

    stopLiteMode();
    expect(isLiteModeActive()).toBe(false);
    expect(nativeList.isConnected).toBe(false);
    expect(document.querySelector('.ytcq-lite-root')).not.toBeNull();
    expect(requestNativeChatRestoreMock).toHaveBeenCalledWith({
      automaticFailure: false,
      message: 'Loading chat'
    });
  });

  it('reloads a native replay before an explicit off-to-on Lite handoff', () => {
    window.history.replaceState({}, '', '/live_chat_replay');

    refreshLiteMode(true, { userInitiatedRetry: true });

    expect(requestReplayLiteModeReloadMock).toHaveBeenCalledOnce();
    expect(requestNativeChatRestoreMock).not.toHaveBeenCalled();
    expect(isLiteModeActive()).toBe(false);
    expect(document.querySelector('yt-live-chat-item-list-renderer')).not.toBeNull();
    refreshLiteMode(false);
  });

  it('does not retain native chat while waiting for an initial seed or heartbeat', () => {
    const nativeList = document.querySelector<HTMLElement>('yt-live-chat-item-list-renderer')!;
    startLiteMode({ clearCooldown: true });
    expect(nativeList.isConnected).toBe(false);

    dispatchBatch({
      ...createBatch(1, [{ type: 'upsert', record: createRecord('seed', 'Seed') }]),
      source: 'initial'
    });

    expect(document.querySelector('[data-message-id="seed"]')).not.toBeNull();

    dispatchBatch(createBatch(2, []));

    expect(nativeList.isConnected).toBe(false);
    expect(document.querySelector('template[data-ytcq-lite-native-retainer]')).toBeNull();
    expect(document.documentElement.getAttribute('data-ytcq-lite-native-discarded')).toBe('true');
  });

  it('accepts a healthy empty source batch without timing out', async () => {
    const nativeList = document.querySelector<HTMLElement>('yt-live-chat-item-list-renderer')!;
    startLiteMode({ clearCooldown: true });
    const root = document.querySelector<HTMLElement>('.ytcq-lite-root')!;
    expect(root.dataset.ytcqConnectionState).toBe('connecting');
    expect(root.getAttribute('aria-busy')).toBe('true');
    dispatchBatch(createBatch(1, []));

    expect(nativeList.isConnected).toBe(false);
    expect(document.querySelectorAll('.ytcq-lite-message')).toHaveLength(0);
    expect(root.dataset.ytcqConnectionState).toBe('connected');
    expect(root.getAttribute('aria-busy')).toBe('false');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(isLiteModeActive()).toBe(true);
  });

  it('does not start the live-source watchdog from an initial history snapshot', async () => {
    startLiteMode({ clearCooldown: true });
    dispatchBatch({
      ...createBatch(1, [{ type: 'upsert', record: createRecord('seed', 'Seed') }]),
      continuationTimeoutMs: 1_000,
      source: 'initial'
    });

    await vi.advanceTimersByTimeAsync(12_000);
    expect(isLiteModeActive()).toBe(true);
    expect(requestNativeChatRestoreMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(8_000);
    expect(isLiteModeActive()).toBe(false);
    expect(requestNativeChatRestoreMock).toHaveBeenCalledOnce();
  });

  it('applies busy live upserts immediately', () => {
    startLiteMode({ clearCooldown: true });
    dispatchBatch({
      ...createBatch(1, [
        { type: 'upsert', record: createRecord('one', 'One') },
        { type: 'upsert', record: createRecord('two', 'Two') },
        { type: 'upsert', record: createRecord('three', 'Three') },
        { type: 'upsert', record: createRecord('four', 'Four') }
      ]),
      continuationTimeoutMs: 1_000
    });

    expect(document.querySelectorAll('.ytcq-lite-message')).toHaveLength(4);
  });

  it('does not delay a paid message through the continuation window', () => {
    startLiteMode({ clearCooldown: true });
    const paidRecord = {
      ...createRecord('paid', 'Thank you'),
      kind: 'paid' as const,
      paid: { amountText: '$10.00' }
    };
    dispatchBatch({
      ...createBatch(1, [
        { type: 'upsert', record: createRecord('one', 'One') },
        { type: 'upsert', record: createRecord('two', 'Two') },
        { type: 'upsert', record: paidRecord }
      ]),
      continuationTimeoutMs: 5_000
    });

    expect(document.querySelectorAll('.ytcq-lite-message')).toHaveLength(3);
    expect(document.querySelector('[data-message-id="paid"]')).not.toBeNull();
  });

  it('applies later single-message and moderation actions in transport order', () => {
    startLiteMode({ clearCooldown: true });
    dispatchBatch({
      ...createBatch(1, [
        { type: 'upsert', record: createRecord('one', 'One') },
        { type: 'upsert', record: createRecord('two', 'Two') }
      ]),
      continuationTimeoutMs: 500
    });
    dispatchBatch(createBatch(2, [{ type: 'remove', id: 'one' }]));

    expect(document.querySelector('[data-message-id="one"]')).toBeNull();
    expect(document.querySelector('[data-message-id="two"]')).not.toBeNull();
  });

  it('applies rich live batches without building a pending display backlog', () => {
    startLiteMode({ clearCooldown: true });
    const richText = 'x'.repeat(9_000);
    for (let sequence = 1; sequence <= 5; sequence += 1) {
      dispatchBatch({
        ...createBatch(sequence, Array.from({ length: 100 }, (_value, index) => ({
          type: 'upsert' as const,
          record: createRecord(`rich-${sequence}-${index}`, richText)
        }))),
        continuationTimeoutMs: 5_000
      });
    }

    const root = document.querySelector<HTMLElement>('.ytcq-lite-root')!;
    expect(isLiteModeActive()).toBe(true);
    expect(root.dataset.ytcqLitePendingLiveActions).toBe('0');
    expect(root.dataset.ytcqLitePendingLiveActionBytes).toBe('0');
    expect(document.querySelectorAll('.ytcq-lite-message')).toHaveLength(150);
    expect(requestNativeChatRestoreMock).not.toHaveBeenCalled();
  });

  it('releases replay rows at their YouTube player offsets instead of by response batch', () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    startLiteMode({ clearCooldown: true });
    const playerFrame = document.createElement('iframe');
    document.body.append(playerFrame);
    dispatchPlayerProgress(5, playerFrame.contentWindow);
    dispatchBatch({
      ...createBatch(1, [
        { replayOffsetMs: 5_000, type: 'upsert', record: createRecord('one', 'One') },
        { replayOffsetMs: 5_500, type: 'upsert', record: createRecord('two', 'Two') },
        { replayOffsetMs: 6_000, type: 'upsert', record: createRecord('three', 'Three') }
      ]),
      source: 'replay'
    });

    expect(document.querySelectorAll('.ytcq-lite-message')).toHaveLength(1);
    dispatchPlayerProgress(5.49);
    expect(document.querySelectorAll('.ytcq-lite-message')).toHaveLength(1);
    dispatchPlayerProgress(5.5);
    expect(document.querySelectorAll('.ytcq-lite-message')).toHaveLength(2);
    dispatchPlayerProgress(6);
    expect(document.querySelectorAll('.ytcq-lite-message')).toHaveLength(3);
  });

  it('keeps startup history visible while timing buffered replay rows and clears on rewind', () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    startLiteMode({ clearCooldown: true });
    dispatchPlayerProgress(10);
    dispatchBatch({
      ...createBatch(1, [
        { type: 'reset' },
        { type: 'upsert', record: createRecord('history', 'History') },
        { replayOffsetMs: 10_000, type: 'upsert', record: createRecord('due', 'Due') },
        { replayOffsetMs: 11_000, type: 'upsert', record: createRecord('future', 'Future') }
      ]),
      source: 'initial'
    });

    expect(document.querySelector('[data-message-id="history"]')).not.toBeNull();
    expect(document.querySelector('[data-message-id="due"]')).not.toBeNull();
    expect(document.querySelector('[data-message-id="future"]')).toBeNull();

    dispatchPlayerProgress(8);
    expect(document.querySelectorAll('.ytcq-lite-message')).toHaveLength(0);
    dispatchPlayerProgress(11);
    expect(document.querySelector('[data-message-id="future"]')).toBeNull();
  });

  it('keeps the newest seek response when YouTube progress arrives after that response', () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    startLiteMode({ clearCooldown: true });
    dispatchPlayerProgress(100);
    dispatchBatch({
      ...createBatch(1, [
        { type: 'reset' },
        {
          replayOffsetMs: 50_000,
          type: 'upsert',
          record: createRecord('seek-result', 'Seek result')
        }
      ]),
      replayPlayerOffsetMs: 50_000,
      source: 'replay'
    });

    expect(document.querySelector('[data-message-id="seek-result"]')).not.toBeNull();
    dispatchPlayerProgress(50);
    expect(document.querySelector('[data-message-id="seek-result"]')).not.toBeNull();
  });

  it('reloads native chat and sets a session cooldown for malformed batches', () => {
    const nativeList = document.querySelector<HTMLElement>('yt-live-chat-item-list-renderer')!;
    startLiteMode({ clearCooldown: true });
    window.dispatchEvent(new CustomEvent(YOUTUBE_CHAT_FEED_BATCH_EVENT, { detail: '{broken' }));

    expect(isLiteModeActive()).toBe(false);
    expect(nativeList.isConnected).toBe(false);
    expect(hasLiteModeSessionCooldown()).toBe(true);
    expect(requestNativeChatRestoreMock).toHaveBeenCalledWith({
      automaticFailure: true,
      fallbackCode: 'LM03',
      message: 'Loading chat'
    });
  });

  it('requests a native reload when Lite startup stalls', async () => {
    const nativeList = document.querySelector<HTMLElement>('yt-live-chat-item-list-renderer')!;
    startLiteMode({ clearCooldown: true });

    await vi.advanceTimersByTimeAsync(20_000);
    expect(isLiteModeActive()).toBe(false);
    expect(nativeList.isConnected).toBe(false);
    expect(hasLiteModeSessionCooldown()).toBe(true);
    expect(requestNativeChatRestoreMock).toHaveBeenCalledWith({
      automaticFailure: true,
      fallbackCode: 'LM01',
      message: 'Loading chat'
    });
  });

  it('allows replay chat to remain idle through a pre-roll before timing out', async () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    startLiteMode({ clearCooldown: true });

    await vi.advanceTimersByTimeAsync(20_000);
    expect(isLiteModeActive()).toBe(true);
    expect(requestNativeChatRestoreMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(25_000);
    expect(isLiteModeActive()).toBe(false);
    expect(requestNativeChatRestoreMock).toHaveBeenCalledWith({
      automaticFailure: true,
      fallbackCode: 'LM01',
      message: 'Loading chat'
    });
  });

  it('requests a native reload when YouTube replaces the Lite root', async () => {
    const nativeList = document.querySelector<HTMLElement>('yt-live-chat-item-list-renderer')!;
    startLiteMode({ clearCooldown: true });
    dispatchBatch(createBatch(1, [{ type: 'upsert', record: createRecord('one', 'One') }]));
    expect(nativeList.isConnected).toBe(false);

    const root = document.querySelector('.ytcq-lite-root')!;
    const rootParent = root.parentNode!;
    root.remove();
    handleLiteModeDomMutations([mutation({
      removedNodes: [root],
      target: rootParent,
      type: 'childList'
    })]);

    expect(isLiteModeActive()).toBe(false);
    expect(nativeList.isConnected).toBe(false);
    expect(document.querySelector('yt-live-chat-item-list-renderer')).toBeNull();
    expect(hasLiteModeSessionCooldown()).toBe(true);
    expect(requestNativeChatRestoreMock).toHaveBeenCalledWith({
      automaticFailure: true,
      fallbackCode: 'LM09',
      message: 'Loading chat'
    });
  });

  it('immediately discards a native list that YouTube recreates during Lite mode', async () => {
    const original = document.querySelector<HTMLElement>('yt-live-chat-item-list-renderer')!;
    startLiteMode({ clearCooldown: true });
    dispatchBatch(createBatch(1, [{ type: 'upsert', record: createRecord('one', 'One') }]));
    expect(original.isConnected).toBe(false);

    const replacement = document.createElement('yt-live-chat-item-list-renderer');
    replacement.classList.add('ytcq-lite-native-hidden');
    replacement.setAttribute('aria-hidden', 'true');
    appendNativeMessage(replacement, 'one');
    const chatRenderer = document.querySelector('yt-live-chat-renderer')!;
    chatRenderer.append(replacement);
    handleLiteModeDomMutations([mutation({
      addedNodes: [replacement],
      target: chatRenderer,
      type: 'childList'
    })]);

    expect(isLiteModeActive()).toBe(true);
    expect(document.querySelectorAll('yt-live-chat-item-list-renderer')).toHaveLength(0);
    expect(original.isConnected).toBe(false);
    expect(replacement.isConnected).toBe(false);
    expect(document.querySelector('template[data-ytcq-lite-native-retainer]')).toBeNull();
    expect(requestNativeChatRestoreMock).not.toHaveBeenCalled();
  });

  it('reclaims a detached native list only when YouTube repopulates it', () => {
    const nativeList = document.querySelector<HTMLElement>('yt-live-chat-item-list-renderer')!;
    const ticker = document.createElement('yt-live-chat-ticker-renderer');
    ticker.append(document.createElement('span'));
    document.querySelector('yt-live-chat-renderer')!.append(ticker);
    startLiteMode({ clearCooldown: true });
    const root = document.querySelector<HTMLElement>('.ytcq-lite-root')!;

    const repopulated = document.createElement('div');
    repopulated.append(document.createElement('span'));
    nativeList.append(repopulated);
    expect(nativeList.querySelectorAll('*')).toHaveLength(2);

    dispatchBatch(createBatch(1, [{
      type: 'upsert',
      record: createRecord('one', 'One')
    }]));

    expect(nativeList.querySelectorAll('*')).toHaveLength(0);
    expect(root.dataset.ytcqLiteDetachedNativeRepopulations).toBe('1');
    expect(root.dataset.ytcqLiteDetachedNativeReclaimedDescendants).toBe('2');
    expect(root.dataset.ytcqLiteNativeTickerElements).toBe('2');
    expect(Number(root.dataset.ytcqLiteStoreSize)).toBe(1);
    expect(Number(root.dataset.ytcqLiteStoreBytes)).toBeGreaterThan(0);
  });

  it('does not classify document teardown during a tab reload as a Lite failure', async () => {
    startLiteMode({ clearCooldown: true });
    dispatchBatch(createBatch(1, [{ type: 'upsert', record: createRecord('one', 'One') }]));
    const root = document.querySelector<HTMLElement>('.ytcq-lite-root')!;
    const rootParent = root.parentNode!;

    window.dispatchEvent(new Event('beforeunload'));
    root.remove();
    handleLiteModeDomMutations([mutation({
      removedNodes: [root],
      target: rootParent,
      type: 'childList'
    })]);

    expect(requestNativeChatRestoreMock).not.toHaveBeenCalled();
    expect(hasLiteModeSessionCooldown()).toBe(false);
  });

  it('keeps a connected YouTube list when cleaning a stale retained list', () => {
    const connected = document.querySelector<HTMLElement>('yt-live-chat-item-list-renderer')!;
    connected.classList.add('ytcq-lite-native-hidden');
    connected.setAttribute('aria-hidden', 'true');
    const stale = document.createElement('yt-live-chat-item-list-renderer');
    stale.classList.add('ytcq-lite-native-hidden');
    stale.setAttribute('aria-hidden', 'true');
    const retainer = document.createElement('template');
    retainer.setAttribute('data-ytcq-lite-native-retainer', 'true');
    retainer.content.append(stale);
    connected.after(retainer);

    cleanupLiteMode({ preserveBootstrapIntent: false });

    expect(document.querySelector('yt-live-chat-item-list-renderer')).toBe(connected);
    expect(document.querySelectorAll('yt-live-chat-item-list-renderer')).toHaveLength(1);
    expect(document.querySelector('template[data-ytcq-lite-native-retainer]')).toBeNull();
    expect(connected.classList.contains('ytcq-lite-native-hidden')).toBe(false);
    expect(connected.hasAttribute('aria-hidden')).toBe(false);
    expect(stale.isConnected).toBe(false);
  });

  it('preserves discard intent across stale cleanup without retaining the native node', () => {
    const nativeList = document.querySelector<HTMLElement>('yt-live-chat-item-list-renderer')!;
    startLiteMode({ clearCooldown: true });
    dispatchBatch(createBatch(1, [{ type: 'upsert', record: createRecord('one', 'One') }]));
    expect(nativeList.isConnected).toBe(false);
    document.documentElement.setAttribute('data-ytcq-lite-mode-intent', 'true');

    cleanupLiteMode();
    expect(nativeList.isConnected).toBe(false);
    expect(document.documentElement.getAttribute('data-ytcq-lite-mode-intent')).toBe('true');
    expect(document.documentElement.getAttribute('data-ytcq-lite-native-discarded')).toBe('true');
    expect(document.querySelector('.ytcq-lite-root')).toBeNull();
  });

  it('requests a native reload for invalid sequencing after discard', () => {
    startLiteMode({ clearCooldown: true });
    dispatchBatch(createBatch(2, [{ type: 'upsert', record: createRecord('one', 'One') }]));
    dispatchBatch(createBatch(2, [{ type: 'upsert', record: createRecord('two', 'Two') }]));
    expect(isLiteModeActive()).toBe(false);
    expect(requestNativeChatRestoreMock).toHaveBeenCalledWith({
      automaticFailure: true,
      fallbackCode: 'LM04',
      message: 'Loading chat'
    });
  });

  it('requests a native reload for fatal response errors before the first batch', () => {
    const nativeList = document.querySelector<HTMLElement>('yt-live-chat-item-list-renderer')!;
    startLiteMode({ clearCooldown: true });
    dispatchBatch({ ...createBatch(3, []), fatalErrors: ['response:invalid-json'] });
    expect(isLiteModeActive()).toBe(false);
    expect(nativeList.isConnected).toBe(false);
    expect(requestNativeChatRestoreMock).toHaveBeenCalledWith({
      automaticFailure: true,
      fallbackCode: 'LM06',
      message: 'Loading chat'
    });
  });

  it('waits for YouTube to recover from a transient replay response', async () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    getYouTubeChatFeedRecordStateMock.mockReturnValue({ ready: true, records: [] });
    startLiteMode({ clearCooldown: true });
    const root = document.querySelector<HTMLElement>('.ytcq-lite-root')!;

    dispatchBatch({
      ...createBatch(1, []),
      fatalErrors: ['response:http-503'],
      source: 'replay'
    });

    expect(isLiteModeActive()).toBe(true);
    expect(root.dataset.ytcqConnectionState).toBe('connecting');
    expect(requestNativeChatRestoreMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(44_999);
    dispatchBatch({
      ...createBatch(2, [{ type: 'upsert', record: createRecord('recovered', 'Recovered') }]),
      source: 'replay'
    });
    await vi.advanceTimersByTimeAsync(1);

    expect(isLiteModeActive()).toBe(true);
    expect(root.dataset.ytcqConnectionState).toBe('connected');
    expect(document.querySelector('[data-message-id="recovered"]')).not.toBeNull();
    expect(requestNativeChatRestoreMock).not.toHaveBeenCalled();
  });

  it('does not extend Lite recovery forever across repeated transient failures', async () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    getYouTubeChatFeedRecordStateMock.mockReturnValue({ ready: true, records: [] });
    startLiteMode({ clearCooldown: true });

    dispatchBatch({
      ...createBatch(1, []),
      fatalErrors: ['response:http-503'],
      source: 'replay'
    });
    await vi.advanceTimersByTimeAsync(30_000);
    dispatchBatch({
      ...createBatch(2, []),
      fatalErrors: ['response:http-429'],
      source: 'replay'
    });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(isLiteModeActive()).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(isLiteModeActive()).toBe(false);
    expect(requestNativeChatRestoreMock).toHaveBeenCalledWith({
      automaticFailure: true,
      fallbackCode: 'LM01',
      message: 'Loading chat'
    });
  });

  it('keeps Lite active for isolated unreadable rows and resets health after a valid message', () => {
    startLiteMode({ clearCooldown: true });
    dispatchBatch({
      ...createBatch(1, []),
      compatibilityWarnings: ['feed:liveChatFutureRenderer'],
      unreadableFeed: true
    });
    dispatchBatch({
      ...createBatch(2, []),
      compatibilityWarnings: ['feed:liveChatFutureRenderer'],
      unreadableFeed: true
    });

    expect(isLiteModeActive()).toBe(true);
    expect(requestNativeChatRestoreMock).not.toHaveBeenCalled();

    dispatchBatch({
      ...createBatch(3, [{ type: 'upsert', record: createRecord('healthy', 'Healthy') }]),
      compatibilityWarnings: ['feed:liveChatFutureRenderer'],
      unreadableFeed: true
    });
    dispatchBatch({
      ...createBatch(4, []),
      compatibilityWarnings: ['feed:liveChatFutureRenderer'],
      unreadableFeed: true
    });
    dispatchBatch({
      ...createBatch(5, []),
      compatibilityWarnings: ['feed:liveChatFutureRenderer'],
      unreadableFeed: true
    });

    expect(isLiteModeActive()).toBe(true);
    expect(document.querySelector('[data-message-id="healthy"]')).not.toBeNull();
    expect(requestNativeChatRestoreMock).not.toHaveBeenCalled();
  });

  it('never treats skipped deletion metadata as an unreadable message stream', () => {
    startLiteMode({ clearCooldown: true });
    for (let sequence = 1; sequence <= 4; sequence += 1) {
      dispatchBatch({
        ...createBatch(sequence, []),
        compatibilityWarnings: ['removeChatItemAction:missing-target']
      });
    }

    expect(isLiteModeActive()).toBe(true);
    expect(requestNativeChatRestoreMock).not.toHaveBeenCalled();
  });

  it('restores native chat after three unreadable feed batches without a valid message', () => {
    startLiteMode({ clearCooldown: true });
    for (let sequence = 1; sequence <= 3; sequence += 1) {
      dispatchBatch({
        ...createBatch(sequence, []),
        compatibilityWarnings: ['feed:liveChatFutureRenderer'],
        unreadableFeed: true
      });
    }

    expect(isLiteModeActive()).toBe(false);
    expect(requestNativeChatRestoreMock).toHaveBeenCalledWith({
      automaticFailure: true,
      fallbackCode: 'LM07',
      message: 'Loading chat'
    });
  });

  it('does not watchdog a paused replay', async () => {
    window.history.replaceState({}, '', '/live_chat_replay');
    startLiteMode({ clearCooldown: true });
    dispatchBatch(createBatch(1, [{ type: 'upsert', record: createRecord('replay', 'Replay') }]));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(isLiteModeActive()).toBe(true);
  });

  it('defers a live source timeout while backgrounded', async () => {
    window.history.replaceState({}, '', '/live_chat');
    startLiteMode({ clearCooldown: true });
    dispatchBatch({
      ...createBatch(1, [{ type: 'upsert', record: createRecord('live', 'Live') }]),
      continuationTimeoutMs: 1_000
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    });
    await vi.advanceTimersByTimeAsync(12_000);
    expect(isLiteModeActive()).toBe(true);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    });
    await vi.advanceTimersByTimeAsync(12_000);
    expect(isLiteModeActive()).toBe(false);
    expect(requestNativeChatRestoreMock).toHaveBeenCalledWith({
      automaticFailure: true,
      fallbackCode: 'LM02',
      message: 'Loading chat'
    });
  });

  it('defers the startup timeout while backgrounded', async () => {
    startLiteMode({ clearCooldown: true });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    });

    await vi.advanceTimersByTimeAsync(40_000);
    expect(isLiteModeActive()).toBe(true);
    expect(requestNativeChatRestoreMock).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(isLiteModeActive()).toBe(false);
    expect(requestNativeChatRestoreMock).toHaveBeenCalledOnce();
  });

  it('dispatches row callbacks through the existing feature pipeline', () => {
    const onRow = vi.fn();
    setLiteModeRowRenderedCallback(onRow);
    startLiteMode({ clearCooldown: true });
    const record = createRecord('row', 'Row');
    dispatchBatch(createBatch(1, [{ type: 'upsert', record }]));

    expect(onRow).toHaveBeenCalledWith(
      expect.objectContaining({ dataset: expect.objectContaining({ messageId: 'row' }) }),
      record,
      'added'
    );
    expect(isLiteModeActive()).toBe(true);
  });

  it('preserves initial and live row origins through immediate store updates', () => {
    const onRow = vi.fn();
    setLiteModeRowRenderedCallback(onRow);
    startLiteMode({ clearCooldown: true });

    dispatchBatch({
      ...createBatch(1, [{ type: 'upsert', record: createRecord('initial', 'Initial') }]),
      source: 'initial'
    });
    dispatchBatch({
      ...createBatch(2, [{ type: 'upsert', record: createRecord('replay', 'Replay') }]),
      source: 'replay'
    });
    dispatchBatch({
      ...createBatch(3, [{ type: 'upsert', record: createRecord('send', 'Send') }]),
      source: 'send'
    });
    dispatchBatch({
      ...createBatch(4, [
        { type: 'upsert', record: createRecord('live-one', 'Live one') },
        { type: 'upsert', record: createRecord('live-two', 'Live two') }
      ]),
      continuationTimeoutMs: 1_000
    });
    expect(onRow.mock.calls.map(([, record, source]) => [record.id, source])).toEqual([
      ['initial', 'existing'],
      ['replay', 'added'],
      ['send', 'added'],
      ['live-one', 'added'],
      ['live-two', 'added']
    ]);
  });

  it('applies live reset snapshots atomically without relabeling known rows as added', () => {
    const onRow = vi.fn();
    setLiteModeRowRenderedCallback(onRow);
    startLiteMode({ clearCooldown: true });
    const initialRecords = Array.from({ length: 20 }, (_value, index) =>
      createRecord(`known-${index}`, `Known ${index}`)
    );
    dispatchBatch({
      ...createBatch(1, [
        { type: 'reset' },
        ...initialRecords.map((record) => ({ type: 'upsert' as const, record }))
      ]),
      source: 'initial'
    });
    onRow.mockClear();

    const refreshedRecords = [
      ...initialRecords.map((record) => ({ ...record, plainText: `${record.plainText} refreshed` })),
      createRecord('new-after-reset', 'New after reset')
    ];
    dispatchBatch({
      ...createBatch(2, [
        { type: 'reset' },
        ...refreshedRecords.map((record) => ({ type: 'upsert' as const, record }))
      ]),
      continuationTimeoutMs: 1_000
    });

    expect(document.querySelectorAll('.ytcq-lite-message')).toHaveLength(21);
    expect(onRow.mock.calls.filter(([, , source]) => source === 'changed')).toHaveLength(20);
    expect(onRow).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ id: 'new-after-reset' }),
      'added'
    );
  });

  it('samples native timestamp visibility and mirrors the open YouTube toggle', async () => {
    document.querySelector('yt-live-chat-renderer')?.removeAttribute('hide-timestamps');
    const nativeList = document.querySelector<HTMLElement>('yt-live-chat-item-list-renderer')!;
    const nativeMessage = document.createElement('yt-live-chat-text-message-renderer');
    const nativeTimestamp = document.createElement('span');
    nativeTimestamp.id = 'timestamp';
    nativeTimestamp.textContent = '10:30 PM';
    nativeTimestamp.style.display = 'inline';
    nativeMessage.append(nativeTimestamp);
    nativeList.append(nativeMessage);
    const nativeGetComputedStyle = window.getComputedStyle.bind(window);
    const getComputedStyle = vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      expect(nativeList.classList.contains('ytcq-lite-native-hidden')).toBe(false);
      return nativeGetComputedStyle(element);
    });

    startLiteMode({ clearCooldown: true });

    expect(getComputedStyle).toHaveBeenCalledWith(nativeTimestamp);
    getComputedStyle.mockRestore();
    expect(nativeList.classList.contains('ytcq-lite-native-hidden')).toBe(true);
    const root = document.querySelector<HTMLElement>('.ytcq-lite-root')!;
    expect(root.dataset.ytcqShowTimestamps).toBe('true');

    const toggleRenderer = document.createElement('yt-live-chat-toggle-renderer');
    const toggle = document.createElement('tp-yt-paper-toggle-button');
    toggle.setAttribute('aria-pressed', 'false');
    toggleRenderer.append(toggle);
    document.body.append(toggleRenderer);
    notifyLiteElementAdded(toggleRenderer, document.body);
    document.querySelector('yt-live-chat-renderer')?.setAttribute('hide-timestamps', '');
    await flushMutations();
    expect(root.dataset.ytcqShowTimestamps).toBe('false');

    toggle.setAttribute('checked', '');
    toggle.setAttribute('active', '');
    toggle.setAttribute('aria-pressed', 'true');
    document.querySelector('yt-live-chat-renderer')?.removeAttribute('hide-timestamps');
    await flushMutations();
    expect(root.dataset.ytcqShowTimestamps).toBe('true');

    toggle.removeAttribute('checked');
    toggle.removeAttribute('active');
    toggle.setAttribute('aria-pressed', 'false');
    document.querySelector('yt-live-chat-renderer')?.setAttribute('hide-timestamps', '');
    await flushMutations();
    expect(root.dataset.ytcqShowTimestamps).toBe('false');
  });

  it('keeps a timestamp click when YouTube removes the menu before observers run', async () => {
    startLiteMode({ clearCooldown: true });
    const root = document.querySelector<HTMLElement>('.ytcq-lite-root')!;
    const toggleRenderer = document.createElement('yt-live-chat-toggle-renderer');
    const toggle = document.createElement('tp-yt-paper-toggle-button');
    toggle.setAttribute('checked', '');
    toggle.setAttribute('active', '');
    toggle.setAttribute('aria-pressed', 'true');
    document.querySelector('yt-live-chat-renderer')?.removeAttribute('hide-timestamps');
    toggleRenderer.append(toggle);
    document.body.append(toggleRenderer);
    notifyLiteElementAdded(toggleRenderer, document.body);
    await flushMutations();
    expect(root.dataset.ytcqShowTimestamps).toBe('true');

    toggleRenderer.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    document.querySelector('yt-live-chat-renderer')?.setAttribute('hide-timestamps', '');
    toggleRenderer.remove();
    await vi.advanceTimersByTimeAsync(0);
    await flushMutations();

    expect(root.dataset.ytcqShowTimestamps).toBe('false');
  });

  it('mirrors both timestamp click directions', async () => {
    startLiteMode({ clearCooldown: true });
    const root = document.querySelector<HTMLElement>('.ytcq-lite-root')!;
    const toggleRenderer = document.createElement('yt-live-chat-toggle-renderer');
    const toggle = document.createElement('tp-yt-paper-toggle-button');
    toggle.setAttribute('aria-pressed', 'false');
    toggleRenderer.append(toggle);
    document.body.append(toggleRenderer);
    notifyLiteElementAdded(toggleRenderer, document.body);
    await flushMutations();

    toggleRenderer.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      composed: true
    }));
    document.querySelector('yt-live-chat-renderer')?.removeAttribute('hide-timestamps');
    await vi.advanceTimersByTimeAsync(0);
    expect(root.dataset.ytcqShowTimestamps).toBe('true');

    toggle.setAttribute('checked', '');
    toggle.setAttribute('active', '');
    toggle.setAttribute('aria-pressed', 'true');
    await flushMutations();
    toggleRenderer.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      composed: true
    }));
    document.querySelector('yt-live-chat-renderer')?.setAttribute('hide-timestamps', '');
    await vi.advanceTimersByTimeAsync(0);
    expect(root.dataset.ytcqShowTimestamps).toBe('false');
  });

  it('leaves Participants visibility to YouTube without pausing the source watchdog', async () => {
    startLiteMode({ clearCooldown: true });
    dispatchBatch({
      ...createBatch(1, [{ type: 'upsert', record: createRecord('before', 'Before') }]),
      continuationTimeoutMs: 1_000
    });
    const root = document.querySelector<HTMLElement>('.ytcq-lite-root')!;
    const participants = document.createElement('yt-live-chat-participant-list-renderer');
    participants.classList.add('iron-selected');
    const chatRenderer = document.querySelector('yt-live-chat-renderer')!;
    chatRenderer.append(participants);
    notifyLiteElementAdded(participants, chatRenderer);
    await flushMutations();

    expect(root.hidden).toBe(false);
    expect(root.hasAttribute('aria-hidden')).toBe(false);

    dispatchBatch({
      ...createBatch(2, [{ type: 'upsert', record: createRecord('during', 'During') }]),
      continuationTimeoutMs: 1_000
    });
    expect(document.querySelector('[data-message-id="during"]')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(11_999);
    expect(isLiteModeActive()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(isLiteModeActive()).toBe(false);
    expect(requestNativeChatRestoreMock).toHaveBeenCalledOnce();
  });

  it('does not pause the startup timeout for Participants', async () => {
    startLiteMode({ clearCooldown: true });
    const participants = document.createElement('yt-live-chat-participant-list-renderer');
    participants.classList.add('iron-selected');
    const chatRenderer = document.querySelector('yt-live-chat-renderer')!;
    chatRenderer.append(participants);
    notifyLiteElementAdded(participants, chatRenderer);
    await flushMutations();

    await vi.advanceTimersByTimeAsync(19_999);
    expect(isLiteModeActive()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(isLiteModeActive()).toBe(false);
  });

  it('validates bounded batches independently of the page-world transport', () => {
    const valid = createBatch(1, [{ type: 'upsert', record: createRecord('one', 'One') }]);
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify(valid))).toEqual(valid);
    const diagnosticBatch: YouTubeChatFeedTransportBatch = {
      ...valid,
      compatibilityWarnings: ['feed:liveChatFutureRenderer'],
      fatalErrors: ['response:invalid-json'],
      unreadableFeed: true
    };
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify(diagnosticBatch))).toEqual(diagnosticBatch);
    expect(parseYouTubeChatFeedBatchDetail(valid)).toBeNull();
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify({ ...valid, version: 2 }))).toBeNull();
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify({
      ...valid,
      compatibilityWarnings: [false]
    }))).toBeNull();
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify({
      ...valid,
      unreadableFeed: 'yes'
    }))).toBeNull();
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify({
      ...valid,
      actions: [{ type: 'remove', id: '' }]
    }))).toBeNull();
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify({
      ...valid,
      actions: [{
        type: 'upsert',
        record: {
          ...createRecord('unsafe-link', 'Unsafe'),
          runs: [{ type: 'text', text: 'Unsafe', href: 'javascript:alert(1)' }]
        }
      }]
    }))).toBeNull();
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify({
      ...valid,
      actions: [{
        type: 'upsert',
        record: {
          ...createRecord('unsafe-avatar', 'Unsafe'),
          author: {
            badges: [],
            name: '@Unsafe',
            avatarUrl: 'http://example.com/avatar.png'
          }
        }
      }]
    }))).toBeNull();
    const moderatorRecord = createRecord('moderator', 'Safe');
    moderatorRecord.author!.badges = [{ kind: 'moderator', label: 'Moderator' }];
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify(
      createBatch(2, [{ type: 'upsert', record: moderatorRecord }])
    ))).not.toBeNull();
    const ownerRecord = createRecord('owner', 'Safe owner');
    ownerRecord.author = {
      badges: [{ kind: 'verified', label: 'Verified' }],
      isOwner: true,
      name: '@Owner'
    };
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify(
      createBatch(3, [{ type: 'upsert', record: ownerRecord }])
    ))).not.toBeNull();
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify({
      ...valid,
      actions: [{
        type: 'upsert',
        record: {
          ...moderatorRecord,
          author: {
            ...moderatorRecord.author,
            badges: [{ kind: 'administrator', label: 'Administrator' }]
          }
        }
      }]
    }))).toBeNull();
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify(createBatch(3, [{
      replayOffsetMs: 5_000,
      type: 'upsert',
      record: createRecord('timed', 'Timed')
    }])))).not.toBeNull();
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify(createBatch(4, [{
      replayOffsetMs: -1,
      type: 'upsert',
      record: createRecord('invalid-timing', 'Invalid timing')
    }])))).toBeNull();
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify({
      ...createBatch(5, []),
      replayPlayerOffsetMs: 5_000,
      source: 'replay'
    }))).not.toBeNull();
    expect(parseYouTubeChatFeedBatchDetail(JSON.stringify({
      ...createBatch(6, []),
      replayPlayerOffsetMs: -1,
      source: 'replay'
    }))).toBeNull();
  });
});

function createChatPage(): HTMLElement {
  const app = document.createElement('yt-live-chat-app');
  const renderer = document.createElement('yt-live-chat-renderer');
  renderer.setAttribute('hide-timestamps', '');
  const header = document.createElement('yt-live-chat-header-renderer');
  const list = document.createElement('yt-live-chat-item-list-renderer');
  const input = document.createElement('yt-live-chat-message-input-renderer');
  renderer.append(header, list, input);
  app.append(renderer);
  return app;
}

function createBatch(sequence: number, actions: YouTubeChatFeedTransportBatch['actions']): YouTubeChatFeedTransportBatch {
  return {
    actions,
    receivedAt: Date.now(),
    sequence,
    source: 'live',
    version: 1
  };
}

function createRecord(id: string, text: string): YouTubeChatMessageRecord {
  return {
    author: { badges: [], channelId: 'UCExample', name: '@Example' },
    id,
    kind: 'text',
    plainText: text,
    runs: [{ type: 'text', text }]
  };
}

function dispatchBatch(batch: YouTubeChatFeedTransportBatch): void {
  window.dispatchEvent(new CustomEvent(YOUTUBE_CHAT_FEED_BATCH_EVENT, {
    detail: JSON.stringify(batch)
  }));
}

function dispatchPlayerProgress(seconds: number, source: MessageEventSource | null = null): void {
  window.dispatchEvent(new MessageEvent('message', {
    data: { 'yt-player-video-progress': seconds },
    source
  }));
}

function appendNativeMessage(nativeList: HTMLElement, id: string): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer');
  message.id = id;
  nativeList.append(message);
  return message;
}

function notifyLiteElementAdded(element: Element, target: Node): void {
  handleLiteModeDomMutations([mutation({
    addedNodes: [element],
    target,
    type: 'childList'
  })]);
}

function mutation({
  addedNodes = [],
  removedNodes = [],
  target,
  type
}: {
  addedNodes?: Node[];
  removedNodes?: Node[];
  target: Node;
  type: MutationRecordType;
}): MutationRecord {
  return {
    addedNodes: addedNodes as unknown as NodeList,
    attributeName: null,
    attributeNamespace: null,
    nextSibling: null,
    oldValue: null,
    previousSibling: null,
    removedNodes: removedNodes as unknown as NodeList,
    target,
    type
  };
}

async function flushMutations(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
