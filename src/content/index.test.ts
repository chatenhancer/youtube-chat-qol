import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../shared/options';
import type { FeatureMutationBatch } from './lifecycle';

const lifecycleMocks = vi.hoisted(() => ({
  bootFeatures: vi.fn(),
  cleanupStaleFeatures: vi.fn(),
  handleFeatureMessage: vi.fn(),
  handleFeatureMutations: vi.fn(),
  handleFeatureOptionsChanged: vi.fn(),
  handleFeatureParticipant: vi.fn(),
  handleFeatureVisibilityChanged: vi.fn(),
  initFeatures: vi.fn(),
  recoverVisibleFeatures: vi.fn(),
  resetFeatures: vi.fn(),
  shouldIgnoreFeatureAddedNode: vi.fn(() => false),
  shouldIgnoreFeatureMutation: vi.fn(() => false),
  suspendFeatures: vi.fn()
}));

const messageDataMocks = vi.hoisted(() => ({
  requestYouTubeMessageData: vi.fn((): Promise<unknown> => Promise.resolve(null))
}));

vi.mock('./enabled-features', () => ({}));
vi.mock('./lifecycle', () => lifecycleMocks);
vi.mock('../youtube/message-data', () => messageDataMocks);

describe('content script entrypoint wiring', () => {
  let observerCallback: MutationCallback | null = null;
  let observerCallbacks: MutationCallback[];
  let observerDisconnects: ReturnType<typeof vi.fn>[];
  let observe: ReturnType<typeof vi.fn>;
  let visibilityListener: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    document.body.replaceChildren();
    chrome.storage.sync.clear();
    vi.clearAllMocks();
    observe = vi.fn();
    observerCallback = null;
    observerCallbacks = [];
    observerDisconnects = [];
    visibilityListener = null;
    const originalAddEventListener = document.addEventListener.bind(document);
    vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
      if (type === 'visibilitychange') {
        visibilityListener = listener as () => void;
        return;
      }
      originalAddEventListener(type, listener, options);
    });
    class MutationObserverMock {
      constructor(callback: MutationCallback) {
        observerCallback = callback;
        observerCallbacks.push(callback);
        observerDisconnects.push(this.disconnect);
      }

      observe = observe;
      disconnect = vi.fn(() => undefined);
      takeRecords = vi.fn(() => []);
    }
    Object.defineProperty(globalThis, 'MutationObserver', {
      configurable: true,
      value: MutationObserverMock
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('processes existing messages and participants before booting the shared observer', async () => {
    const message = createMessage();
    const participant = document.createElement('yt-live-chat-participant-renderer');
    document.body.append(message, participant);

    await import('./index');

    expect(lifecycleMocks.cleanupStaleFeatures).toHaveBeenCalledOnce();
    expect(lifecycleMocks.initFeatures).toHaveBeenCalledOnce();
    expect(messageDataMocks.requestYouTubeMessageData).toHaveBeenCalledWith(message);
    expect(lifecycleMocks.handleFeatureMessage).toHaveBeenCalledWith(message, expect.objectContaining({
      messageData: expect.any(Promise),
      source: 'existing'
    }));
    expect(lifecycleMocks.handleFeatureParticipant.mock.calls[0][0]).toBe(participant);
    expect(lifecycleMocks.bootFeatures).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledWith(document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true
    });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('passes the message data request promise through message lifecycle hooks', async () => {
    const message = createMessage();
    const messageData = Promise.resolve({
      messageId: 'msg-1',
      timestampUsec: '1782000000000000'
    });
    messageDataMocks.requestYouTubeMessageData.mockReturnValueOnce(messageData);
    document.body.append(message);

    await import('./index');

    expect(lifecycleMocks.handleFeatureMessage).toHaveBeenCalledWith(message, {
      messageData,
      source: 'existing'
    });
  });

  it('normalizes observer mutations before dispatching feature hooks', async () => {
    await import('./index');
    const newMessage = createMessage();
    const child = document.createElement('span');
    const containingMessage = createMessage();
    containingMessage.append(child);
    document.body.append(newMessage, containingMessage);

    observerCallback?.([
      mutation({
        addedNodes: [newMessage, child],
        target: child,
        type: 'childList'
      })
    ], {} as MutationObserver);

    const batch = lifecycleMocks.handleFeatureMutations.mock.calls[0][0] as FeatureMutationBatch;
    expect(batch.addedElements).toEqual([newMessage, child]);
    expect('changedMessages' in batch).toBe(false);
    expect(messageDataMocks.requestYouTubeMessageData).toHaveBeenCalledWith(containingMessage);
    expect(messageDataMocks.requestYouTubeMessageData).toHaveBeenCalledWith(newMessage);
    expect(messageDataMocks.requestYouTubeMessageData).toHaveBeenCalledTimes(2);
    expect(lifecycleMocks.handleFeatureMessage).toHaveBeenCalledWith(newMessage, expect.objectContaining({
      messageData: expect.any(Promise),
      source: 'added'
    }));
    expect(lifecycleMocks.handleFeatureMessage).toHaveBeenCalledWith(containingMessage, expect.objectContaining({
      messageData: expect.any(Promise),
      source: 'changed'
    }));
  });

  it('handles character-data mutations and nested added participants', async () => {
    await import('./index');
    const message = createMessage();
    const textNode = message.querySelector('#message')!.firstChild!;
    const wrapper = document.createElement('div');
    const participant = document.createElement('yt-live-chat-participant-renderer');
    wrapper.append(participant);
    document.body.append(message, wrapper);
    lifecycleMocks.handleFeatureParticipant.mockClear();

    observerCallback?.([
      mutation({
        target: textNode,
        type: 'characterData'
      }),
      mutation({
        addedNodes: [wrapper],
        target: wrapper,
        type: 'childList'
      })
    ], {} as MutationObserver);

    const batch = lifecycleMocks.handleFeatureMutations.mock.calls[0][0] as FeatureMutationBatch;
    expect('changedMessages' in batch).toBe(false);
    expect(messageDataMocks.requestYouTubeMessageData).toHaveBeenCalledWith(message);
    expect(lifecycleMocks.handleFeatureMessage).toHaveBeenCalledWith(message, expect.objectContaining({
      messageData: expect.any(Promise),
      source: 'changed'
    }));
    expect(lifecycleMocks.handleFeatureParticipant.mock.calls[0][0]).toBe(participant);
  });

  it('filters observer mutations owned by extension features', async () => {
    await import('./index');
    const ignoredAdded = document.createElement('div');
    const ignoredMessage = createMessage();
    const child = document.createElement('span');
    ignoredMessage.append(child);
    document.body.append(ignoredAdded, ignoredMessage);
    lifecycleMocks.shouldIgnoreFeatureAddedNode.mockReturnValueOnce(true);
    lifecycleMocks.shouldIgnoreFeatureMutation.mockReturnValueOnce(true);

    observerCallback?.([
      mutation({
        addedNodes: [ignoredAdded],
        target: child,
        type: 'childList'
      })
    ], {} as MutationObserver);

    const batch = lifecycleMocks.handleFeatureMutations.mock.calls[0][0] as FeatureMutationBatch;
    expect(batch.addedElements).toEqual([]);
    expect(batch.mutations).toEqual([]);
    expect('changedMessages' in batch).toBe(false);
  });

  it('filters extension-only childList mutations from the feature batch', async () => {
    await import('./index');
    const header = document.createElement('yt-live-chat-header-renderer');
    const managedButton = document.createElement('button');
    managedButton.setAttribute('data-ytcq-managed', 'true');
    document.body.append(header);

    observerCallback?.([
      mutation({
        addedNodes: [managedButton],
        target: header,
        type: 'childList'
      })
    ], {} as MutationObserver);

    const batch = lifecycleMocks.handleFeatureMutations.mock.calls[0][0] as FeatureMutationBatch;
    expect(batch.addedElements).toEqual([]);
    expect(batch.mutations).toEqual([]);
  });

  it('suspends older content script instances when a newer one claims the document', async () => {
    await import('./index');
    const firstObserver = observerCallbacks[0];
    const firstDisconnect = observerDisconnects[0];
    lifecycleMocks.suspendFeatures.mockClear();

    vi.resetModules();
    await import('./index');

    expect(firstDisconnect).toHaveBeenCalledOnce();
    expect(lifecycleMocks.suspendFeatures).toHaveBeenCalledOnce();
    expect(observerCallbacks).toHaveLength(2);

    lifecycleMocks.handleFeatureMutations.mockClear();
    firstObserver?.([
      mutation({
        addedNodes: [document.createElement('div')],
        target: document.body,
        type: 'childList'
      })
    ], {} as MutationObserver);
    expect(lifecycleMocks.handleFeatureMutations).not.toHaveBeenCalled();

    observerCallbacks[1]?.([
      mutation({
        addedNodes: [document.createElement('div')],
        target: document.body,
        type: 'childList'
      })
    ], {} as MutationObserver);
    expect(lifecycleMocks.handleFeatureMutations).toHaveBeenCalledOnce();
  });

  it('recovers visible messages after the tab returns to the foreground', async () => {
    const message = createMessage();
    document.body.append(message);
    await import('./index');
    lifecycleMocks.handleFeatureMessage.mockClear();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    });

    lifecycleMocks.handleFeatureVisibilityChanged.mockClear();
    lifecycleMocks.recoverVisibleFeatures.mockClear();
    visibilityListener?.();
    await vi.advanceTimersByTimeAsync(300);

    expect(lifecycleMocks.handleFeatureVisibilityChanged).toHaveBeenCalledWith('visible');
    expect(lifecycleMocks.handleFeatureMessage).toHaveBeenCalledWith(message, expect.objectContaining({
      messageData: expect.any(Promise),
      source: 'existing'
    }));
    expect(lifecycleMocks.recoverVisibleFeatures).toHaveBeenCalledOnce();
  });

  it('coalesces repeated visible recovery requests', async () => {
    const message = createMessage();
    document.body.append(message);
    await import('./index');
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    lifecycleMocks.handleFeatureMessage.mockClear();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    });

    visibilityListener?.();
    visibilityListener?.();
    await vi.advanceTimersByTimeAsync(300);

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(lifecycleMocks.handleFeatureMessage).toHaveBeenCalledTimes(1);
  });

  it('notifies visibility changes without recovery while hidden', async () => {
    await import('./index');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    });
    lifecycleMocks.recoverVisibleFeatures.mockClear();

    visibilityListener?.();
    await vi.advanceTimersByTimeAsync(300);

    expect(lifecycleMocks.handleFeatureVisibilityChanged).toHaveBeenCalledWith('hidden');
    expect(lifecycleMocks.recoverVisibleFeatures).not.toHaveBeenCalled();
  });

  it('passes saveOptions through init and handles reset messages', async () => {
    await import('./index');
    const { getOptions } = await import('../shared/state');
    const { saveOptions } = lifecycleMocks.initFeatures.mock.calls[0][0] as {
      saveOptions: (values: Partial<typeof DEFAULT_OPTIONS>) => void;
    };

    saveOptions({ targetLanguage: 'ja' });

    expect(getOptions().targetLanguage).toBe('ja');
    expect(getOptions().lastTranslationTarget).toBe('ja');
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      targetLanguage: 'ja',
      lastTranslationTarget: 'ja'
    });

    const messageListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls.at(-1)?.[0];
    const sendResponse = vi.fn();
    messageListener?.({ type: 'ytcq:chat-attached-ping' }, {} as chrome.runtime.MessageSender, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ attached: true });

    messageListener?.({ type: 'ytcq:reset-page' }, {} as chrome.runtime.MessageSender, vi.fn());

    expect(lifecycleMocks.resetFeatures).toHaveBeenCalledOnce();
    expect(lifecycleMocks.handleFeatureOptionsChanged).toHaveBeenCalledWith(expect.any(Object), DEFAULT_OPTIONS);
  });

  it('applies sync storage option changes and ignores other storage areas', async () => {
    await import('./index');
    const { getOptions } = await import('../shared/state');
    const storageListener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls.at(-1)?.[0];

    storageListener?.({
      targetLanguage: {
        newValue: 'fr',
        oldValue: ''
      }
    }, 'local');
    expect(getOptions().targetLanguage).toBe('');

    storageListener?.({
      targetLanguage: {
        newValue: 'fr',
        oldValue: ''
      }
    }, 'sync');

    expect(getOptions().targetLanguage).toBe('fr');
    expect(lifecycleMocks.handleFeatureOptionsChanged).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      targetLanguage: 'fr'
    }));
  });
});

function createMessage(): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer');
  const text = document.createElement('span');
  text.id = 'message';
  text.textContent = 'hello';
  message.append(text);
  return message;
}

function mutation({
  addedNodes,
  attributeName,
  removedNodes,
  target,
  type
}: {
  addedNodes?: Node[];
  attributeName?: string;
  removedNodes?: Node[];
  target: Node;
  type: MutationRecordType;
}): MutationRecord {
  return {
    addedNodes: (addedNodes || []) as unknown as NodeList,
    attributeName: attributeName || null,
    attributeNamespace: null,
    nextSibling: null,
    oldValue: null,
    previousSibling: null,
    removedNodes: (removedNodes || []) as unknown as NodeList,
    target,
    type
  };
}
