import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../youtube/chat-input', () => ({
  findChatInput: vi.fn(() => chatState.input),
  getChatInputText: vi.fn(() => chatState.text),
  replaceChatInput: vi.fn((text: string) => {
    chatState.text = text;
    return true;
  })
}));
vi.mock('../mention-detection', () => mentionMocks);
vi.mock('../channel-popup', () => channelMocks);
vi.mock('../translation/events', () => ({
  onMessageTranslationCleared: vi.fn(),
  onMessageTranslationRendered: vi.fn(),
  onMessageTranslationsCleared: vi.fn()
}));
vi.mock('../translation/queue', () => queueMocks);
vi.mock('../reply', () => replyMocks);
vi.mock('../user-message-history', () => ({
  getAvatarSrcForIdentity: vi.fn(() => ''),
  getUserMessageRecordForMessage: vi.fn(() => null)
}));

import {
  cleanupStaleFocusMode,
  handlePotentialFocusMessage,
  openFocusModeForAuthor,
  resetFocusMode,
  showFocusPromptForAuthor
} from './index';

describe('focus mode entrypoint', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
    vi.useFakeTimers();
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

  it('adds new focused-user messages while the expanded panel is open', async () => {
    expect(openFocusModeForAuthor({ authorName: '@ViewerThree', channelId: 'viewer-channel' })).toBe(true);
    await vi.runAllTimersAsync();

    const nextMessage = createMessage('@ViewerThree', 'new focused message', 'viewer-channel');
    document.body.append(nextMessage);
    handlePotentialFocusMessage(nextMessage);

    expect(document.querySelector('.ytcq-focus-bubble')?.textContent).toBe('new focused message');
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
