import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const inputMocks = vi.hoisted(() => ({
  insertMentionText: vi.fn(),
  replaceInputWithQuoteNodes: vi.fn(),
  replaceInputWithQuoteText: vi.fn()
}));

const focusMocks = vi.hoisted(() => ({
  showFocusPromptForAuthor: vi.fn(),
  showFocusPromptForMessage: vi.fn()
}));

const toastMocks = vi.hoisted(() => ({
  clearToast: vi.fn(),
  showToast: vi.fn()
}));

vi.mock('./input', () => inputMocks);
vi.mock('../focus-mode', () => focusMocks);
vi.mock('../../shared/toast', () => toastMocks);

import {
  cleanupStaleReplyWiring,
  mentionAuthorName,
  quoteAuthorRichText,
  quoteAuthorText,
  replyToMessage,
  wireAuthorNameMention
} from './index';

describe('reply feature entry points', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupStaleReplyWiring();
  });

  it('wires author clicks to mention and alt-click to quote', () => {
    const message = createMessage('@ViewerOne', 'quoted message');
    document.body.append(message);

    wireAuthorNameMention(message);
    const author = message.querySelector<HTMLElement>('#author-name')!;
    author.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      button: 0
    }));
    author.dispatchEvent(new MouseEvent('click', {
      altKey: true,
      bubbles: true,
      button: 0
    }));

    expect(author.title).toBe('Mention user. Alt/Option-click to quote.');
    expect(inputMocks.insertMentionText).toHaveBeenCalledWith('@ViewerOne ');
    expect(inputMocks.replaceInputWithQuoteNodes).toHaveBeenCalledOnce();
    expect(focusMocks.showFocusPromptForMessage).toHaveBeenCalledTimes(2);
  });

  it('cleans author click wiring markers', () => {
    const message = createMessage('@ViewerOne', 'hello');
    document.body.append(message);
    wireAuthorNameMention(message);

    cleanupStaleReplyWiring();

    expect(message.hasAttribute('data-ytcq-author-mention-wired')).toBe(false);
  });

  it('mentions valid authors and reports unreadable names', () => {
    mentionAuthorName('@ViewerTwo');
    mentionAuthorName('');

    expect(focusMocks.showFocusPromptForAuthor).toHaveBeenCalledWith({ authorName: '@ViewerTwo' });
    expect(inputMocks.insertMentionText).toHaveBeenCalledWith('@ViewerTwo ');
    expect(toastMocks.showToast).toHaveBeenCalledWith('Could not read that user name.');
  });

  it('quotes plain text and falls back to a mention prefix for empty text', () => {
    quoteAuthorText('@ViewerThree', 'hello there');
    quoteAuthorRichText('@ViewerFour', '', {});

    expect(inputMocks.replaceInputWithQuoteText).toHaveBeenNthCalledWith(1, '@ViewerThree : "hello there" ');
    expect(inputMocks.replaceInputWithQuoteText).toHaveBeenNthCalledWith(2, '@ViewerFour ');
  });

  it('quotes rich message nodes with a plain-text fallback and trailing space', () => {
    const emoji = document.createElement('img');
    emoji.src = 'https://example.com/emoji.png';
    emoji.alt = ':smile:';
    emoji.setAttribute('data-emoji-id', 'smile-id');

    quoteAuthorRichText('@ViewerFive', 'hello :smile:', {
      nodes: [
        document.createTextNode('hello '),
        emoji
      ]
    });

    const [nodes, fallbackText, trailingText] = inputMocks.replaceInputWithQuoteNodes.mock.calls[0];
    expect(fallbackText).toBe('@ViewerFive : "hello :smile:" ');
    expect(trailingText).toBe(' ');
    expect((nodes as Node[])[0].textContent).toBe('@ViewerFive : "');
    expect((nodes as Node[]).at(-1)?.textContent).toBe('"');
  });

  it('uses message details to choose quote or mention behavior', () => {
    const message = createMessage('@ViewerSix', 'message details');

    replyToMessage(message, { quote: false });
    replyToMessage(message, { quote: true });

    expect(inputMocks.insertMentionText).toHaveBeenCalledWith('@ViewerSix ');
    expect(inputMocks.replaceInputWithQuoteNodes).toHaveBeenCalledOnce();
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
