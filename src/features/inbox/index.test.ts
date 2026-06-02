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
  addInboxKeywordsToState: vi.fn((values: string[]) => ({ added: values, duplicates: [] })),
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
  removeInboxKeywordsFromState: vi.fn((values: string[]) => ({ missing: [], removed: values })),
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

  it('does not keyword-highlight current-user messages', () => {
    inboxTestState.keywords = ['alpha'];
    inboxTestState.matchingKeywords = ['alpha'];
    const message = createMessage('@CurrentUser', 'hello alpha');
    document.body.append(message);

    highlightPotentialInboxKeywords(message);

    expect(highlightMocks.applyChatKeywordHighlights).toHaveBeenCalledWith(message, [], '');
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

  it('updates keyword storage and visible highlights through public keyword helpers', async () => {
    await expect(addInboxKeywords(['alpha'])).resolves.toEqual({ added: ['alpha'], duplicates: [] });
    await expect(removeInboxKeywords(['alpha'])).resolves.toEqual({ missing: [], removed: ['alpha'] });

    expect(stateMocks.saveInboxKeywords).toHaveBeenCalledTimes(2);
    expect(cardMocks.refreshOpenInboxCard).toHaveBeenCalledTimes(2);
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
    expect(buttonMocks.cleanupStaleInboxButtons).toHaveBeenCalled();
    expect(cardMocks.cleanupStaleInboxCards).toHaveBeenCalled();
  });
});

function createMessage(authorName: string, text: string): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer') as HTMLElement & {
    data?: unknown;
  };
  message.data = {
    authorName: { simpleText: authorName },
    id: `${authorName}-${text}`,
    message: { runs: [{ text }] }
  };
  message.innerHTML = `
    <span id="author-name">${authorName}</span>
    <span id="message">${text}</span>
  `;
  return message;
}
