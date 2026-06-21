import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyChatKeywordHighlights,
  clearChatKeywordHighlights,
  highlightInboxAuthorMatches,
  highlightInboxMatches
} from './highlights';
import type { InboxRecord } from './types';

describe('inbox highlight helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('highlights mention handles and keyword matches in inbox rows', () => {
    const root = document.createElement('span');
    root.textContent = '@CurrentViewer launch soon';

    highlightInboxMatches(root, record({
      matchedKeywords: ['launch'],
      mentionHandles: ['@CurrentViewer']
    }));

    expect(root.querySelector('.ytcq-inbox-mention-highlight')?.textContent).toBe('@CurrentViewer');
    expect(root.querySelector('.ytcq-inbox-keyword-highlight')?.textContent).toBe('launch');
  });

  it('prioritizes mention highlights over overlapping keyword highlights', () => {
    const root = document.createElement('span');
    root.textContent = '@CurrentViewer';

    highlightInboxMatches(root, record({
      matchedKeywords: ['currentviewer'],
      mentionHandles: ['@CurrentViewer']
    }));

    expect(root.querySelector('.ytcq-inbox-mention-highlight')?.textContent).toBe('@CurrentViewer');
    expect(root.querySelector('.ytcq-inbox-keyword-highlight')).toBeNull();
  });

  it('highlights matching keywords in live chat author names and message text', async () => {
    vi.useFakeTimers();
    const message = createMessage('@LaunchHost', 'ready for launch');

    applyChatKeywordHighlights(message, ['launch'], 'keyword-key');

    expect(message.querySelector('#author-name .ytcq-chat-keyword-highlight')?.textContent).toBe('Launch');
    expect(message.querySelector('#message .ytcq-chat-keyword-highlight')?.textContent).toBe('launch');
    expect(message.dataset.ytcqInboxKeywordHighlightKey).toBe('keyword-key');
    await vi.runAllTimersAsync();
    expect(message.dataset.ytcqInboxKeywordHighlighting).toBeUndefined();
  });

  it('ignores live chat renderers without author or message text', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');

    applyChatKeywordHighlights(message, ['launch'], 'keyword-key');

    expect(message.dataset.ytcqInboxKeywordHighlightKey).toBeUndefined();
  });

  it('skips work when the same highlight key is already current', () => {
    const message = createMessage('@LaunchHost', 'ready for launch');
    applyChatKeywordHighlights(message, ['launch'], 'keyword-key');
    const existingHighlight = message.querySelector('.ytcq-chat-keyword-highlight');

    applyChatKeywordHighlights(message, ['launch'], 'keyword-key');

    expect(message.querySelector('.ytcq-chat-keyword-highlight')).toBe(existingHighlight);
  });

  it('reapplies highlights when the key is current but YouTube replaced the highlighted nodes', () => {
    const message = createMessage('@LaunchHost', 'ready for launch');
    message.dataset.ytcqInboxKeywordHighlightKey = 'keyword-key';

    applyChatKeywordHighlights(message, ['launch'], 'keyword-key');

    expect(message.querySelector('#author-name .ytcq-chat-keyword-highlight')?.textContent).toBe('Launch');
    expect(message.querySelector('#message .ytcq-chat-keyword-highlight')?.textContent).toBe('launch');
  });

  it('skips empty matching work when the same key has no visible highlights', () => {
    const message = createMessage('@LaunchHost', 'ready for launch');
    message.dataset.ytcqInboxKeywordHighlightKey = 'empty-key';

    applyChatKeywordHighlights(message, [], 'empty-key');

    expect(message.querySelector('.ytcq-chat-keyword-highlight')).toBeNull();
    expect(message.dataset.ytcqInboxKeywordHighlightKey).toBe('empty-key');
  });

  it('supports keyword highlighting when only one live chat text target exists', () => {
    const textOnly = document.createElement('yt-live-chat-text-message-renderer');
    textOnly.innerHTML = '<span id="message">launch window</span>';
    const authorOnly = document.createElement('yt-live-chat-text-message-renderer');
    authorOnly.innerHTML = '<span id="author-name">@LaunchHost</span>';

    applyChatKeywordHighlights(textOnly, ['launch'], 'text-key');
    applyChatKeywordHighlights(authorOnly, ['launch'], 'author-key');

    expect(textOnly.querySelector('#message .ytcq-chat-keyword-highlight')?.textContent).toBe('launch');
    expect(authorOnly.querySelector('#author-name .ytcq-chat-keyword-highlight')?.textContent).toBe('Launch');
  });

  it('clears previous chat keyword highlights before applying new state', () => {
    const message = createMessage('@LaunchHost', 'ready for launch');
    applyChatKeywordHighlights(message, ['launch'], 'keyword-key');

    applyChatKeywordHighlights(message, [], 'empty-key');

    expect(message.querySelector('.ytcq-chat-keyword-highlight')).toBeNull();
    expect(message.querySelector('#message')?.textContent).toBe('ready for launch');
    expect(message.dataset.ytcqInboxKeywordHighlightKey).toBe('');
  });

  it('can clear chat keyword highlights explicitly', () => {
    const message = createMessage('@LaunchHost', 'ready for launch');
    applyChatKeywordHighlights(message, ['launch'], 'keyword-key');

    clearChatKeywordHighlights(message);

    expect(message.querySelector('.ytcq-chat-keyword-highlight')).toBeNull();
    expect(message.querySelector('#author-name')?.textContent).toBe('@LaunchHost');
    expect(message.querySelector('#message')?.textContent).toBe('ready for launch');
  });

  it('can highlight only author matches in inbox metadata', () => {
    const root = document.createElement('span');
    root.textContent = '@LaunchHost';

    highlightInboxAuthorMatches(root, record({ matchedKeywords: ['launch'] }));

    expect(root.querySelector('.ytcq-inbox-keyword-highlight')?.textContent).toBe('Launch');
  });

  it('prefers the longest matching keyword when matches start at the same position', () => {
    const root = document.createElement('span');
    root.textContent = 'caterpillar launch';

    highlightInboxAuthorMatches(root, record({ matchedKeywords: ['cat', 'caterpillar'] }));

    expect(root.querySelector('.ytcq-inbox-keyword-highlight')?.textContent).toBe('caterpillar');
  });

  it('ignores empty keyword terms while highlighting inbox metadata', () => {
    const root = document.createElement('span');
    root.textContent = '@LaunchHost';

    highlightInboxAuthorMatches(root, record({ matchedKeywords: ['  '] }));

    expect(root.querySelector('.ytcq-inbox-keyword-highlight')).toBeNull();
    expect(root.textContent).toBe('@LaunchHost');
  });
});

function createMessage(authorName: string, text: string): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer');
  message.innerHTML = `
    <span id="author-name">${authorName}</span>
    <span id="message">${text}</span>
  `;
  return message;
}

function record(overrides: Partial<InboxRecord> = {}): InboxRecord {
  return {
    id: 'record',
    authorName: '@ExampleUser',
    contentParts: [],
    matchedKeywords: [],
    mention: false,
    mentionHandles: [],
    read: false,
    sourceUrl: 'https://www.youtube.com/watch?v=stream',
    text: 'hello',
    timestamp: 1_000,
    timestampText: '10:00 PM',
    ...overrides
  };
}
