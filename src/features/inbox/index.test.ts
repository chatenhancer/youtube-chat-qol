import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboxRecord } from './types';

const inboxTestState = vi.hoisted(() => ({
  currentTabActive: false,
  inboxOpen: false,
  keywords: [] as string[],
  loaded: true,
  matchingKeywords: [] as string[],
  mentionProcessor: null as ((message: HTMLElement) => void) | null,
  upsertResult: { changed: true, transientChanged: false }
}));

const stateMocks = vi.hoisted(() => ({
  addInboxKeywordsToState: vi.fn((values: string[]) => ({ added: values, duplicates: [] as string[] })),
  clearInboxRecords: vi.fn(),
  getInboxKeywords: vi.fn(() => inboxTestState.keywords),
  getInboxKeywordsSnapshot: vi.fn(() => inboxTestState.keywords),
  getKeywordCheckKeyFromValues: vi.fn((values: string[]) => values.join('|')),
  getLatestInboxRecord: vi.fn(),
  getLatestMentionInboxRecord: vi.fn(),
  getLoadedInboxKeywords: vi.fn(() => inboxTestState.keywords),
  getMatchedMentionHandles: vi.fn(() => ['@CurrentUser']),
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
  upsertInboxRecord: vi.fn(() => inboxTestState.upsertResult)
}));

const mentionMocks = vi.hoisted(() => ({
  isCurrentUserAuthorName: vi.fn((authorName: string) => authorName === '@CurrentUser'),
  processPotentialMentionForConsumer: vi.fn((_message: HTMLElement, _key: string, callback: () => void) => callback()),
  registerMentionProcessor: vi.fn((processor: (message: HTMLElement) => void) => {
    inboxTestState.mentionProcessor = processor;
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

vi.mock('./state', () => stateMocks);
vi.mock('../mention-detection', () => mentionMocks);
vi.mock('./card', () => cardMocks);
vi.mock('./button', () => buttonMocks);
vi.mock('./highlights', () => highlightMocks);
vi.mock('../tab-alert', () => tabAlertMocks);
vi.mock('./sound', () => soundMocks);
vi.mock('./records', () => ({
  createInboxRecord: vi.fn((message: HTMLElement, match: unknown) => ({
    authorName: message.querySelector('#author-name')?.textContent || '@Viewer',
    id: 'record-1',
    matchedKeywords: [],
    mention: false,
    mentionHandles: [],
    read: false,
    sourceUrl: 'https://www.youtube.com/watch?v=video',
    text: message.querySelector('#message')?.textContent || '',
    timestamp: 1,
    timestampText: '9:30 PM',
    ...(match as Partial<InboxRecord>)
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
} from '../../content/lifecycle';
import { createInboxRecord } from './records';
import {
  addInboxKeywords,
  cleanupStaleInboxSurfaces,
  handlePotentialInbox,
  highlightPotentialInboxKeywords,
  initInbox,
  openInboxCard,
  removeInboxKeywords,
  resetInboxState,
  scheduleInboxButtonWire
} from './index';

describe('inbox coordinator', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    inboxTestState.loaded = true;
    inboxTestState.keywords = [];
    inboxTestState.matchingKeywords = [];
    inboxTestState.inboxOpen = false;
    inboxTestState.currentTabActive = false;
    inboxTestState.upsertResult = { changed: true, transientChanged: false };
    inboxTestState.mentionProcessor = null;
    vi.clearAllMocks();
    stateMocks.loadInboxState.mockImplementation(async () => {
      inboxTestState.loaded = true;
    });
  });

  it('initializes storage, tab alerts, mention processing, and header button wiring', async () => {
    const message = createMessage('@ViewerOne', 'hello alpha');
    document.body.append(message);
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];

    initInbox();
    await Promise.resolve();

    expect(tabAlertMocks.initInboxTabAlert).toHaveBeenCalledOnce();
    expect(mentionMocks.registerMentionProcessor).toHaveBeenCalledOnce();
    expect(buttonMocks.scheduleInboxButtonWire).toHaveBeenCalledOnce();
    expect(buttonMocks.refreshInboxSurfaces).toHaveBeenCalled();
    expect(highlightMocks.applyChatKeywordHighlights).toHaveBeenCalledWith(message, ['alpha'], '@ViewerOne|hello alpha');
    expect(inboxTestState.mentionProcessor).toBeTypeOf('function');
  });

  it('records mention and keyword matches, then alerts when the inbox is not open', async () => {
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    const message = createMessage('@ViewerTwo', 'hello alpha');
    document.body.append(message);

    handlePotentialInbox(message);
    await Promise.resolve();

    expect(stateMocks.upsertInboxRecord).toHaveBeenCalled();
    expect(soundMocks.playAlertSound).toHaveBeenCalled();
    expect(buttonMocks.refreshInboxSurfaces).toHaveBeenCalled();
    expect(tabAlertMocks.showInboxTabAlert).toHaveBeenCalledWith(1);
  });

  it('runs through lifecycle message phases for live and non-live message passes', async () => {
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    const liveMessage = createMessage('@ViewerLifecycle', 'hello alpha');
    const touchedMessage = createMessage('@ViewerTouched', 'hello alpha');
    document.body.append(liveMessage, touchedMessage);

    handleFeatureMessage(liveMessage, { allowTranslate: true, source: 'added' });
    handleFeatureMessage(touchedMessage, { allowTranslate: false, source: 'existing' });
    await Promise.resolve();

    expect(mentionMocks.processPotentialMentionForConsumer).toHaveBeenCalledWith(
      liveMessage,
      'ytcqInboxMentionChecked',
      expect.any(Function)
    );
    expect(mentionMocks.processPotentialMentionForConsumer).not.toHaveBeenCalledWith(
      touchedMessage,
      'ytcqInboxMentionChecked',
      expect.any(Function)
    );
    expect(highlightMocks.applyChatKeywordHighlights).toHaveBeenCalledWith(touchedMessage, ['alpha'], '@ViewerTouched|hello alpha');
  });

  it('wires the inbox button from header mutations and retries changed messages through message lifecycle', () => {
    const header = document.createElement('yt-live-chat-header-renderer');
    const wrapper = document.createElement('div');
    wrapper.append(header);
    const changedMessage = createMessage('@ViewerChanged', 'hello changed');
    document.body.append(wrapper, changedMessage);

    handleFeatureMutations({
      addedElements: [header],
      mutations: []
    });
    handleFeatureMessage(changedMessage, { allowTranslate: false, source: 'changed' });
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
    expect(mentionMocks.processPotentialMentionForConsumer).toHaveBeenCalledWith(
      changedMessage,
      'ytcqInboxMentionChecked',
      expect.any(Function)
    );
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

    handlePotentialInbox(disconnected);
    handlePotentialInbox(empty);

    expect(mentionMocks.processPotentialMentionForConsumer).not.toHaveBeenCalled();
    expect(stateMocks.upsertInboxRecord).not.toHaveBeenCalled();
  });

  it('clears keyword highlights when no keywords are configured', () => {
    mentionMocks.processPotentialMentionForConsumer.mockImplementationOnce(() => undefined);
    const message = createMessage('@ViewerTwo', 'hello alpha');
    document.body.append(message);

    handlePotentialInbox(message);

    expect(highlightMocks.clearChatKeywordHighlights).toHaveBeenCalledWith(message);
    expect(stateMocks.upsertInboxRecord).not.toHaveBeenCalled();
  });

  it('skips repeated keyword checks when the author and message text have not changed', () => {
    mentionMocks.processPotentialMentionForConsumer.mockImplementation(() => undefined);
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    const message = createMessage('@ViewerTwo', 'hello alpha');
    document.body.append(message);

    handlePotentialInbox(message);
    handlePotentialInbox(message);

    expect(stateMocks.getMatchingKeywords).toHaveBeenCalledTimes(1);
    expect(highlightMocks.applyChatKeywordHighlights).toHaveBeenCalledTimes(1);
  });

  it('does not keyword-highlight current-user messages', () => {
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    const message = createMessage('@CurrentUser', 'hello alpha');
    document.body.append(message);

    highlightPotentialInboxKeywords(message);

    expect(highlightMocks.applyChatKeywordHighlights).toHaveBeenCalledWith(message, [], '');
  });

  it('applies empty keyword highlights when no keyword matches are found', () => {
    mentionMocks.processPotentialMentionForConsumer.mockImplementationOnce(() => undefined);
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = [];
    const message = createMessage('@ViewerTwo', 'hello beta');
    document.body.append(message);

    handlePotentialInbox(message);

    expect(highlightMocks.applyChatKeywordHighlights).toHaveBeenCalledWith(message, [], '');
    expect(stateMocks.upsertInboxRecord).not.toHaveBeenCalled();
  });

  it('marks matches read immediately when the inbox is open in the active tab', async () => {
    inboxTestState.inboxOpen = true;
    inboxTestState.currentTabActive = true;
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    const message = createMessage('@ViewerThree', 'hello alpha');
    document.body.append(message);

    handlePotentialInbox(message);
    await Promise.resolve();

    expect(soundMocks.playAlertSound).not.toHaveBeenCalled();
    expect(tabAlertMocks.clearInboxTabAlert).toHaveBeenCalled();
    expect(stateMocks.saveInboxRecords).toHaveBeenCalled();
  });

  it('refreshes the open card for transient record changes without alerting', async () => {
    inboxTestState.upsertResult = { changed: false, transientChanged: true };
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    const message = createMessage('@ViewerThree', 'hello alpha');
    document.body.append(message);

    handlePotentialInbox(message);
    await Promise.resolve();

    expect(cardMocks.refreshOpenInboxCard).toHaveBeenCalled();
    expect(stateMocks.saveInboxRecords).not.toHaveBeenCalled();
    expect(soundMocks.playAlertSound).not.toHaveBeenCalled();
    expect(tabAlertMocks.showInboxTabAlert).not.toHaveBeenCalled();
  });

  it('does not persist anything when a matched message cannot create an inbox record', async () => {
    vi.mocked(createInboxRecord).mockReturnValueOnce(null as never);
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    const message = createMessage('@ViewerNoRecord', 'hello alpha');
    document.body.append(message);

    handlePotentialInbox(message);
    await Promise.resolve();

    expect(stateMocks.upsertInboxRecord).not.toHaveBeenCalled();
    expect(stateMocks.saveInboxRecords).not.toHaveBeenCalled();
    expect(soundMocks.playAlertSound).not.toHaveBeenCalled();
  });

  it('does nothing when an existing inbox record has no persistent or transient changes', async () => {
    inboxTestState.upsertResult = { changed: false, transientChanged: false };
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    const message = createMessage('@ViewerThree', 'hello alpha');
    document.body.append(message);

    handlePotentialInbox(message);
    await Promise.resolve();

    expect(cardMocks.refreshOpenInboxCard).not.toHaveBeenCalled();
    expect(stateMocks.saveInboxRecords).not.toHaveBeenCalled();
    expect(soundMocks.playAlertSound).not.toHaveBeenCalled();
  });

  it('loads state before handling pending messages and keyword highlighting', async () => {
    inboxTestState.loaded = false;
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    const message = createMessage('@ViewerFour', 'hello alpha');
    document.body.append(message);

    handlePotentialInbox(message);
    highlightPotentialInboxKeywords(message);
    await Promise.resolve();

    expect(stateMocks.loadInboxState).toHaveBeenCalled();
    expect(highlightMocks.applyChatKeywordHighlights).toHaveBeenCalledWith(message, ['alpha'], '@ViewerFour|hello alpha');
  });

  it('caps pending inbox messages while state is loading', async () => {
    inboxTestState.loaded = false;
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    stateMocks.loadInboxState.mockImplementation(() => Promise.resolve().then(() => {
      inboxTestState.loaded = true;
    }));
    for (let index = 0; index < 65; index += 1) {
      const message = createMessage(`@Viewer${index}`, `hello alpha ${index}`);
      document.body.append(message);
      handlePotentialInbox(message);
    }

    await Promise.resolve();
    await Promise.resolve();

    expect(mentionMocks.processPotentialMentionForConsumer).toHaveBeenCalledTimes(60);
    const processedMessages = mentionMocks.processPotentialMentionForConsumer.mock.calls
      .map(([message]) => (message as HTMLElement).textContent || '');
    expect(processedMessages.some((text) => text.includes('hello alpha 0'))).toBe(false);
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
    message.dataset.ytcqInboxKeywordChecked = 'true';
    message.dataset.ytcqInboxKeywordHighlightKey = 'alpha';
    document.body.append(message);

    cleanupStaleInboxSurfaces();

    expect(buttonMocks.cleanupStaleInboxButtons).toHaveBeenCalled();
    expect(cardMocks.cleanupStaleInboxCards).toHaveBeenCalled();
    expect(tabAlertMocks.clearInboxTabAlert).toHaveBeenCalled();
    expect(tabAlertMocks.cleanupInboxTabAlertListeners).toHaveBeenCalled();
    expect(highlightMocks.clearChatKeywordHighlights).toHaveBeenCalledWith(message);
    expect(message.dataset.ytcqInboxKeywordChecked).toBeUndefined();
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
