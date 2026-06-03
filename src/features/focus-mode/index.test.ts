import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../shared/options';
import { setOptions } from '../../shared/state';
import { replaceChatInput } from '../../youtube/chat-input';

const chatState = vi.hoisted(() => ({
  input: null as HTMLElement | null,
  text: ''
}));

const mentionMocks = vi.hoisted(() => ({
  isCurrentUserAuthorName: vi.fn((authorName: string) => authorName === '@CurrentUser')
}));

const channelMocks = vi.hoisted(() => ({
  getChannelUrl: vi.fn((channelId?: string, authorName?: string) => (
    channelId || authorName ? `https://www.youtube.com/${authorName || channelId}` : ''
  )),
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

const userHistoryMocks = vi.hoisted(() => ({
  getAvatarSrcForIdentity: vi.fn(() => ''),
  getUserMessageRecordForMessage: vi.fn(() => null)
}));

const translationCallbacks = vi.hoisted(() => ({
  cleared: null as ((event: { message: HTMLElement }) => void) | null,
  rendered: null as ((event: {
    message: HTMLElement;
    originalText: string;
    protectedTokens: [];
    result: { sourceLanguage: string; targetLanguage: string; text: string };
    sourceText: string;
  }) => void) | null,
  translationsCleared: null as (() => void) | null
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
vi.mock('../translation/events', () => ({
  onMessageTranslationCleared: vi.fn((callback) => {
    translationCallbacks.cleared = callback;
  }),
  onMessageTranslationRendered: vi.fn((callback) => {
    translationCallbacks.rendered = callback;
  }),
  onMessageTranslationsCleared: vi.fn((callback) => {
    translationCallbacks.translationsCleared = callback;
  })
}));
vi.mock('../translation/queue', () => queueMocks);
vi.mock('../reply', () => replyMocks);
vi.mock('../reply/index', () => replyMocks);
vi.mock('../user-message-history', () => ({
  getAvatarSrcForIdentity: userHistoryMocks.getAvatarSrcForIdentity,
  getUserMessageRecordForMessage: userHistoryMocks.getUserMessageRecordForMessage
}));

import {
  cleanupStaleFocusMode,
  handlePotentialFocusMessage,
  initFocusMode,
  openFocusModeForAuthor,
  resetFocusMode,
  showFocusPromptForMessage,
  showFocusPromptForAuthor
} from './index';

describe('focus mode entrypoint', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
    vi.useFakeTimers();
    setOptions({ ...DEFAULT_OPTIONS });
    userHistoryMocks.getAvatarSrcForIdentity.mockReturnValue('');
    userHistoryMocks.getUserMessageRecordForMessage.mockReturnValue(null);
    chatState.input = document.createElement('div');
    chatState.input.id = 'input';
    chatState.text = '';
    document.body.append(chatState.input, document.createElement('tp-yt-iron-pages'));
    document.querySelector('tp-yt-iron-pages')!.id = 'panel-pages';
  });

  afterEach(() => {
    cleanupStaleFocusMode();
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

    expect(document.querySelector('.ytcq-focus-card-collapsed')?.textContent).toContain('@MessagePromptViewer');
  });

  it('opens the collapsed prompt from keyboard activation and ignores child key events', async () => {
    showFocusPromptForAuthor({ authorName: '@KeyboardViewer', channelId: 'viewer-channel' });

    const collapsed = document.querySelector<HTMLElement>('.ytcq-focus-card-collapsed')!;
    const label = collapsed.querySelector<HTMLElement>('.ytcq-focus-label')!;
    label.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
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
    expect(openFocusModeForAuthor({ authorName: '@StableViewer', channelId: 'viewer-channel' })).toBe(true);
    await vi.runAllTimersAsync();

    showFocusPromptForAuthor({ authorName: '@StableViewer', channelId: 'viewer-channel' });

    expect(document.querySelector('.ytcq-focus-card-expanded')).not.toBeNull();
    expect(document.querySelector('.ytcq-focus-card-collapsed')).toBeNull();
  });

  it('opens with visible conversation messages and quotes focused-user rows', async () => {
    const focusedMessage = createMessage('@ViewerTwo', 'focused message', 'viewer-channel');
    const currentUserMessage = createMessage('@CurrentUser', '@ViewerTwo response', 'current-channel');
    document.body.append(focusedMessage, currentUserMessage);

    expect(openFocusModeForAuthor({ authorName: '@ViewerTwo', channelId: 'viewer-channel' })).toBe(true);
    await vi.runAllTimersAsync();

    const rows = document.querySelectorAll<HTMLElement>('.ytcq-focus-message');
    expect(rows).toHaveLength(2);
    expect(rows[0].classList.contains('ytcq-focus-message-them')).toBe(true);
    expect(rows[1].classList.contains('ytcq-focus-message-us')).toBe(true);

    rows[0].click();
    await vi.runAllTimersAsync();

    expect(replyMocks.quoteAuthorRichText).toHaveBeenCalledWith('@ViewerTwo', 'focused message', {
      segments: [
        {
          text: 'focused message',
          type: 'text'
        }
      ]
    }, { skipFocusPrompt: true });
  });

  it('quotes focused-user rows from keyboard activation only on the row itself', async () => {
    const focusedMessage = createMessage('@KeyboardQuoteViewer', 'focused message', 'viewer-channel');
    document.body.append(focusedMessage);

    expect(openFocusModeForAuthor({ authorName: '@KeyboardQuoteViewer', channelId: 'viewer-channel' })).toBe(true);
    await vi.runAllTimersAsync();

    const row = document.querySelector<HTMLElement>('.ytcq-focus-message-quotable')!;
    const bubble = row.querySelector<HTMLElement>('.ytcq-focus-bubble')!;
    bubble.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    expect(replyMocks.quoteAuthorRichText).not.toHaveBeenCalled();

    row.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    await vi.runAllTimersAsync();

    expect(replyMocks.quoteAuthorRichText).toHaveBeenCalledOnce();
  });

  it('adds new focused-user messages while the expanded panel is open', async () => {
    expect(openFocusModeForAuthor({ authorName: '@ViewerThree', channelId: 'viewer-channel' })).toBe(true);
    await vi.runAllTimersAsync();

    const nextMessage = createMessage('@ViewerThree', 'new focused message', 'viewer-channel');
    document.body.append(nextMessage);
    handlePotentialFocusMessage(nextMessage);

    expect(document.querySelector('.ytcq-focus-bubble')?.textContent).toBe('new focused message');
  });

  it('records changed messages from the lifecycle mutation collector while expanded', async () => {
    const lifecycle = await import('../../content/lifecycle');
    expect(openFocusModeForAuthor({ authorName: '@MutationFocused', channelId: 'viewer-channel' })).toBe(true);
    await vi.runAllTimersAsync();

    const nextMessage = createMessage('@MutationFocused', 'mutation message', 'viewer-channel');
    document.body.append(nextMessage);
    lifecycle.handleFeatureMutations({
      addedElements: [],
      changedMessages: [nextMessage],
      mutations: []
    });

    expect(document.querySelector('.ytcq-focus-bubble')?.textContent).toBe('mutation message');
  });

  it('ignores disconnected and unrelated messages while expanded', async () => {
    expect(openFocusModeForAuthor({ authorName: '@ViewerThree', channelId: 'viewer-channel' })).toBe(true);
    await vi.runAllTimersAsync();
    queueMocks.prioritize.mockClear();

    const disconnected = createMessage('@ViewerThree', 'gone', 'viewer-channel');
    disconnected.remove();
    handlePotentialFocusMessage(disconnected);
    const unrelated = createMessage('@OtherViewer', 'other', 'other-channel');
    document.body.append(unrelated);
    handlePotentialFocusMessage(unrelated);

    expect(document.querySelector('.ytcq-focus-bubble')).toBeNull();
    expect(queueMocks.prioritize).not.toHaveBeenCalled();
  });

  it('ignores new messages while focus is only collapsed', () => {
    showFocusPromptForAuthor({ authorName: '@ViewerThree', channelId: 'viewer-channel' });

    const nextMessage = createMessage('@ViewerThree', 'collapsed message', 'viewer-channel');
    document.body.append(nextMessage);
    handlePotentialFocusMessage(nextMessage);

    expect(document.querySelector('.ytcq-focus-bubble')).toBeNull();
    expect(queueMocks.prioritize).not.toHaveBeenCalled();
  });

  it('opens the focused user channel from the expanded header and closes from the header button', async () => {
    expect(openFocusModeForAuthor({
      authorName: '@ViewerFive',
      avatarSrc: 'avatar.png',
      channelId: 'viewer-channel'
    })).toBe(true);
    await vi.runAllTimersAsync();

    const authorButton = document.querySelector<HTMLButtonElement>('.ytcq-focus-author-button')!;
    expect(document.querySelector('.ytcq-focus-avatar-fallback')).toBeNull();
    authorButton.click();

    expect(channelMocks.openChannelWindow).toHaveBeenCalledWith('https://www.youtube.com/@ViewerFive');

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
    expect(openFocusModeForAuthor({ authorName: '@FocusedViewer', channelId: 'viewer-channel' })).toBe(true);
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
    expect(openFocusModeForAuthor({ authorName: '@EscapeViewer', channelId: 'viewer-channel' })).toBe(true);
    await vi.runAllTimersAsync();

    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));

    expect(document.querySelector('.ytcq-focus-card')).toBeNull();
  });

  it('prefixes existing draft text when focus mode first opens', async () => {
    chatState.text = 'draft text';

    expect(openFocusModeForAuthor({ authorName: '@DraftViewer', channelId: 'viewer-channel' })).toBe(true);
    await vi.runAllTimersAsync();

    expect(chatState.text).toBe('@DraftViewer draft text');
  });

  it('does not restore the fixed focus mention for Shift+Enter or non-input Enter', async () => {
    initFocusMode();
    expect(openFocusModeForAuthor({ authorName: '@FocusedViewer', channelId: 'viewer-channel' })).toBe(true);
    await vi.runAllTimersAsync();

    chatState.text = 'line break';
    chatState.input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', shiftKey: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    await vi.runAllTimersAsync();

    expect(chatState.text).toBe('line break');
  });

  it('keeps focus at the end when the fixed focus mention is already present', async () => {
    initFocusMode();
    expect(openFocusModeForAuthor({ authorName: '@FocusedViewer', channelId: 'viewer-channel' })).toBe(true);
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

    expect(openFocusModeForAuthor({ authorName: '@TextareaViewer', channelId: 'viewer-channel' })).toBe(true);
    await vi.runAllTimersAsync();

    expect(input.selectionStart).toBe(input.value.length);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('leaves an already-prefixed draft alone when the chat input temporarily cannot be found', async () => {
    chatState.input = null;
    chatState.text = '@MissingInputViewer ready';

    expect(openFocusModeForAuthor({ authorName: '@MissingInputViewer', channelId: 'viewer-channel' })).toBe(true);
    await vi.runAllTimersAsync();

    expect(replaceChatInput).not.toHaveBeenCalled();
    expect(chatState.text).toBe('@MissingInputViewer ready');
  });

  it('ignores document clicks that are not send-button element clicks', async () => {
    initFocusMode();
    expect(openFocusModeForAuthor({ authorName: '@ClickViewer', channelId: 'viewer-channel' })).toBe(true);
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
    userHistoryMocks.getUserMessageRecordForMessage.mockReturnValue({
      translation: {
        originalText: 'hola',
        protectedTokens: [],
        result: { sourceLanguage: 'es', targetLanguage: 'en', text: 'hello' },
        sourceText: 'hola'
      }
    } as never);

    expect(openFocusModeForAuthor({ authorName: '@TranslatedFocus', channelId: 'translated-channel' })).toBe(true);
    await vi.runAllTimersAsync();

    expect(document.querySelector('.ytcq-focus-bubble')?.textContent).toContain('hello');
  });

  it('updates and clears focus rows from translation events while expanded', async () => {
    initFocusMode();
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'en' });
    const focusedMessage = createMessage('@LiveTranslatedFocus', 'hola', 'translated-channel');
    document.body.append(focusedMessage);

    expect(openFocusModeForAuthor({ authorName: '@LiveTranslatedFocus', channelId: 'translated-channel' })).toBe(true);
    await vi.runAllTimersAsync();

    translationCallbacks.rendered?.({
      message: focusedMessage,
      originalText: 'hola',
      protectedTokens: [],
      result: { sourceLanguage: 'es', targetLanguage: 'en', text: 'hello' },
      sourceText: 'hola'
    });
    expect(document.querySelector('.ytcq-focus-bubble')?.textContent).toContain('hello');
    expect(queueMocks.prioritize).toHaveBeenCalled();

    translationCallbacks.cleared?.({ message: focusedMessage });
    expect(document.querySelector('.ytcq-focus-bubble')?.textContent).not.toContain('hello');

    translationCallbacks.rendered?.({
      message: focusedMessage,
      originalText: 'hola',
      protectedTokens: [],
      result: { sourceLanguage: 'es', targetLanguage: 'en', text: 'hello again' },
      sourceText: 'hola'
    });
    translationCallbacks.translationsCleared?.();
    expect(document.querySelector('.ytcq-focus-bubble')?.textContent).not.toContain('hello again');
  });

  it('ignores translation events when no focus record matches', async () => {
    initFocusMode();
    const unknown = createMessage('@UnknownTranslatedFocus', 'hola', 'unknown-channel');

    translationCallbacks.rendered?.({
      message: unknown,
      originalText: 'hola',
      protectedTokens: [],
      result: { sourceLanguage: 'es', targetLanguage: 'en', text: 'hello' },
      sourceText: 'hola'
    });
    translationCallbacks.cleared?.({ message: unknown });
    translationCallbacks.translationsCleared?.();

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

function createMessage(authorName: string, text: string, channelId: string): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer') as HTMLElement & {
    data?: unknown;
  };
  message.data = {
    authorExternalChannelId: channelId,
    authorName: { simpleText: authorName },
    id: `${channelId}-${text}`,
    message: { runs: [{ text }] }
  };
  message.innerHTML = `
    <span id="author-name">${authorName}</span>
    <span id="message">${text}</span>
    <span id="timestamp">9:30 PM</span>
  `;
  return message;
}

function createSendButton(): HTMLElement {
  const button = document.createElement('button');
  button.id = 'send-button';
  return button;
}
