import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const chatInputMocks = vi.hoisted(() => ({
  insertIntoChatInput: vi.fn(),
  replaceChatInput: vi.fn(),
  replaceNodesInChatInput: vi.fn(),
  returnToChatInputPanel: vi.fn()
}));

const toastMock = vi.hoisted(() => vi.fn());

vi.mock('../../youtube/chat-input', () => chatInputMocks);

vi.mock('../../shared/toast', () => ({
  showToast: toastMock
}));

import {
  insertMentionText,
  replaceInputWithQuoteNodes,
  replaceInputWithQuoteText
} from './input';

describe('reply input insertion recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('inserts mentions and quote text immediately when chat input is ready', () => {
    chatInputMocks.insertIntoChatInput.mockReturnValue(true);
    chatInputMocks.replaceChatInput.mockReturnValue(true);

    insertMentionText('@ExampleUser ');
    replaceInputWithQuoteText('@ExampleUser : "hello" ');

    expect(chatInputMocks.insertIntoChatInput).toHaveBeenCalledWith('@ExampleUser ');
    expect(chatInputMocks.replaceChatInput).toHaveBeenCalledWith('@ExampleUser : "hello" ');
    expect(chatInputMocks.returnToChatInputPanel).not.toHaveBeenCalled();
  });

  it('returns to the chat panel and retries insertion when the input is temporarily unavailable', async () => {
    chatInputMocks.insertIntoChatInput
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    chatInputMocks.returnToChatInputPanel.mockReturnValue(true);

    insertMentionText('@RetryUser ');
    await vi.advanceTimersByTimeAsync(80);

    expect(chatInputMocks.returnToChatInputPanel).toHaveBeenCalledOnce();
    expect(chatInputMocks.insertIntoChatInput).toHaveBeenCalledTimes(2);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('shows a toast when the chat panel cannot be restored', () => {
    chatInputMocks.replaceChatInput.mockReturnValue(false);
    chatInputMocks.returnToChatInputPanel.mockReturnValue(false);

    replaceInputWithQuoteText('@ExampleUser : "hello" ');

    expect(toastMock).toHaveBeenCalledWith('Could not find the chat input.');
  });

  it('retries rich quote nodes and eventually reports failure', async () => {
    const node = document.createTextNode('quote');
    chatInputMocks.replaceNodesInChatInput.mockReturnValue(false);
    chatInputMocks.returnToChatInputPanel.mockReturnValue(true);

    replaceInputWithQuoteNodes([node], 'quote');
    await vi.advanceTimersByTimeAsync(80 + 180 + 360 + 600);

    expect(chatInputMocks.replaceNodesInChatInput).toHaveBeenCalledTimes(5);
    expect(toastMock).toHaveBeenCalledWith('Could not find the chat input.');
  });
});
