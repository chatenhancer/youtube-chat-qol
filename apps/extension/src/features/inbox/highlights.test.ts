import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyChatKeywordHighlights,
  clearChatKeywordHighlights,
  highlightInboxAuthorMatches,
  highlightInboxMatches
} from './highlights';
import { isExtensionManagedElement } from '../../shared/managed-dom';
import { PRESERVED_MENTION_TOKEN_CLASS } from '../../shared/mention-tokens';
import { decorateProfileMentions } from '../profile-popup/mentions';
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

  it('keeps Inbox keyword highlights aligned after a clickable profile mention', () => {
    const root = document.createElement('span');
    const text = '@SampleViewer anything to be made at home';
    root.textContent = text;
    decorateProfileMentions(root, (identity) => identity);
    const mention = root.querySelector('.ytcq-profile-mention');

    highlightInboxMatches(root, record({ matchedKeywords: ['a'] }));

    expect(Array.from(root.querySelectorAll('.ytcq-inbox-keyword-highlight'), (node) => node.textContent))
      .toEqual(['a', 'a', 'a', 'a']);
    expect(root.textContent).toBe(text);
    expect(root.querySelector('.ytcq-profile-mention')).toBe(mention);
    expect(mention?.textContent).toBe('@SampleViewer');
  });

  it.each([
    ['  a  a\t a  ', 'a', ['a', 'a', 'a']],
    ['ready\t  for launch next', 'for launch', ['for launch']],
    ['ready for\t  launch next', 'for launch', ['for\t  launch']],
    ['\u200Bready a\u2060lpha\uFEFF next', 'alpha', ['a\u2060lpha']],
    ['\uFB03rst a', 'a', ['a']],
    ['Before… a calm day', 'a', ['a', 'a', 'a']],
    ['\uFB03rst next', 'ffi', ['\uFB03']],
    ['\uFB03rst next', 'f', ['\uFB03']],
    ['office next', 'o\uFB03ce', ['office']],
    ['Ｆｕｌｌ × Х х', 'full x', ['Ｆｕｌｌ ×']],
    ['cafe\u0301 next', 'café', ['cafe\u0301']],
    ['cafe\u200B\u0301 next', 'café', ['cafe\u200B\u0301']],
    ['ΟΣ next', 'ος', ['ΟΣ']],
    ['\u0130 a 🚀 A', 'a', ['a', 'A']],
    ['\u1100\u1161 a', '가', ['\u1100\u1161']]
  ])('highlights original text in %j using the normalized keyword %j', (text, keyword, expected) => {
    const root = document.createElement('span');
    root.textContent = text;

    highlightInboxMatches(root, record({ matchedKeywords: [keyword] }));

    expect(Array.from(root.querySelectorAll('.ytcq-inbox-keyword-highlight'), (node) => node.textContent))
      .toEqual(expected);
    expect(root.textContent).toBe(text);
  });

  it('keeps live keyword highlights aligned after a decorated mention and when reapplied', () => {
    const text = '@SampleViewer anything to be made at home';
    const message = createMessage('@Host', text);
    const messageText = message.querySelector<HTMLElement>('#message')!;
    decorateProfileMentions(messageText, (identity) => identity);
    const mention = messageText.querySelector('.ytcq-profile-mention');

    applyChatKeywordHighlights(message, ['a'], 'first-key');
    applyChatKeywordHighlights(message, ['a'], 'second-key');

    expect(Array.from(messageText.querySelectorAll('.ytcq-chat-keyword-highlight'), (node) => node.textContent))
      .toEqual(['a', 'a', 'a', 'a']);
    expect(messageText.textContent).toBe(text);
    expect(messageText.querySelector('.ytcq-profile-mention')).toBe(mention);

    clearChatKeywordHighlights(message);
    expect(messageText.textContent).toBe(text);
    expect(messageText.querySelector('.ytcq-chat-keyword-highlight')).toBeNull();
    expect(messageText.querySelector('.ytcq-profile-mention')).toBe(mention);
  });

  it('highlights matching keywords in live chat author names and message text', async () => {
    vi.useFakeTimers();
    const message = createMessage('@LaunchHost', 'ready for launch');

    applyChatKeywordHighlights(message, ['launch'], 'keyword-key');

    expect(message.querySelector('#author-name .ytcq-chat-keyword-highlight')?.textContent).toBe('Launch');
    expect(message.querySelector('#message .ytcq-chat-keyword-highlight')?.textContent).toBe('launch');
    message.querySelectorAll('.ytcq-chat-keyword-highlight').forEach((highlight) => {
      expect(isExtensionManagedElement(highlight)).toBe(true);
    });
    expect(message.dataset.ytcqInboxKeywordHighlightKey).toBe('keyword-key');
    await vi.runAllTimersAsync();
    expect(message.dataset.ytcqInboxKeywordHighlighting).toBeUndefined();
  });

  it('preserves a whole profile mention when a live keyword matches part of its handle', () => {
    const message = createMessage('@Host', 'Please ask @MentionedProfileViewer next');

    applyChatKeywordHighlights(message, ['profile'], 'mention-key');

    const messageText = message.querySelector<HTMLElement>('#message')!;
    const highlight = messageText.querySelector<HTMLElement>('.ytcq-chat-keyword-highlight');
    const preservedToken = messageText.querySelector<HTMLElement>(
      `.${PRESERVED_MENTION_TOKEN_CLASS}`
    );
    expect(highlight?.textContent).toBe('Profile');
    expect(preservedToken?.textContent).toBe('@MentionedProfileViewer');

    decorateProfileMentions(messageText, (identity) => identity);

    const mention = messageText.querySelector<HTMLElement>('.ytcq-profile-mention');
    expect(mention).toBe(preservedToken);
    expect(mention?.textContent).toBe('@MentionedProfileViewer');
    expect(mention?.getAttribute('role')).toBe('button');
    expect(mention?.querySelector('.ytcq-chat-keyword-highlight')?.textContent).toBe('Profile');
    expect(messageText.textContent).toBe('Please ask @MentionedProfileViewer next');

    clearChatKeywordHighlights(message);

    expect(mention?.classList.contains(PRESERVED_MENTION_TOKEN_CLASS)).toBe(false);
    expect(messageText.querySelector('.ytcq-chat-keyword-highlight')).toBeNull();
    expect(messageText.querySelector('.ytcq-profile-mention')).toBe(mention);
  });

  it('does not expand live keyword highlights across email addresses', () => {
    const message = createMessage('@Host', 'Email person@example.com for details');

    applyChatKeywordHighlights(message, ['example'], 'email-key');

    expect(message.querySelector('#message .ytcq-chat-keyword-highlight')?.textContent)
      .toBe('example');
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
