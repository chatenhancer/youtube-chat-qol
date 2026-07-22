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
  canJumpToChatMessage: vi.fn(),
  createJumpToMessageIcon: vi.fn(() => document.createElement('svg')),
  jumpToChatMessage: vi.fn()
}));

const bookmarkMocks = vi.hoisted(() => ({
  createBookmarkToggleButton: vi.fn(() => {
    const button = document.createElement('button');
    button.className = 'ytcq-bookmark-toggle';
    return button;
  })
}));

const avatarRingMocks = vi.hoisted(() => ({
  applyAvatarRing: vi.fn()
}));

const channelPopupMocks = vi.hoisted(() => ({
  getChannelUrl: vi.fn((channelId: string | undefined, authorName: string) => {
    if (channelId) return `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`;
    if (authorName.startsWith('@')) return `https://www.youtube.com/${authorName}`;
    return '';
  }),
  openChannelWindow: vi.fn()
}));

const userHistoryMocks = vi.hoisted(() => ({
  getUserMessagesForIdentity: vi.fn()
}));

vi.mock('./state', () => stateMocks);
vi.mock('./keyword-panel', () => keywordPanelMocks);
vi.mock('../reply', () => replyMocks);
vi.mock('../message-jump', () => jumpMocks);
vi.mock('../avatar-rings', () => avatarRingMocks);
vi.mock('../bookmarks', () => bookmarkMocks);
vi.mock('../channel-popup', () => channelPopupMocks);
vi.mock('../user-message-history', () => userHistoryMocks);

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
    jumpMocks.canJumpToChatMessage.mockImplementation(
      (target: HTMLElement | null) => Boolean(target?.isConnected)
    );
    userHistoryMocks.getUserMessagesForIdentity.mockImplementation(
      (identity: { authorName?: string }) =>
        identity.authorName?.toLowerCase() === '@knownviewer'
          ? [
              {
                authorName: '@KnownViewer',
                channelId: 'known-channel',
                contentParts: [],
                id: 1,
                text: 'known history',
                timestamp: 1,
                timestampText: '9:30 PM'
              }
            ]
          : []
    );
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
    expect(card.querySelector<HTMLButtonElement>('.ytcq-inbox-keyword-toggle')?.getAttribute('aria-expanded')).toBe('true');

    card.querySelector<HTMLButtonElement>('.ytcq-inbox-keyword-toggle')!.click();
    expect(card.querySelector<HTMLElement>('.ytcq-inbox-keyword-panel')?.hidden).toBe(true);
    expect(card.querySelector<HTMLButtonElement>('.ytcq-inbox-keyword-toggle')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('uses the keyword subtitle when only keyword watches are configured', () => {
    keywords = ['alpha'];

    openInboxCardView(undefined, callbacksForCard());

    expect(document.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('Watching mentions and keywords');
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
    expect(row.querySelector<HTMLElement>('.ytcq-inbox-author')?.dir).toBe('auto');
    expect(row.querySelector('.ytcq-inbox-message-body')?.textContent).toContain('@ViewerOne hello inbox');
    expect(row.querySelector('.ytcq-profile-card-message-actions .ytcq-bookmark-toggle')).not.toBeNull();
    expect(bookmarkMocks.createBookmarkToggleButton).toHaveBeenCalledWith(records[0]);

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

  it('only decorates resolvable mentions inside Inbox message text', () => {
    records = [record({ text: 'Ask @knownviewer, not @MissingViewer' })];

    openInboxCardView(undefined, callbacksForCard());

    const mentions = document.querySelectorAll<HTMLElement>('.ytcq-profile-mention');
    expect(mentions).toHaveLength(1);
    expect(mentions[0]?.textContent).toBe('@knownviewer');
    expect(mentions[0]?.dataset.ytcqProfileMention).toBe('@KnownViewer');
    expect(document.querySelector('.ytcq-inbox-message-body')?.textContent).toContain(
      '@MissingViewer'
    );
  });

  it('renders stored avatars for inbox rows and applies selected-user ring state', () => {
    records = [record({
      authorName: '@ViewerOne',
      avatarSrc: 'https://example.com/avatar.jpg',
      channelId: 'viewer-channel'
    })];

    openInboxCardView(undefined, callbacksForCard());

    const avatar = document.querySelector<HTMLElement>('.ytcq-inbox-avatar')!;
    expect(avatar.querySelector('img')?.src).toBe('https://example.com/avatar.jpg');
    expect(avatarRingMocks.applyAvatarRing).toHaveBeenCalledWith(avatar, records[0]);
  });

  it('opens the channel popup from stored inbox avatars without quoting the row', () => {
    records = [record({
      authorName: '@ViewerOne',
      avatarSrc: 'https://example.com/avatar.jpg',
      channelId: 'viewer-channel'
    })];

    openInboxCardView(undefined, callbacksForCard());

    const avatar = document.querySelector<HTMLButtonElement>('.ytcq-inbox-avatar')!;
    avatar.click();

    expect(avatar.querySelector('.ytcq-inbox-avatar-open-icon')).not.toBeNull();
    expect(channelPopupMocks.openChannelWindow).toHaveBeenCalledWith(
      'https://www.youtube.com/channel/viewer-channel'
    );
    expect(replyMocks.quoteAuthorRichText).not.toHaveBeenCalled();
    expect(isInboxCardOpen()).toBe(true);
  });

  it('quotes inbox rows from keyboard activation and ignores button targets', () => {
    records = [record({
      authorName: '@ViewerOne',
      text: 'keyboard quote'
    })];

    openInboxCardView(undefined, callbacksForCard());
    const row = document.querySelector<HTMLElement>('.ytcq-inbox-message')!;
    const author = row.querySelector<HTMLButtonElement>('.ytcq-inbox-author')!;
    author.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    expect(replyMocks.quoteAuthorRichText).not.toHaveBeenCalled();

    row.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    expect(replyMocks.quoteAuthorRichText).toHaveBeenCalledWith('@ViewerOne', 'keyboard quote', {
      segments: []
    });

    openInboxCardView(undefined, callbacksForCard());
    document.querySelector<HTMLElement>('.ytcq-inbox-message')!
      .dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
    expect(replyMocks.quoteAuthorRichText).toHaveBeenCalledTimes(2);

    openInboxCardView(undefined, callbacksForCard());
    document.querySelector<HTMLElement>('.ytcq-inbox-message')!
      .dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    expect(replyMocks.quoteAuthorRichText).toHaveBeenCalledTimes(2);
  });

  it('refreshes the open card and jumps to connected live messages', () => {
    const target = document.createElement('yt-live-chat-text-message-renderer');
    document.body.append(target);
    liveMessage = target;
    records = [record({ id: 'record-1', messageId: 'message-1', read: true })];
    openInboxCardView(undefined, callbacksForCard());

    records = [
      record({ id: 'record-1', messageId: 'message-1', read: true }),
      record({ id: 'record-2', messageId: 'message-1', text: 'second saved message' })
    ];
    unreadCount = 0;
    refreshOpenInboxCard();

    const card = document.querySelector<HTMLElement>('.ytcq-inbox-card')!;
    expect(card.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('2 saved messages');
    expect(card.querySelectorAll('.ytcq-inbox-message')).toHaveLength(2);

    card.querySelector<HTMLButtonElement>('.ytcq-profile-card-jump')!.click();
    expect(jumpMocks.jumpToChatMessage).toHaveBeenCalledWith(target, 'message-1');
    expect(isInboxCardOpen()).toBe(false);
  });

  it('jumps to retained Lite messages without a mounted row', () => {
    records = [record({ messageId: 'message-1' })];
    liveMessage = null;
    jumpMocks.canJumpToChatMessage.mockReturnValue(true);

    openInboxCardView(undefined, callbacksForCard());
    document.querySelector<HTMLButtonElement>('.ytcq-profile-card-jump')!.click();

    expect(jumpMocks.jumpToChatMessage).toHaveBeenCalledWith(null, 'message-1');
    expect(isInboxCardOpen()).toBe(false);
  });

  it('does not render a jump button when the live message is unavailable', () => {
    records = [record()];
    liveMessage = null;

    openInboxCardView(undefined, callbacksForCard());

    expect(document.querySelector('.ytcq-profile-card-jump')).toBeNull();
  });

  it('closes from outside click and Escape while ignoring the inbox header button', async () => {
    vi.useFakeTimers();
    openInboxCardView(undefined, callbacksForCard());
    await vi.runOnlyPendingTimersAsync();

    const inboxButton = document.createElement('button');
    inboxButton.className = 'ytcq-inbox-button';
    document.body.append(inboxButton);
    inboxButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(isInboxCardOpen()).toBe(true);

    document.querySelector<HTMLElement>('.ytcq-inbox-card')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(isInboxCardOpen()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));
    expect(isInboxCardOpen()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    expect(isInboxCardOpen()).toBe(false);

    openInboxCardView(undefined, callbacksForCard());
    await vi.runOnlyPendingTimersAsync();
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(isInboxCardOpen()).toBe(false);
  });

  it('repositions on resize using the provided anchor when connected', async () => {
    vi.useFakeTimers();
    const anchor = document.createElement('button');
    anchor.getBoundingClientRect = () => ({
      bottom: 44,
      height: 24,
      left: 180,
      right: 220,
      top: 20,
      width: 40,
      x: 180,
      y: 20,
      toJSON: () => ({})
    });
    document.body.append(anchor);

    openInboxCardView(anchor, callbacksForCard());
    const card = document.querySelector<HTMLElement>('.ytcq-inbox-card')!;
    card.getBoundingClientRect = () => ({
      bottom: 240,
      height: 120,
      left: 0,
      right: 160,
      top: 120,
      width: 160,
      x: 0,
      y: 120,
      toJSON: () => ({})
    });
    await vi.runOnlyPendingTimersAsync();
    window.dispatchEvent(new Event('resize'));

    expect(card.style.left).toBe('60px');
    expect(card.style.top).toBe('52px');
  });

  it('clamps the card inside the viewport when positioning would overflow', async () => {
    vi.useFakeTimers();
    const anchor = document.createElement('button');
    anchor.getBoundingClientRect = () => ({
      bottom: 890,
      height: 24,
      left: 2,
      right: 12,
      top: 866,
      width: 10,
      x: 2,
      y: 866,
      toJSON: () => ({})
    });
    document.body.append(anchor);

    openInboxCardView(anchor, callbacksForCard());
    const card = document.querySelector<HTMLElement>('.ytcq-inbox-card')!;
    card.getBoundingClientRect = () => ({
      bottom: 1_080,
      height: 180,
      left: 0,
      right: 420,
      top: 900,
      width: 420,
      x: 0,
      y: 900,
      toJSON: () => ({})
    });
    await vi.runOnlyPendingTimersAsync();
    window.dispatchEvent(new Event('resize'));

    expect(Number.parseInt(card.style.left, 10)).toBeGreaterThanOrEqual(8);
    expect(Number.parseInt(card.style.top, 10)).toBeLessThan(866);
  });

  it('refreshes safely when an open card is missing optional sub-elements', () => {
    records = [record()];
    openInboxCardView(undefined, callbacksForCard());
    document.querySelector('.ytcq-inbox-messages')?.remove();
    document.querySelector('.ytcq-profile-card-subtitle')?.remove();
    document.querySelector('.ytcq-inbox-clear')?.remove();
    document.querySelector('.ytcq-inbox-card-icon')?.remove();
    document.querySelector('.ytcq-inbox-keyword-toggle')?.remove();

    expect(() => refreshOpenInboxCard()).not.toThrow();
  });

  it('ignores refresh requests when the inbox card is closed', () => {
    refreshOpenInboxCard();

    expect(keywordPanelMocks.refreshKeywordToggle).not.toHaveBeenCalled();
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
