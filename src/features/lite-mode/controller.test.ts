import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LITE_CHAT_BATCH_EVENT,
  LITE_CHAT_CONTROL_EVENT,
  type LiteChatBatch,
  type LiteChatMessageRecord
} from './protocol';

const { requestNativeChatRestoreMock, requestReplayLiteModeReloadMock } = vi.hoisted(() => ({
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

import {
  cleanupLiteMode,
  handleLiteModeDomMutations,
  isLiteModeActive,
  parseLiteChatBatchDetail,
  refreshLiteMode,
  setLiteModeRowRenderedCallback,
  startLiteMode,
  stopLiteMode
} from './controller';
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
    const controlDetails: string[] = [];
    let nativeHistoryAvailableWhenRequested = false;
    const onControl = ((event: CustomEvent<string>) => {
      controlDetails.push(event.detail);
      const detail = JSON.parse(event.detail) as { requestInitial?: boolean };
      if (detail.requestInitial) {
        nativeHistoryAvailableWhenRequested = nativeList.isConnected && nativeList.childElementCount > 0;
      }
    }) as EventListener;
    window.addEventListener(LITE_CHAT_CONTROL_EVENT, onControl);

    startLiteMode({ clearCooldown: true });
    expect(isLiteModeActive()).toBe(true);
    expect(document.querySelector('.ytcq-lite-root')).not.toBeNull();
    expect(nativeList.classList.contains('ytcq-lite-native-hidden')).toBe(true);
    expect(nativeList.isConnected).toBe(false);
    expect(nativeList.childElementCount).toBe(0);
    expect(document.querySelector('yt-live-chat-item-list-renderer')).toBeNull();
    expect(document.querySelector('template[data-ytcq-lite-native-retainer]')).toBeNull();
    expect(document.documentElement.getAttribute('data-ytcq-lite-native-discarded')).toBe('true');

    dispatchBatch(createBatch(1, [{
      type: 'upsert',
      record: createRecord('first', 'First message')
    }]));

    expect(nativeList.isConnected).toBe(false);
    expect(document.querySelector('[data-message-id="first"]')).not.toBeNull();
    expect(controlDetails.map((detail) => JSON.parse(detail))).toContainEqual({
      enabled: true,
      requestInitial: true,
      version: 1
    });
    expect(nativeHistoryAvailableWhenRequested).toBe(true);
    window.removeEventListener(LITE_CHAT_CONTROL_EVENT, onControl);

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

  it('paces busy live upserts across the provider window', async () => {
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

    expect(document.querySelectorAll('.ytcq-lite-message')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(249);
    expect(document.querySelectorAll('.ytcq-lite-message')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelectorAll('.ytcq-lite-message')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(750);
    expect(document.querySelectorAll('.ytcq-lite-message')).toHaveLength(4);
  });

  it('paces a light continuation batch through the next expected response', async () => {
    startLiteMode({ clearCooldown: true });
    dispatchBatch({
      ...createBatch(1, [
        { type: 'upsert', record: createRecord('one', 'One') },
        { type: 'upsert', record: createRecord('two', 'Two') },
        { type: 'upsert', record: createRecord('three', 'Three') }
      ]),
      continuationTimeoutMs: 5_000
    });

    expect(document.querySelectorAll('.ytcq-lite-message')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1_665);
    expect(document.querySelectorAll('.ytcq-lite-message')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelectorAll('.ytcq-lite-message')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_666);
    expect(document.querySelectorAll('.ytcq-lite-message')).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_666);
    expect(document.querySelectorAll('.ytcq-lite-message')).toHaveLength(3);
  });

  it('keeps later single-message and moderation actions behind the paced queue', async () => {
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
    expect(document.querySelector('[data-message-id="two"]')).toBeNull();
    await vi.advanceTimersByTimeAsync(250);
    expect(document.querySelector('[data-message-id="one"]')).not.toBeNull();
    expect(document.querySelector('[data-message-id="two"]')).toBeNull();
    await vi.advanceTimersByTimeAsync(250);
    expect(document.querySelector('[data-message-id="one"]')).not.toBeNull();
    expect(document.querySelector('[data-message-id="two"]')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(250);
    expect(document.querySelector('[data-message-id="one"]')).toBeNull();
    expect(document.querySelector('[data-message-id="two"]')).not.toBeNull();
  });

  it('falls back before a rich live-action backlog exceeds its byte budget', () => {
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
      if (!isLiteModeActive()) break;
    }

    expect(isLiteModeActive()).toBe(false);
    expect(requestNativeChatRestoreMock).toHaveBeenCalledWith({
      automaticFailure: true,
      message: 'Loading chat'
    });
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
    window.dispatchEvent(new CustomEvent(LITE_CHAT_BATCH_EVENT, { detail: '{broken' }));

    expect(isLiteModeActive()).toBe(false);
    expect(nativeList.isConnected).toBe(false);
    expect(hasLiteModeSessionCooldown()).toBe(true);
    expect(requestNativeChatRestoreMock).toHaveBeenCalledWith({
      automaticFailure: true,
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

  it('preserves initial and live row origins through direct and paced store updates', async () => {
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
    await vi.advanceTimersByTimeAsync(1_000);

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

  it('keeps Lite transport active and pauses its watchdog while Participants is selected', async () => {
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

    expect(root.hidden).toBe(true);
    expect(root.getAttribute('aria-hidden')).toBe('true');

    dispatchBatch({
      ...createBatch(2, [{ type: 'upsert', record: createRecord('during', 'During') }]),
      continuationTimeoutMs: 1_000
    });
    expect(document.querySelector('[data-message-id="during"]')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(isLiteModeActive()).toBe(true);

    participants.classList.remove('iron-selected');
    await flushMutations();
    expect(root.hidden).toBe(false);
    expect(root.hasAttribute('aria-hidden')).toBe(false);

    await vi.advanceTimersByTimeAsync(11_999);
    expect(isLiteModeActive()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(isLiteModeActive()).toBe(false);
    expect(requestNativeChatRestoreMock).toHaveBeenCalledOnce();
  });

  it('pauses and rearms the startup timeout around Participants before a heartbeat', async () => {
    startLiteMode({ clearCooldown: true });
    const participants = document.createElement('yt-live-chat-participant-list-renderer');
    participants.classList.add('iron-selected');
    const chatRenderer = document.querySelector('yt-live-chat-renderer')!;
    chatRenderer.append(participants);
    notifyLiteElementAdded(participants, chatRenderer);
    await flushMutations();

    await vi.advanceTimersByTimeAsync(20_000);
    expect(isLiteModeActive()).toBe(true);

    participants.classList.remove('iron-selected');
    await flushMutations();
    await vi.advanceTimersByTimeAsync(19_999);
    expect(isLiteModeActive()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(isLiteModeActive()).toBe(false);
  });

  it('validates bounded batches independently of the page-world transport', () => {
    const valid = createBatch(1, [{ type: 'upsert', record: createRecord('one', 'One') }]);
    expect(parseLiteChatBatchDetail(JSON.stringify(valid))).toEqual(valid);
    const diagnosticBatch: LiteChatBatch = {
      ...valid,
      compatibilityWarnings: ['feed:liveChatFutureRenderer'],
      fatalErrors: ['response:invalid-json'],
      unreadableFeed: true
    };
    expect(parseLiteChatBatchDetail(JSON.stringify(diagnosticBatch))).toEqual(diagnosticBatch);
    expect(parseLiteChatBatchDetail(valid)).toBeNull();
    expect(parseLiteChatBatchDetail(JSON.stringify({ ...valid, version: 2 }))).toBeNull();
    expect(parseLiteChatBatchDetail(JSON.stringify({
      ...valid,
      compatibilityWarnings: [false]
    }))).toBeNull();
    expect(parseLiteChatBatchDetail(JSON.stringify({
      ...valid,
      unreadableFeed: 'yes'
    }))).toBeNull();
    expect(parseLiteChatBatchDetail(JSON.stringify({
      ...valid,
      actions: [{ type: 'remove', id: '' }]
    }))).toBeNull();
    expect(parseLiteChatBatchDetail(JSON.stringify({
      ...valid,
      actions: [{
        type: 'upsert',
        record: {
          ...createRecord('unsafe-link', 'Unsafe'),
          runs: [{ type: 'text', text: 'Unsafe', href: 'javascript:alert(1)' }]
        }
      }]
    }))).toBeNull();
    expect(parseLiteChatBatchDetail(JSON.stringify({
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
    expect(parseLiteChatBatchDetail(JSON.stringify(
      createBatch(2, [{ type: 'upsert', record: moderatorRecord }])
    ))).not.toBeNull();
    const ownerRecord = createRecord('owner', 'Safe owner');
    ownerRecord.author = {
      badges: [{ kind: 'verified', label: 'Verified' }],
      isOwner: true,
      name: '@Owner'
    };
    expect(parseLiteChatBatchDetail(JSON.stringify(
      createBatch(3, [{ type: 'upsert', record: ownerRecord }])
    ))).not.toBeNull();
    expect(parseLiteChatBatchDetail(JSON.stringify({
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
    expect(parseLiteChatBatchDetail(JSON.stringify(createBatch(3, [{
      replayOffsetMs: 5_000,
      type: 'upsert',
      record: createRecord('timed', 'Timed')
    }])))).not.toBeNull();
    expect(parseLiteChatBatchDetail(JSON.stringify(createBatch(4, [{
      replayOffsetMs: -1,
      type: 'upsert',
      record: createRecord('invalid-timing', 'Invalid timing')
    }])))).toBeNull();
    expect(parseLiteChatBatchDetail(JSON.stringify({
      ...createBatch(5, []),
      replayPlayerOffsetMs: 5_000,
      source: 'replay'
    }))).not.toBeNull();
    expect(parseLiteChatBatchDetail(JSON.stringify({
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

function createBatch(sequence: number, actions: LiteChatBatch['actions']): LiteChatBatch {
  return {
    actions,
    receivedAt: Date.now(),
    sequence,
    source: 'live',
    version: 1
  };
}

function createRecord(id: string, text: string): LiteChatMessageRecord {
  return {
    author: { badges: [], channelId: 'UCExample', name: '@Example' },
    id,
    kind: 'text',
    plainText: text,
    runs: [{ type: 'text', text }]
  };
}

function dispatchBatch(batch: LiteChatBatch): void {
  window.dispatchEvent(new CustomEvent(LITE_CHAT_BATCH_EVENT, {
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
