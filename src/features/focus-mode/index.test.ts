import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../shared/options';
import { setOptions } from '../../shared/state';
import { replaceChatInput } from '../../youtube/chat-input';
import { cleanupFeatures, initFeatures } from '../../content/feature-runtime';
import {
  emitMessageTranslationCleared,
  emitMessageTranslationRendered,
  emitMessageTranslationsCleared
} from '../translation/events';
import { recordUserMessage } from '../user-message-history';

const chatState = vi.hoisted(() => ({
  input: null as HTMLElement | null,
  text: ''
}));

const mentionMocks = vi.hoisted(() => ({
  isCurrentUserAuthorName: vi.fn((authorName: string) => authorName === '@CurrentUser')
}));

const channelMocks = vi.hoisted(() => ({
  getChannelUrl: vi.fn((channelId?: string, authorName?: string) =>
    channelId || authorName ? `https://www.youtube.com/${authorName || channelId}` : ''
  ),
  openChannelWindow: vi.fn()
}));

const queueMocks = vi.hoisted(() => {
  const close = vi.fn();
  const prioritize = vi.fn();
  return {
    close,
    createTranslationPriorityScope: vi.fn(() => ({
      close,
      prioritize
    })),
    prioritize
  };
});

const replyMocks = vi.hoisted(() => ({
  quoteAuthorRichText: vi.fn()
}));

const historyFeedMocks = vi.hoisted(() => ({
  nextTimestamp: 0,
  onBatch: null as ((updates: Array<{
    record: {
      authorName: string;
      channelId: string;
      contentParts: Array<{ text: string; type: 'text' }>;
      messageId: string;
      text: string;
      timestamp: number;
      timestampText: string;
    };
    type: 'upsert';
  }>) => void) | null
}));

vi.mock('../../youtube/chat-input', () => ({
  findChatInput: vi.fn(() => chatState.input),
  getChatInputText: vi.fn(() => chatState.text),
  replaceChatInput: vi.fn((text: string) => {
    chatState.text = text;
    return true;
  }),
  replaceNodesInChatInput: vi.fn()
}));
vi.mock('../mention-detection', () => mentionMocks);
vi.mock('../channel-popup', () => channelMocks);
vi.mock('../translation/queue', () => queueMocks);
vi.mock('../reply', () => replyMocks);
vi.mock('../reply/index', () => replyMocks);
vi.mock('../user-message-history/feed', () => ({
  startUserMessageFeed: vi.fn((onBatch: NonNullable<typeof historyFeedMocks.onBatch>) => {
    historyFeedMocks.onBatch = onBatch;
    return () => {
      if (historyFeedMocks.onBatch === onBatch) historyFeedMocks.onBatch = null;
    };
  })
}));

import {
  cleanupStaleFocusMode,
  initFocusMode,
  openFocusModeForAuthor,
  resetFocusMode,
  showFocusPromptForMessage,
  showFocusPromptForAuthor
} from './index';

describe('focus mode entrypoint', () => {
  beforeEach(() => {
    cleanupFeatures();
    document.body.replaceChildren();
    vi.clearAllMocks();
    vi.useFakeTimers();
    setOptions({ ...DEFAULT_OPTIONS });
    window.history.replaceState({}, '', '/');
    chatState.input = document.createElement('div');
    chatState.input.id = 'input';
    chatState.text = '';
    document.body.append(chatState.input, document.createElement('tp-yt-iron-pages'));
    document.querySelector('tp-yt-iron-pages')!.id = 'panel-pages';
    historyFeedMocks.nextTimestamp = 0;
    initFeatures({ saveOptions: vi.fn() });
  });

  afterEach(() => {
    cleanupFeatures();
    vi.useRealTimers();
  });

  it('shows a collapsed prompt and expands it into an empty focus panel', async () => {
    showFocusPromptForAuthor({ authorName: '@ViewerOne', channelId: 'viewer-channel' });

    const collapsed = document.querySelector<HTMLElement>('.ytcq-focus-card-collapsed')!;
    expect(collapsed).not.toBeNull();
    expect(collapsed.textContent).toContain('Focus on');
    expect(collapsed.textContent).toContain('@ViewerOne');

    collapsed.click();
    await vi.runAllTimersAsync();

    expect(document.querySelector('.ytcq-focus-card-expanded')).not.toBeNull();
    expect(document.querySelector('.ytcq-focus-empty')?.textContent).toBe('No messages yet');
    expect(chatState.text).toBe('@ViewerOne ');
  });

  it('can show a collapsed prompt from a live chat message source', () => {
    const message = createMessage('@MessagePromptViewer', 'hello', 'message-prompt-channel');
    document.body.append(message);

    showFocusPromptForMessage(message);

    expect(document.querySelector('.ytcq-focus-card-collapsed')?.textContent).toContain(
      '@MessagePromptViewer'
    );
  });

  it('opens the collapsed prompt from keyboard activation and ignores child key events', async () => {
    showFocusPromptForAuthor({ authorName: '@KeyboardViewer', channelId: 'viewer-channel' });

    const collapsed = document.querySelector<HTMLElement>('.ytcq-focus-card-collapsed')!;
    const label = collapsed.querySelector<HTMLElement>('.ytcq-focus-label')!;
    label.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    collapsed.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    expect(document.querySelector('.ytcq-focus-card-expanded')).toBeNull();

    collapsed.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
    await vi.runAllTimersAsync();

    expect(document.querySelector('.ytcq-focus-card-expanded')).not.toBeNull();
  });

  it('opens from the collapsed prompt button and closes from the collapsed close button', async () => {
    showFocusPromptForAuthor({ authorName: '@ButtonViewer', channelId: 'viewer-channel' });

    document.querySelector<HTMLButtonElement>('.ytcq-focus-open')?.click();
    await vi.runAllTimersAsync();
    expect(document.querySelector('.ytcq-focus-card-expanded')).not.toBeNull();

    showFocusPromptForAuthor({ authorName: '@ClosedViewer', channelId: 'viewer-channel' });
    document.querySelector<HTMLButtonElement>('.ytcq-focus-close')?.click();

    expect(document.querySelector('.ytcq-focus-card')).toBeNull();
  });

  it('does not replace an already expanded panel with a collapsed prompt for the same author', async () => {
    expect(
      openFocusModeForAuthor({ authorName: '@StableViewer', channelId: 'viewer-channel' })
    ).toBe(true);
    await vi.runAllTimersAsync();

    showFocusPromptForAuthor({ authorName: '@StableViewer', channelId: 'viewer-channel' });

    expect(document.querySelector('.ytcq-focus-card-expanded')).not.toBeNull();
    expect(document.querySelector('.ytcq-focus-card-collapsed')).toBeNull();
  });

  it('opens with visible conversation messages and quotes focused-user rows', async () => {
    const focusedMessage = createMessage('@ViewerTwo', 'focused message', 'viewer-channel');
    const currentUserMessage = createMessage(
      '@CurrentUser',
      '@ViewerTwo response',
      'current-channel'
    );
    document.body.append(focusedMessage, currentUserMessage);
    recordFeedMessage(focusedMessage);
    recordFeedMessage(currentUserMessage);

    expect(openFocusModeForAuthor({ authorName: '@ViewerTwo', channelId: 'viewer-channel' })).toBe(
      true
    );
    await vi.runAllTimersAsync();

    const rows = document.querySelectorAll<HTMLElement>('.ytcq-focus-message');
    expect(rows).toHaveLength(2);
    expect(rows[0].classList.contains('ytcq-focus-message-them')).toBe(true);
    expect(rows[1].classList.contains('ytcq-focus-message-us')).toBe(true);

    rows[0].click();
    await vi.runAllTimersAsync();

    expect(replyMocks.quoteAuthorRichText).toHaveBeenCalledWith(
      '@ViewerTwo',
      'focused message',
      {
        segments: [
          {
            text: 'focused message',
            type: 'text'
          }
        ]
      },
      { skipFocusPrompt: true }
    );
  });

  it('shows more than the recent-message card limit for one focused user', async () => {
    Array.from({ length: 13 }, (_, index) => {
      const message = createMessage(
        '@LongConversation',
        `focused message ${index}`,
        'viewer-channel'
      );
      document.body.append(message);
      recordFeedMessage(message);
    });

    expect(
      openFocusModeForAuthor({ authorName: '@LongConversation', channelId: 'viewer-channel' })
    ).toBe(true);
    await vi.runAllTimersAsync();

    const rows = [...document.querySelectorAll<HTMLElement>('.ytcq-focus-bubble')];
    expect(rows).toHaveLength(13);
    expect(rows[0].textContent).toBe('focused message 0');
    expect(rows.at(-1)?.textContent).toBe('focused message 12');
  });

  it('only decorates resolvable mentions inside Focus message bubbles', async () => {
    const knownViewer = createMessage('@KnownViewer', 'known history', 'known-channel');
    const focusedMessage = createMessage(
      '@FocusedViewer',
      'Ask @knownviewer, not @MissingViewer',
      'focused-channel'
    );
    document.body.append(knownViewer, focusedMessage);
    recordFeedMessage(knownViewer);
    recordFeedMessage(focusedMessage);

    expect(
      openFocusModeForAuthor({ authorName: '@FocusedViewer', channelId: 'focused-channel' })
    ).toBe(true);
    await vi.runAllTimersAsync();

    const bubble = document.querySelector<HTMLElement>('.ytcq-focus-bubble')!;
    const mentions = bubble.querySelectorAll<HTMLElement>('.ytcq-profile-mention');
    expect(mentions).toHaveLength(1);
    expect(mentions[0]?.textContent).toBe('@knownviewer');
    expect(mentions[0]?.dataset.ytcqProfileMention).toBe('@KnownViewer');
    expect(bubble.textContent).toContain('@MissingViewer');
  });

  it('quotes focused-user rows from keyboard activation only on the row itself', async () => {
    const focusedMessage = createMessage(
      '@KeyboardQuoteViewer',
      'focused message',
      'viewer-channel'
    );
    document.body.append(focusedMessage);
    recordFeedMessage(focusedMessage);

    expect(
      openFocusModeForAuthor({ authorName: '@KeyboardQuoteViewer', channelId: 'viewer-channel' })
    ).toBe(true);
    await vi.runAllTimersAsync();

    const row = document.querySelector<HTMLElement>('.ytcq-focus-message-quotable')!;
    const bubble = row.querySelector<HTMLElement>('.ytcq-focus-bubble')!;
    bubble.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    expect(replyMocks.quoteAuthorRichText).not.toHaveBeenCalled();

    row.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    await vi.runAllTimersAsync();

    expect(replyMocks.quoteAuthorRichText).toHaveBeenCalledOnce();

    replyMocks.quoteAuthorRichText.mockClear();
    row.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
    await vi.runAllTimersAsync();

    expect(replyMocks.quoteAuthorRichText).toHaveBeenCalledOnce();
  });

  it('adds new focused-user messages while the expanded panel is open', async () => {
    expect(
      openFocusModeForAuthor({ authorName: '@ViewerThree', channelId: 'viewer-channel' })
    ).toBe(true);
    await vi.runAllTimersAsync();

    const nextMessage = createMessage('@ViewerThree', 'new focused message', 'viewer-channel');
    document.body.append(nextMessage);
    recordFeedMessage(nextMessage);

    expect(document.querySelector('.ytcq-focus-bubble')?.textContent).toBe('new focused message');
  });

  it('updates from recent-message history while expanded', async () => {
    initFocusMode();
    expect(
      openFocusModeForAuthor({ authorName: '@MutationFocused', channelId: 'viewer-channel' })
    ).toBe(true);
    await vi.runAllTimersAsync();

    const nextMessage = createMessage('@MutationFocused', 'mutation message', 'viewer-channel');
    document.body.append(nextMessage);
    recordFeedMessage(nextMessage);

    expect(document.querySelector('.ytcq-focus-bubble')?.textContent).toBe('mutation message');
  });

  it('ignores unrelated message history while expanded', async () => {
    expect(
      openFocusModeForAuthor({ authorName: '@ViewerThree', channelId: 'viewer-channel' })
    ).toBe(true);
    await vi.runAllTimersAsync();
    queueMocks.prioritize.mockClear();

    const unrelated = createMessage('@OtherViewer', 'other', 'other-channel');
    document.body.append(unrelated);
    recordFeedMessage(unrelated);

    expect(document.querySelector('.ytcq-focus-bubble')).toBeNull();
    expect(queueMocks.prioritize).not.toHaveBeenCalled();
  });

  it('ignores new messages while focus is only collapsed', () => {
    showFocusPromptForAuthor({ authorName: '@ViewerThree', channelId: 'viewer-channel' });

    const nextMessage = createMessage('@ViewerThree', 'collapsed message', 'viewer-channel');
    document.body.append(nextMessage);
    recordFeedMessage(nextMessage);

    expect(document.querySelector('.ytcq-focus-bubble')).toBeNull();
    expect(queueMocks.prioritize).not.toHaveBeenCalled();
  });

  it('opens the focused user channel from the expanded header and closes from the header button', async () => {
    expect(
      openFocusModeForAuthor({
        authorName: '@ViewerFive',
        avatarSrc: 'avatar.png',
        channelId: 'viewer-channel'
      })
    ).toBe(true);
    await vi.runAllTimersAsync();

    const authorButton = document.querySelector<HTMLButtonElement>('.ytcq-focus-author-button')!;
    expect(document.querySelector('.ytcq-focus-avatar-fallback')).toBeNull();
    authorButton.click();

    expect(channelMocks.openChannelWindow).toHaveBeenCalledWith(
      'https://www.youtube.com/@ViewerFive'
    );

    document.querySelector<HTMLButtonElement>('.ytcq-focus-close')?.click();
    expect(document.querySelector('.ytcq-focus-card')).toBeNull();
    expect(queueMocks.close).toHaveBeenCalled();
  });

  it('renders a non-clickable focused author when no channel URL is available', async () => {
    channelMocks.getChannelUrl.mockReturnValueOnce('');

    expect(openFocusModeForAuthor({ authorName: '@NoChannelViewer' })).toBe(true);
    await vi.runAllTimersAsync();

    const author = document.querySelector<HTMLElement>('.ytcq-focus-author')!;
    expect(author.tagName).toBe('SPAN');
    expect(author.querySelector('.ytcq-focus-avatar-fallback')?.textContent).toBe('N');
  });

  it('restores the fixed focus mention after Enter or send button sends', async () => {
    initFocusMode();
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'en' });
    document.body.append(createSendButton());
    expect(
      openFocusModeForAuthor({ authorName: '@FocusedViewer', channelId: 'viewer-channel' })
    ).toBe(true);
    await vi.runAllTimersAsync();

    chatState.text = 'already typed';
    chatState.input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    await vi.advanceTimersByTimeAsync(120);
    await vi.runOnlyPendingTimersAsync();
    expect(chatState.text).toBe('@FocusedViewer ');

    chatState.text = 'second draft';
    document.querySelector<HTMLElement>('#send-button')?.click();
    await vi.advanceTimersByTimeAsync(360);
    await vi.runOnlyPendingTimersAsync();
    expect(chatState.text).toBe('@FocusedViewer ');
  });

  it('closes expanded focus mode on Escape', async () => {
    initFocusMode();
    expect(
      openFocusModeForAuthor({ authorName: '@EscapeViewer', channelId: 'viewer-channel' })
    ).toBe(true);
    await vi.runAllTimersAsync();

    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));

    expect(document.querySelector('.ytcq-focus-card')).toBeNull();
  });

  it('prefixes existing draft text when focus mode first opens', async () => {
    chatState.text = 'draft text';

    expect(
      openFocusModeForAuthor({ authorName: '@DraftViewer', channelId: 'viewer-channel' })
    ).toBe(true);
    await vi.runAllTimersAsync();

    expect(chatState.text).toBe('@DraftViewer draft text');
  });

  it('replaces a pending focus mention restore timer when focus changes quickly', async () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

    expect(
      openFocusModeForAuthor({ authorName: '@FirstTimerViewer', channelId: 'first-channel' })
    ).toBe(true);
    expect(
      openFocusModeForAuthor({ authorName: '@SecondTimerViewer', channelId: 'second-channel' })
    ).toBe(true);
    await vi.runAllTimersAsync();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(chatState.text).toBe('@SecondTimerViewer ');
  });

  it('does not restore the fixed focus mention for Shift+Enter or non-input Enter', async () => {
    initFocusMode();
    expect(
      openFocusModeForAuthor({ authorName: '@FocusedViewer', channelId: 'viewer-channel' })
    ).toBe(true);
    await vi.runAllTimersAsync();

    chatState.text = 'line break';
    chatState.input?.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', shiftKey: true })
    );
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    await vi.runAllTimersAsync();

    expect(chatState.text).toBe('line break');
  });

  it('keeps focus at the end when the fixed focus mention is already present', async () => {
    initFocusMode();
    expect(
      openFocusModeForAuthor({ authorName: '@FocusedViewer', channelId: 'viewer-channel' })
    ).toBe(true);
    await vi.runAllTimersAsync();

    chatState.text = '@FocusedViewer ready';
    chatState.input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    await vi.advanceTimersByTimeAsync(120);
    await vi.runOnlyPendingTimersAsync();

    const selection = document.getSelection();
    expect(selection?.anchorNode).toBe(chatState.input);
    expect(selection?.anchorOffset).toBe(chatState.input?.childNodes.length);
  });

  it('focuses text inputs by moving their selection to the end', async () => {
    const input = document.createElement('textarea');
    input.value = '@TextareaViewer ready';
    chatState.input = input;
    chatState.text = '@TextareaViewer ready';
    document.body.append(input);

    expect(
      openFocusModeForAuthor({ authorName: '@TextareaViewer', channelId: 'viewer-channel' })
    ).toBe(true);
    await vi.runAllTimersAsync();

    expect(input.selectionStart).toBe(input.value.length);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('leaves an already-prefixed draft alone when the chat input temporarily cannot be found', async () => {
    chatState.input = null;
    chatState.text = '@MissingInputViewer ready';

    expect(
      openFocusModeForAuthor({ authorName: '@MissingInputViewer', channelId: 'viewer-channel' })
    ).toBe(true);
    await vi.runAllTimersAsync();

    expect(replaceChatInput).not.toHaveBeenCalled();
    expect(chatState.text).toBe('@MissingInputViewer ready');
  });

  it('ignores document clicks that are not send-button element clicks', async () => {
    initFocusMode();
    expect(
      openFocusModeForAuthor({ authorName: '@ClickViewer', channelId: 'viewer-channel' })
    ).toBe(true);
    await vi.runAllTimersAsync();
    chatState.text = 'draft before click';

    document.dispatchEvent(new Event('click', { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.runAllTimersAsync();

    expect(chatState.text).toBe('draft before click');
  });

  it('renders existing translated focus records when translation is enabled', async () => {
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'en' });
    const focusedMessage = createMessage('@TranslatedFocus', 'hola', 'translated-channel');
    document.body.append(focusedMessage);
    recordFeedMessage(focusedMessage);
    emitTranslation(focusedMessage, 'hello');

    expect(
      openFocusModeForAuthor({ authorName: '@TranslatedFocus', channelId: 'translated-channel' })
    ).toBe(true);
    await vi.runAllTimersAsync();

    expect(document.querySelector('.ytcq-focus-bubble')?.textContent).toContain('hello');
  });

  it('updates and clears translated rows through recent-message history', async () => {
    initFocusMode();
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'en' });
    const focusedMessage = createMessage('@LiveTranslatedFocus', 'hola', 'translated-channel');
    document.body.append(focusedMessage);
    recordFeedMessage(focusedMessage);

    expect(
      openFocusModeForAuthor({
        authorName: '@LiveTranslatedFocus',
        channelId: 'translated-channel'
      })
    ).toBe(true);
    await vi.runAllTimersAsync();

    emitTranslation(focusedMessage, 'hello');
    expect(document.querySelector('.ytcq-focus-bubble')?.textContent).toContain('hello');
    expect(queueMocks.prioritize).toHaveBeenCalled();

    emitMessageTranslationCleared(focusedMessage);
    expect(document.querySelector('.ytcq-focus-bubble')?.textContent).not.toContain('hello');

    emitTranslation(focusedMessage, 'hello again');
    emitMessageTranslationsCleared();
    expect(document.querySelector('.ytcq-focus-bubble')?.textContent).not.toContain('hello again');
  });

  it('ignores missing translations and prioritizes detached history refs', async () => {
    initFocusMode();
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'en' });
    const focusedMessage = createMessage('@DetachedTranslatedFocus', 'hola', 'translated-channel');
    document.body.append(focusedMessage);
    recordFeedMessage(focusedMessage);

    expect(
      openFocusModeForAuthor({
        authorName: '@DetachedTranslatedFocus',
        channelId: 'translated-channel'
      })
    ).toBe(true);
    await vi.runAllTimersAsync();

    emitMessageTranslationCleared(focusedMessage);
    expect(document.querySelector('.ytcq-focus-bubble')?.textContent).toContain('hola');

    emitTranslation(focusedMessage, 'hello');
    focusedMessage.remove();
    queueMocks.prioritize.mockClear();

    emitMessageTranslationsCleared();

    expect(queueMocks.prioritize).toHaveBeenCalledWith([null]);
  });

  it('ignores history changes when no focus panel is open', () => {
    initFocusMode();
    const unknown = createMessage('@UnknownTranslatedFocus', 'hola', 'unknown-channel');
    recordFeedMessage(unknown);
    emitTranslation(unknown, 'hello');
    emitMessageTranslationsCleared();

    expect(document.querySelector('.ytcq-focus-card')).toBeNull();
  });

  it('mounts the focus anchor on the document body when YouTube panel pages are unavailable', () => {
    document.querySelector('#panel-pages')?.remove();

    showFocusPromptForAuthor({ authorName: '@BodyMountedViewer' });

    expect(document.body.lastElementChild?.classList.contains('ytcq-focus-anchor')).toBe(true);
  });

  it('ignores messages that do not expose a focus source', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');

    showFocusPromptForMessage(message);

    expect(document.querySelector('.ytcq-focus-card')).toBeNull();
  });

  it('rejects invalid/current-user focus sources and cleans stale anchors', () => {
    expect(openFocusModeForAuthor({ authorName: '@CurrentUser' })).toBe(false);
    showFocusPromptForAuthor({ authorName: '   ' });
    expect(document.querySelector('.ytcq-focus-card')).toBeNull();

    openFocusModeForAuthor({ authorName: '@ViewerFour' });
    expect(document.querySelector('.ytcq-focus-anchor')).not.toBeNull();

    resetFocusMode();
    cleanupStaleFocusMode();

    expect(document.querySelector('.ytcq-focus-anchor')).toBeNull();
  });
});

function emitTranslation(message: HTMLElement, text: string): void {
  const originalText = message.querySelector('[id="message"]')?.textContent?.trim() || '';
  emitMessageTranslationRendered({
    message,
    originalText,
    protectedTokens: [],
    result: { sourceLanguage: 'es', targetLanguage: 'en', text },
    sourceText: originalText
  });
}

function createMessage(authorName: string, text: string, channelId: string): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer');
  message.setAttribute('data-message-id', `${channelId}-${text}`);
  message.innerHTML = `
    <a href="/channel/${channelId}"><span id="author-name">${authorName}</span></a>
    <span id="message">${text}</span>
    <span id="timestamp">9:30 PM</span>
  `;
  return message;
}

function recordFeedMessage(message: HTMLElement): void {
  const authorName = message.querySelector('[id="author-name"]')?.textContent || '';
  const text = message.querySelector('[id="message"]')?.textContent || '';
  const messageId = message.getAttribute('data-message-id') || '';
  const channelId = message.querySelector('a')?.getAttribute('href')?.split('/').pop() || '';
  historyFeedMocks.onBatch?.([{
    record: {
      authorName,
      channelId,
      contentParts: [{ text, type: 'text' }],
      messageId,
      text,
      timestamp: Date.now() + historyFeedMocks.nextTimestamp++,
      timestampText: '9:30 PM'
    },
    type: 'upsert'
  }]);
  recordUserMessage(message);
}

function createSendButton(): HTMLElement {
  const button = document.createElement('button');
  button.id = 'send-button';
  return button;
}
