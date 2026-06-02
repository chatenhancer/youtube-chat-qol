import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmojiUsage } from './types';

const chatInputMocks = vi.hoisted(() => ({
  insertIntoChatInput: vi.fn(),
  insertNodeIntoChatInput: vi.fn()
}));

vi.mock('../../youtube/chat-input', () => chatInputMocks);

import { insertEmojiIntoChat } from './insert';

describe('frequent emoji insertion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts unicode emoji as text', () => {
    chatInputMocks.insertIntoChatInput.mockReturnValue(true);

    expect(insertEmojiIntoChat(emoji({ text: '😀' }))).toBe(true);

    expect(chatInputMocks.insertIntoChatInput).toHaveBeenCalledWith('😀');
    expect(chatInputMocks.insertNodeIntoChatInput).not.toHaveBeenCalled();
  });

  it('inserts custom emoji as an image with YouTube emoji metadata', () => {
    chatInputMocks.insertNodeIntoChatInput.mockReturnValue(true);

    expect(insertEmojiIntoChat(emoji({
      alt: ':custom-smile:',
      emojiId: 'custom-smile-id',
      label: 'Custom smile',
      shortcut: ':custom-smile:',
      src: 'https://example.com/custom.png'
    }))).toBe(true);

    const [image, fallbackText] = chatInputMocks.insertNodeIntoChatInput.mock.calls[0];
    expect(image).toBeInstanceOf(HTMLImageElement);
    expect((image as HTMLImageElement).alt).toBe(':custom-smile:');
    expect((image as HTMLImageElement).id).toBe('custom-smile-id');
    expect((image as HTMLImageElement).getAttribute('data-emoji-id')).toBe('custom-smile-id');
    expect((image as HTMLImageElement).getAttribute('shared-tooltip-text')).toBe(':custom-smile:');
    expect(fallbackText).toBe(':custom-smile:');
  });

  it('inserts non-custom image emoji with label metadata when available', () => {
    chatInputMocks.insertNodeIntoChatInput.mockReturnValue(true);

    expect(insertEmojiIntoChat(emoji({
      label: '😀',
      src: 'https://example.com/smile.png'
    }))).toBe(true);

    const [image, fallbackText] = chatInputMocks.insertNodeIntoChatInput.mock.calls[0];
    expect((image as HTMLImageElement).alt).toBe('😀');
    expect((image as HTMLImageElement).id).toBe('');
    expect((image as HTMLImageElement).getAttribute('data-emoji-id')).toBeNull();
    expect((image as HTMLImageElement).getAttribute('shared-tooltip-text')).toBe('😀');
    expect(fallbackText).toBe('😀');
  });

  it('falls back to shortcut insertion when a custom emoji cannot provide an id', () => {
    chatInputMocks.insertIntoChatInput.mockReturnValue(true);

    expect(insertEmojiIntoChat(emoji({
      alt: ':missing-id:',
      shortcut: ':missing-id:',
      src: 'https://example.com/custom.png'
    }))).toBe(true);

    expect(chatInputMocks.insertNodeIntoChatInput).not.toHaveBeenCalled();
    expect(chatInputMocks.insertIntoChatInput).toHaveBeenCalledWith(':missing-id:');
  });

  it('falls back to text insertion when image insertion fails', () => {
    chatInputMocks.insertNodeIntoChatInput.mockReturnValue(false);
    chatInputMocks.insertIntoChatInput.mockReturnValue(true);

    expect(insertEmojiIntoChat(emoji({
      alt: ':custom-smile:',
      emojiId: 'custom-smile-id',
      shortcut: ':custom-smile:',
      src: 'https://example.com/custom.png'
    }))).toBe(true);

    expect(chatInputMocks.insertNodeIntoChatInput).toHaveBeenCalledOnce();
    expect(chatInputMocks.insertIntoChatInput).toHaveBeenCalledWith(':custom-smile:');
  });

  it('returns false when an emoji has neither image fallback nor insert text', () => {
    expect(insertEmojiIntoChat(emoji({}))).toBe(false);

    expect(chatInputMocks.insertNodeIntoChatInput).not.toHaveBeenCalled();
    expect(chatInputMocks.insertIntoChatInput).not.toHaveBeenCalled();
  });
});

function emoji(overrides: Partial<EmojiUsage>): EmojiUsage {
  return {
    alt: '',
    count: 1,
    emojiId: '',
    key: 'emoji',
    label: '',
    lastUsed: 1,
    shortcut: '',
    src: '',
    text: '',
    ...overrides
  };
}
