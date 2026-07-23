import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboxMatch, InboxRecord } from './types';
import type { YouTubeChatFeedBatch } from '../../youtube/chat-feed/source';

const inboxTestState = vi.hoisted(() => ({
  currentTabActive: false,
  feedOnBatch: null as ((batch: YouTubeChatFeedBatch) => void) | null,
  inboxOpen: false,
  keywords: [] as string[],
  loaded: true,
  matchingKeywords: [] as string[],
  mentionCandidateListener: null as ((candidates: readonly string[]) => void) | null,
  mentionCandidates: ['@currentuser'] as string[],
  upsertResult: { changed: true, transientChanged: false }
}));

const stateMocks = vi.hoisted(() => ({
  addInboxKeywordsToState: vi.fn((values: string[]) => ({ added: values, duplicates: [] as string[] })),
  attachLiveInboxMessage: vi.fn(() => false),
  clearInboxRecords: vi.fn(),
  getInboxKeywords: vi.fn(() => inboxTestState.keywords),
  getInboxKeywordsSnapshot: vi.fn(() => inboxTestState.keywords),
  getKeywordCheckKeyFromValues: vi.fn((values: string[]) => values.join('|')),
  getLatestInboxRecord: vi.fn(),
  getLatestMentionInboxRecord: vi.fn(),
  getLoadedInboxKeywords: vi.fn(() => inboxTestState.keywords),
  getMatchedMentionHandles: vi.fn(() => (
    inboxTestState.mentionCandidates.length ? ['@CurrentUser'] : []
  )),
  getMatchingKeywords: vi.fn(() => inboxTestState.matchingKeywords),
  getUnreadInboxCount: vi.fn(() => 1),
  isInboxStateLoaded: vi.fn(() => inboxTestState.loaded),
  loadInboxState: vi.fn(async () => {
    inboxTestState.loaded = true;
  }),
  markInboxRecordsRead: vi.fn(() => true),
  removeInboxKeywordsFromState: vi.fn((values: string[]) => ({ missing: [] as string[], removed: values })),
  resetInboxStore: vi.fn(),
  saveInboxKeywords: vi.fn(),
  saveInboxRecords: vi.fn(),
  upsertInboxRecord: vi.fn((_record: InboxRecord, _isReadNow: boolean) => inboxTestState.upsertResult)
}));

const mentionMocks = vi.hoisted(() => ({
  getCurrentMentionCandidates: vi.fn(() => inboxTestState.mentionCandidates),
  isCurrentUserAuthorName: vi.fn((authorName: string) => authorName === '@CurrentUser'),
  onMentionCandidatesChanged: vi.fn((listener: (candidates: readonly string[]) => void) => {
    inboxTestState.mentionCandidateListener = listener;
    return () => {
      if (inboxTestState.mentionCandidateListener === listener) {
        inboxTestState.mentionCandidateListener = null;
      }
    };
  })
}));

const cardMocks = vi.hoisted(() => ({
  cleanupStaleInboxCards: vi.fn(),
  closeInboxCard: vi.fn(() => {
    inboxTestState.inboxOpen = false;
  }),
  isInboxCardOpen: vi.fn(() => inboxTestState.inboxOpen),
  openInboxCardView: vi.fn(() => {
    inboxTestState.inboxOpen = true;
  }),
  refreshOpenInboxCard: vi.fn()
}));

const buttonMocks = vi.hoisted(() => ({
  cleanupStaleInboxButtons: vi.fn(),
  refreshInboxSurfaces: vi.fn(),
  scheduleInboxButtonWire: vi.fn()
}));

const highlightMocks = vi.hoisted(() => ({
  applyChatKeywordHighlights: vi.fn(),
  clearChatKeywordHighlights: vi.fn()
}));

const tabAlertMocks = vi.hoisted(() => ({
  cleanupInboxTabAlertListeners: vi.fn(),
  clearInboxTabAlert: vi.fn(),
  initInboxTabAlert: vi.fn(),
  isCurrentTabActive: vi.fn(() => inboxTestState.currentTabActive),
  showInboxTabAlert: vi.fn()
}));

const soundMocks = vi.hoisted(() => ({
  playAlertSound: vi.fn()
}));

const chatFeedMocks = vi.hoisted(() => ({
  isYouTubeChatFeedPage: vi.fn(() => true),
  subscribeYouTubeChatFeed: vi.fn((subscription: { onBatch: (batch: YouTubeChatFeedBatch) => void }) => {
    inboxTestState.feedOnBatch = subscription.onBatch;
    return () => {
      if (inboxTestState.feedOnBatch === subscription.onBatch) inboxTestState.feedOnBatch = null;
    };
  })
}));

vi.mock('./state', () => stateMocks);
vi.mock('../mention-detection', () => mentionMocks);
vi.mock('./card', () => cardMocks);
vi.mock('./button', () => buttonMocks);
vi.mock('./highlights', () => highlightMocks);
vi.mock('../tab-alert', () => tabAlertMocks);
vi.mock('./sound', () => soundMocks);
vi.mock('../../youtube/chat-feed/source', () => chatFeedMocks);
vi.mock('./records', () => ({
  createInboxRecordFromChatFeed: vi.fn((record: {
    author?: { channelId?: string; name?: string };
    id: string;
    plainText: string;
  }, match: InboxMatch) => ({
    authorName: record.author?.name || '@Viewer',
    channelId: record.author?.channelId,
    contentParts: [],
    id: record.id,
    matchedKeywords: match.keywords || [],
    mention: match.mention === true,
    mentionHandles: match.mentionHandles || [],
    messageId: record.id,
    read: false,
    sourceUrl: 'https://www.youtube.com/watch?v=video',
    text: record.plainText,
    timestamp: 1,
    timestampText: '0:01'
  }))
}));
vi.mock('../../youtube/source-url', () => ({
  getCurrentYouTubeChatSourceUrl: vi.fn(() => 'https://www.youtube.com/watch?v=video')
}));

import {
  handleFeatureMessage,
  handleFeatureMutations,
  shouldIgnoreFeatureAddedNode,
  shouldIgnoreFeatureMutation
} from '../../content/dispatcher';
import { createInboxRecordFromChatFeed } from './records';
import {
  addInboxKeywords,
  cleanupStaleInboxSurfaces,
  initInbox,
  openInboxCard,
  removeInboxKeywords,
  resetInboxState,
  scheduleInboxButtonWire
} from './index';

describe('inbox coordinator', () => {
  beforeEach(() => {
    cleanupStaleInboxSurfaces();
    document.body.replaceChildren();
    inboxTestState.feedOnBatch = null;
    inboxTestState.loaded = true;
    inboxTestState.keywords = [];
    inboxTestState.matchingKeywords = [];
    inboxTestState.mentionCandidateListener = null;
    inboxTestState.mentionCandidates = ['@currentuser'];
    inboxTestState.inboxOpen = false;
    inboxTestState.currentTabActive = false;
    inboxTestState.upsertResult = { changed: true, transientChanged: false };
    vi.clearAllMocks();
    stateMocks.loadInboxState.mockImplementation(async () => {
      inboxTestState.loaded = true;
    });
  });

  it('initializes storage, tab alerts, feed matching, and header button wiring', async () => {
    const message = createMessage('@ViewerOne', 'hello alpha');
    document.body.append(message);
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];

    initInbox();
    await Promise.resolve();

    expect(tabAlertMocks.initInboxTabAlert).toHaveBeenCalledOnce();
    expect(chatFeedMocks.subscribeYouTubeChatFeed).toHaveBeenCalledOnce();
    expect(buttonMocks.scheduleInboxButtonWire).toHaveBeenCalledOnce();
    expect(buttonMocks.refreshInboxSurfaces).toHaveBeenCalled();
    expect(highlightMocks.applyChatKeywordHighlights).toHaveBeenCalledWith(message, ['alpha'], '@ViewerOne|hello alpha');
  });

  it('ignores startup feed rows and retries a future replay mention after identity loads', async () => {
    inboxTestState.mentionCandidates = [];
    initInbox();

    const backlogRecord = createFeedRecord('backlog-message', 'hello @CurrentUser');
    inboxTestState.feedOnBatch?.({
      actions: [{ record: backlogRecord, type: 'upsert' }],
      activity: 'existing',
      delivery: 'transport',
      receivedAt: 1,
      sequence: 1,
      source: 'replay'
    });
    expect(stateMocks.upsertInboxRecord).not.toHaveBeenCalled();

    const futureRecord = createFeedRecord('future-message', 'hello @CurrentUser');
    inboxTestState.feedOnBatch?.({
      actions: [{ record: futureRecord, replayOffsetMs: 2_000, type: 'upsert' }],
      activity: 'new',
      delivery: 'replay-timeline',
      receivedAt: 1,
      sequence: 1,
      source: 'initial'
    });
    expect(stateMocks.upsertInboxRecord).not.toHaveBeenCalled();

    inboxTestState.mentionCandidates = ['@currentuser'];
    inboxTestState.mentionCandidateListener?.(inboxTestState.mentionCandidates);

    expect(stateMocks.upsertInboxRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        mention: true,
        messageId: 'future-message'
      }),
      false
    );
    expect(soundMocks.playAlertSound).toHaveBeenCalledOnce();
  });

  it('records feed mention and keyword matches, then alerts when the inbox is not open', async () => {
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    initInbox();
    dispatchNewFeedRecord('matched-message', 'hello @CurrentUser alpha');
    await Promise.resolve();

    expect(stateMocks.upsertInboxRecord).toHaveBeenCalled();
    expect(soundMocks.playAlertSound).toHaveBeenCalled();
    expect(buttonMocks.refreshInboxSurfaces).toHaveBeenCalled();
    expect(tabAlertMocks.showInboxTabAlert).toHaveBeenCalledWith(1);
  });

  it('handles added and existing rows through the feature dispatcher', async () => {
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    const addedMessage = createMessage('@ViewerLifecycle', 'hello alpha');
    const touchedMessage = createMessage('@ViewerTouched', 'hello alpha');
    document.body.append(addedMessage, touchedMessage);

    handleFeatureMessage(addedMessage, { source: 'added' });
    handleFeatureMessage(touchedMessage, { source: 'existing' });
    await Promise.resolve();

    expect(stateMocks.attachLiveInboxMessage).toHaveBeenCalledWith(addedMessage);
    expect(stateMocks.attachLiveInboxMessage).not.toHaveBeenCalledWith(touchedMessage);
    expect(highlightMocks.applyChatKeywordHighlights).toHaveBeenCalledWith(touchedMessage, ['alpha'], '@ViewerTouched|hello alpha');
  });

  it('wires the inbox button and binds changed message rows through the lifecycle', () => {
    const header = document.createElement('yt-live-chat-header-renderer');
    const wrapper = document.createElement('div');
    wrapper.append(header);
    const changedMessage = createMessage('@ViewerChanged', 'hello changed');
    document.body.append(wrapper, changedMessage);

    handleFeatureMutations({
      addedElements: [header],
      mutations: []
    });
    handleFeatureMessage(changedMessage, { source: 'changed' });
    handleFeatureMutations({
      addedElements: [],
      mutations: [{
        addedNodes: [] as unknown as NodeList,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null,
        removedNodes: [] as unknown as NodeList,
        target: header,
        type: 'childList'
      }]
    });

    expect(buttonMocks.scheduleInboxButtonWire).toHaveBeenCalled();
    expect(stateMocks.attachLiveInboxMessage).toHaveBeenCalledWith(changedMessage);
  });

  it('wires the inbox button when a newly added wrapper contains the chat header', () => {
    const header = document.createElement('yt-live-chat-header-renderer');
    const wrapper = document.createElement('div');
    wrapper.append(header);

    handleFeatureMutations({
      addedElements: [wrapper],
      mutations: []
    });

    expect(buttonMocks.scheduleInboxButtonWire).toHaveBeenCalled();
  });

  it('ignores disconnected or empty messages before loading or recording', () => {
    const disconnected = createMessage('@ViewerTwo', 'hello alpha');
    const empty = createMessage('@ViewerTwo', '');
    document.body.append(empty);

    handleFeatureMessage(disconnected, { source: 'added' });
    handleFeatureMessage(empty, { source: 'added' });

    expect(stateMocks.attachLiveInboxMessage).not.toHaveBeenCalled();
    expect(stateMocks.upsertInboxRecord).not.toHaveBeenCalled();
  });

  it('clears rendered keyword highlights when no keywords are configured', () => {
    const message = createMessage('@ViewerTwo', 'hello alpha');
    document.body.append(message);

    handleFeatureMessage(message, { source: 'added' });

    expect(highlightMocks.applyChatKeywordHighlights).toHaveBeenCalledWith(message, [], '');
    expect(stateMocks.upsertInboxRecord).not.toHaveBeenCalled();
  });

  it('refreshes repeated DOM keyword highlights without collecting message data', async () => {
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    const message = createMessage('@ViewerTwo', 'hello alpha');
    document.body.append(message);

    handleFeatureMessage(message, { source: 'added' });
    await Promise.resolve();
    handleFeatureMessage(message, { source: 'added' });
    await Promise.resolve();

    expect(stateMocks.getMatchingKeywords).toHaveBeenCalledTimes(2);
    expect(highlightMocks.applyChatKeywordHighlights).toHaveBeenCalledTimes(2);
    expect(stateMocks.upsertInboxRecord).not.toHaveBeenCalled();
  });

  it('does not keyword-highlight current-user messages', () => {
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    const message = createMessage('@CurrentUser', 'hello alpha');
    document.body.append(message);

    handleFeatureMessage(message, { source: 'existing' });

    expect(highlightMocks.applyChatKeywordHighlights).toHaveBeenCalledWith(message, [], '');
  });

  it('applies empty keyword highlights when no keyword matches are found', () => {
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = [];
    const message = createMessage('@ViewerTwo', 'hello beta');
    document.body.append(message);

    handleFeatureMessage(message, { source: 'added' });

    expect(highlightMocks.applyChatKeywordHighlights).toHaveBeenCalledWith(message, [], '');
    expect(stateMocks.upsertInboxRecord).not.toHaveBeenCalled();
  });

  it('marks matches read immediately when the inbox is open in the active tab', async () => {
    inboxTestState.inboxOpen = true;
    inboxTestState.currentTabActive = true;
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    initInbox();
    dispatchNewFeedRecord('read-message', 'hello alpha');
    await Promise.resolve();

    expect(soundMocks.playAlertSound).not.toHaveBeenCalled();
    expect(tabAlertMocks.clearInboxTabAlert).toHaveBeenCalled();
    expect(stateMocks.saveInboxRecords).toHaveBeenCalled();
  });

  it('refreshes the open card for transient record changes without alerting', async () => {
    inboxTestState.upsertResult = { changed: false, transientChanged: true };
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    initInbox();
    dispatchNewFeedRecord('transient-message', 'hello alpha');
    await Promise.resolve();

    expect(cardMocks.refreshOpenInboxCard).toHaveBeenCalled();
    expect(stateMocks.saveInboxRecords).not.toHaveBeenCalled();
    expect(soundMocks.playAlertSound).not.toHaveBeenCalled();
    expect(tabAlertMocks.showInboxTabAlert).not.toHaveBeenCalled();
  });

  it('does not persist anything when a matched feed message cannot create an inbox record', async () => {
    vi.mocked(createInboxRecordFromChatFeed).mockReturnValueOnce(null as never);
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    initInbox();
    dispatchNewFeedRecord('unreadable-message', 'hello alpha');
    await Promise.resolve();

    expect(stateMocks.upsertInboxRecord).not.toHaveBeenCalled();
    expect(stateMocks.saveInboxRecords).not.toHaveBeenCalled();
    expect(soundMocks.playAlertSound).not.toHaveBeenCalled();
  });

  it('does nothing when an existing inbox record has no persistent or transient changes', async () => {
    inboxTestState.upsertResult = { changed: false, transientChanged: false };
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    initInbox();
    dispatchNewFeedRecord('unchanged-message', 'hello alpha');
    await Promise.resolve();

    expect(cardMocks.refreshOpenInboxCard).not.toHaveBeenCalled();
    expect(stateMocks.saveInboxRecords).not.toHaveBeenCalled();
    expect(soundMocks.playAlertSound).not.toHaveBeenCalled();
  });

  it('loads state before keyword-highlighting a DOM row', async () => {
    inboxTestState.loaded = false;
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    const message = createMessage('@ViewerFour', 'hello alpha');
    document.body.append(message);

    handleFeatureMessage(message, { source: 'existing' });
    await Promise.resolve();

    expect(stateMocks.loadInboxState).toHaveBeenCalled();
    expect(highlightMocks.applyChatKeywordHighlights).toHaveBeenCalledWith(message, ['alpha'], '@ViewerFour|hello alpha');
  });

  it('bounds feed messages while Inbox state is loading', async () => {
    inboxTestState.loaded = false;
    inboxTestState.matchingKeywords = ['alpha'];
    let resolveLoad = () => undefined;
    const loadPromise = new Promise<void>((resolve) => {
      resolveLoad = () => {
        inboxTestState.loaded = true;
        resolve();
      };
    });
    stateMocks.loadInboxState.mockReturnValue(loadPromise);
    initInbox();

    for (let index = 0; index < 65; index += 1) {
      dispatchNewFeedRecord(`pending-${index}`, `hello alpha ${index}`);
    }
    expect(stateMocks.upsertInboxRecord).not.toHaveBeenCalled();

    resolveLoad();
    await loadPromise;
    await Promise.resolve();

    expect(stateMocks.upsertInboxRecord).toHaveBeenCalledTimes(60);
    const messageIds = stateMocks.upsertInboxRecord.mock.calls
      .map(([record]) => record.messageId);
    expect(messageIds).not.toContain('pending-0');
    expect(messageIds).toContain('pending-64');
  });

  it('updates keyword storage and visible highlights through public keyword helpers', async () => {
    await expect(addInboxKeywords(['alpha'])).resolves.toEqual({ added: ['alpha'], duplicates: [] });
    await expect(removeInboxKeywords(['alpha'])).resolves.toEqual({ missing: [], removed: ['alpha'] });

    expect(stateMocks.saveInboxKeywords).toHaveBeenCalledTimes(2);
    expect(cardMocks.refreshOpenInboxCard).toHaveBeenCalledTimes(2);
  });

  it('does not save keywords when add/remove operations make no changes', async () => {
    stateMocks.addInboxKeywordsToState.mockReturnValueOnce({ added: [], duplicates: ['alpha'] });
    stateMocks.removeInboxKeywordsFromState.mockReturnValueOnce({ missing: ['alpha'], removed: [] });

    await expect(addInboxKeywords(['alpha'])).resolves.toEqual({ added: [], duplicates: ['alpha'] });
    await expect(removeInboxKeywords(['alpha'])).resolves.toEqual({ missing: ['alpha'], removed: [] });

    expect(stateMocks.saveInboxKeywords).not.toHaveBeenCalled();
    expect(cardMocks.refreshOpenInboxCard).not.toHaveBeenCalled();
  });

  it('opens, resets, schedules, and cleans inbox surfaces', async () => {
    const anchor = document.createElement('button');

    openInboxCard(anchor);
    await Promise.resolve();
    expect(cardMocks.openInboxCardView).toHaveBeenCalledWith(anchor, expect.any(Object));

    scheduleInboxButtonWire();
    expect(buttonMocks.scheduleInboxButtonWire).toHaveBeenCalledWith(expect.any(Object));

    resetInboxState();
    cleanupStaleInboxSurfaces();

    expect(stateMocks.resetInboxStore).toHaveBeenCalled();
    expect(cardMocks.closeInboxCard).toHaveBeenCalled();
    expect(tabAlertMocks.clearInboxTabAlert).toHaveBeenCalled();
    expect(tabAlertMocks.cleanupInboxTabAlertListeners).toHaveBeenCalled();
    expect(buttonMocks.cleanupStaleInboxButtons).toHaveBeenCalled();
    expect(cardMocks.cleanupStaleInboxCards).toHaveBeenCalled();
  });

  it('exposes inbox card callbacks for clearing, marking read, and keyword updates', async () => {
    openInboxCard(document.createElement('button'));
    await Promise.resolve();
    const latestOpenCall = cardMocks.openInboxCardView.mock.calls.at(-1) as unknown as [
      HTMLElement,
      {
        onClearRecords: () => void;
        onKeywordsChanged: () => void;
        onMarkRead: () => void;
      }
    ];
    const callbacks = latestOpenCall[1];

    callbacks.onClearRecords();
    expect(stateMocks.clearInboxRecords).toHaveBeenCalled();
    expect(stateMocks.saveInboxRecords).toHaveBeenCalled();
    expect(tabAlertMocks.clearInboxTabAlert).toHaveBeenCalled();
    expect(buttonMocks.refreshInboxSurfaces).toHaveBeenCalled();

    stateMocks.saveInboxRecords.mockClear();
    stateMocks.markInboxRecordsRead.mockReturnValueOnce(false);
    callbacks.onMarkRead();
    expect(stateMocks.saveInboxRecords).not.toHaveBeenCalled();
    expect(tabAlertMocks.clearInboxTabAlert).toHaveBeenCalled();

    callbacks.onKeywordsChanged();
    expect(stateMocks.saveInboxKeywords).toHaveBeenCalled();
    expect(cardMocks.refreshOpenInboxCard).toHaveBeenCalled();
  });

  it('toggles the inbox card through the wired button options', async () => {
    scheduleInboxButtonWire();
    const options = buttonMocks.scheduleInboxButtonWire.mock.calls.at(-1)?.[0] as {
      getUnreadCount: () => number;
      onToggle: (anchor: HTMLElement) => void;
    };
    const anchor = document.createElement('button');

    expect(options.getUnreadCount()).toBe(1);
    options.onToggle(anchor);
    await Promise.resolve();
    expect(cardMocks.openInboxCardView).toHaveBeenCalled();

    inboxTestState.inboxOpen = true;
    options.onToggle(anchor);
    expect(cardMocks.closeInboxCard).toHaveBeenCalled();
  });

  it('cleans visible inbox highlights and tab alert state from stale pages', () => {
    const message = createMessage('@ViewerOne', 'hello alpha');
    message.dataset.ytcqInboxKeywordHighlightKey = 'alpha';
    document.body.append(message);

    cleanupStaleInboxSurfaces();

    expect(buttonMocks.cleanupStaleInboxButtons).toHaveBeenCalled();
    expect(cardMocks.cleanupStaleInboxCards).toHaveBeenCalled();
    expect(tabAlertMocks.clearInboxTabAlert).toHaveBeenCalled();
    expect(tabAlertMocks.cleanupInboxTabAlertListeners).toHaveBeenCalled();
    expect(highlightMocks.clearChatKeywordHighlights).toHaveBeenCalledWith(message);
    expect(message.dataset.ytcqInboxKeywordHighlightKey).toBeUndefined();
  });

  it('ignores observer feedback from active keyword highlighting', () => {
    const message = createMessage('@ViewerTwo', 'hello alpha');
    message.dataset.ytcqInboxKeywordHighlighting = 'true';
    const highlight = document.createElement('span');
    message.append(highlight);
    document.body.append(message);

    expect(shouldIgnoreFeatureAddedNode(highlight)).toBe(true);
    expect(shouldIgnoreFeatureMutation(highlight)).toBe(true);
    expect(shouldIgnoreFeatureAddedNode(document.createElement('span'))).toBe(false);
  });
});

function createMessage(authorName: string, text: string): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer');
  message.setAttribute('data-message-id', `${authorName}-${text}`);
  message.innerHTML = `
    <span id="author-name">${authorName}</span>
    <span id="message">${text}</span>
  `;
  return message;
}

function createFeedRecord(id: string, plainText: string) {
  return {
    author: {
      badges: [],
      channelId: `channel-${id}`,
      name: '@OtherViewer'
    },
    id,
    kind: 'text' as const,
    plainText,
    runs: [{ text: plainText, type: 'text' as const }]
  };
}

function dispatchNewFeedRecord(id: string, plainText: string): void {
  inboxTestState.feedOnBatch?.({
    actions: [{ record: createFeedRecord(id, plainText), type: 'upsert' }],
    activity: 'new',
    delivery: 'transport',
    receivedAt: 1,
    sequence: 1,
    source: 'live'
  });
}
