import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboxRecord } from './types';

let records: InboxRecord[] = [];
let keywords: string[] = [];
let unreadCount = 0;
let liveMessage: HTMLElement | null = null;

const stateMocks = vi.hoisted(() => ({
  getInboxKeywordsSnapshot: vi.fn(() => keywords),
  getInboxRecordsSnapshot: vi.fn(() => records),
  getLiveInboxMessage: vi.fn(() => liveMessage),
  getUnreadInboxCount: vi.fn(() => unreadCount)
}));

const keywordPanelMocks = vi.hoisted(() => ({
  createKeywordPanel: vi.fn(() => {
    const panel = document.createElement('div');
    panel.className = 'ytcq-inbox-keyword-panel';
    panel.hidden = true;
    const input = document.createElement('input');
    input.className = 'ytcq-inbox-keyword-input';
    panel.append(input);
    return panel;
  }),
  createKeywordToggleButton: vi.fn(() => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ytcq-inbox-keyword-toggle';
    button.setAttribute('aria-expanded', 'false');
    return button;
  }),
  refreshKeywordToggle: vi.fn()
}));

const replyMocks = vi.hoisted(() => ({
  mentionAuthorName: vi.fn(),
  quoteAuthorRichText: vi.fn()
}));

const jumpMocks = vi.hoisted(() => ({
  createJumpToMessageIcon: vi.fn(() => document.createElement('svg')),
  jumpToChatMessage: vi.fn()
}));

vi.mock('./state', () => stateMocks);
vi.mock('./keyword-panel', () => keywordPanelMocks);
vi.mock('../reply', () => replyMocks);
vi.mock('../message-jump', () => jumpMocks);

import {
  cleanupStaleInboxCards,
  closeInboxCard,
  isInboxCardOpen,
  openInboxCardView,
  refreshOpenInboxCard
} from './card';

describe('inbox card view', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    records = [];
    keywords = [];
    unreadCount = 0;
    liveMessage = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupStaleInboxCards();
    vi.useRealTimers();
  });

  it('opens an empty inbox card with keyword controls and marks records read', () => {
    const callbacks = callbacksForCard();

    openInboxCardView(undefined, callbacks);
    const card = document.querySelector<HTMLElement>('.ytcq-inbox-card')!;

    expect(isInboxCardOpen()).toBe(true);
    expect(card.getAttribute('aria-label')).toBe('Inbox');
    expect(card.querySelector('.ytcq-profile-card-title')?.textContent).toBe('Inbox');
    expect(card.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('Watching mentions');
    expect(card.querySelector('.ytcq-inbox-empty')?.textContent).toBe('No inbox messages');
    expect(card.querySelector<HTMLButtonElement>('.ytcq-inbox-clear')?.disabled).toBe(true);
    expect(callbacks.onMarkRead).toHaveBeenCalledOnce();

    card.querySelector<HTMLButtonElement>('.ytcq-inbox-keyword-toggle')!.click();
    expect(card.querySelector<HTMLElement>('.ytcq-inbox-keyword-panel')?.hidden).toBe(false);
  });

  it('renders records, quotes rows, mentions authors, and clears records', () => {
    records = [record({
      authorName: '@ViewerOne',
      text: 'hello inbox'
    })];
    unreadCount = 1;
    const callbacks = callbacksForCard();

    openInboxCardView(undefined, callbacks);
    const card = document.querySelector<HTMLElement>('.ytcq-inbox-card')!;
    const row = card.querySelector<HTMLElement>('.ytcq-inbox-message')!;

    expect(card.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('1 new message');
    expect(row.querySelector('time')?.textContent).toBe('9:30 PM');
    expect(row.querySelector('.ytcq-inbox-message-body')?.textContent).toContain('@ViewerOne hello inbox');

    row.click();
    expect(replyMocks.quoteAuthorRichText).toHaveBeenCalledWith('@ViewerOne', 'hello inbox', {
      segments: []
    });
    expect(isInboxCardOpen()).toBe(false);

    openInboxCardView(undefined, callbacks);
    document.querySelector<HTMLButtonElement>('.ytcq-inbox-author')!.click();
    expect(replyMocks.mentionAuthorName).toHaveBeenCalledWith('@ViewerOne');
    expect(isInboxCardOpen()).toBe(false);

    openInboxCardView(undefined, callbacks);
    document.querySelector<HTMLButtonElement>('.ytcq-inbox-clear')!.click();
    expect(callbacks.onClearRecords).toHaveBeenCalledOnce();
  });

  it('refreshes the open card and jumps to connected live messages', () => {
    const target = document.createElement('yt-live-chat-text-message-renderer');
    document.body.append(target);
    liveMessage = target;
    records = [record({ id: 'record-1', read: true })];
    openInboxCardView(undefined, callbacksForCard());

    records = [
      record({ id: 'record-1', read: true }),
      record({ id: 'record-2', text: 'second saved message' })
    ];
    unreadCount = 0;
    refreshOpenInboxCard();

    const card = document.querySelector<HTMLElement>('.ytcq-inbox-card')!;
    expect(card.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('2 saved messages');
    expect(card.querySelectorAll('.ytcq-inbox-message')).toHaveLength(2);

    card.querySelector<HTMLButtonElement>('.ytcq-profile-card-jump')!.click();
    expect(jumpMocks.jumpToChatMessage).toHaveBeenCalledWith(target);
    expect(isInboxCardOpen()).toBe(false);
  });

  it('closes and cleans stale cards', () => {
    openInboxCardView(undefined, callbacksForCard());
    closeInboxCard();
    expect(document.querySelector('.ytcq-inbox-card')).toBeNull();

    document.body.append(Object.assign(document.createElement('section'), {
      className: 'ytcq-inbox-card'
    }));
    cleanupStaleInboxCards();
    expect(document.querySelector('.ytcq-inbox-card')).toBeNull();
  });
});

function callbacksForCard() {
  return {
    onClearRecords: vi.fn(),
    onKeywordsChanged: vi.fn(),
    onMarkRead: vi.fn()
  };
}

function record(overrides: Partial<InboxRecord> = {}): InboxRecord {
  return {
    authorName: '@ViewerOne',
    contentParts: [],
    id: 'record-1',
    matchedKeywords: [],
    mention: true,
    mentionHandles: ['@CurrentUser'],
    read: false,
    sourceUrl: 'https://www.youtube.com/watch?v=video',
    text: 'hello inbox',
    timestamp: new Date('2026-05-31T21:30:00Z').getTime(),
    timestampText: '9:30 PM',
    ...overrides
  };
}
