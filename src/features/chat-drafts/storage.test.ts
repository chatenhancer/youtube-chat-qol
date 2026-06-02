import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_INPUT_DRAFTS_STORAGE_KEY,
  createChatInputDraftContent,
  loadChatInputDraft,
  saveChatInputDraft
} from './storage';

describe('chat input draft storage', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await chrome.storage.local.clear();
    vi.setSystemTime(new Date('2026-06-02T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and loads drafts per stream source', async () => {
    await saveChatInputDraft('https://www.youtube.com/watch?v=stream-a', textDraft('hello stream a'));
    await saveChatInputDraft('https://www.youtube.com/watch?v=stream-b', textDraft('hello stream b'));

    await expect(loadChatInputDraft('https://www.youtube.com/watch?v=stream-a')).resolves.toMatchObject({
      text: 'hello stream a'
    });
    await expect(loadChatInputDraft('https://www.youtube.com/watch?v=stream-b')).resolves.toMatchObject({
      text: 'hello stream b'
    });
  });

  it('clears a stream draft when the saved text is empty', async () => {
    const sourceUrl = 'https://www.youtube.com/watch?v=stream-a';
    await saveChatInputDraft(sourceUrl, textDraft('unsent draft'));
    await saveChatInputDraft(sourceUrl, textDraft('   '));

    await expect(loadChatInputDraft(sourceUrl)).resolves.toMatchObject({
      text: '',
      contentParts: []
    });
  });

  it('serializes rich composer emoji nodes for later restore', async () => {
    const emoji = document.createElement('img');
    emoji.className = 'emoji yt-formatted-string style-scope yt-live-chat-text-input-field-renderer';
    emoji.src = 'https://example.test/emoji.png';
    emoji.alt = ':custom-wave:';
    emoji.id = 'custom-wave-id';
    emoji.setAttribute('data-emoji-id', 'custom-wave-id');
    emoji.setAttribute('shared-tooltip-text', ':custom-wave:');

    const draft = createChatInputDraftContent({
      childNodes: [
        document.createTextNode('hello '),
        emoji,
        document.createTextNode(' draft')
      ],
      text: 'hello :custom-wave: draft'
    });

    await saveChatInputDraft('https://www.youtube.com/watch?v=stream-a', draft);

    await expect(loadChatInputDraft('https://www.youtube.com/watch?v=stream-a')).resolves.toMatchObject({
      contentParts: [
        { text: 'hello ', type: 'text' },
        {
          alt: ':custom-wave:',
          emojiId: 'custom-wave-id',
          src: 'https://example.test/emoji.png',
          type: 'emoji'
        },
        { text: ' draft', type: 'text' }
      ],
      text: 'hello :custom-wave: draft'
    });
  });

  it('keeps only the newest stored drafts', async () => {
    for (let index = 0; index < 55; index += 1) {
      vi.setSystemTime(new Date(Date.UTC(2026, 5, 2, 12, 0, index)));
      await saveChatInputDraft(`https://www.youtube.com/watch?v=stream-${index}`, textDraft(`draft ${index}`));
    }

    const stored = await chrome.storage.local.get(CHAT_INPUT_DRAFTS_STORAGE_KEY);
    const drafts = stored[CHAT_INPUT_DRAFTS_STORAGE_KEY] as Record<string, unknown>;
    expect(Object.keys(drafts)).toHaveLength(50);
    await expect(loadChatInputDraft('https://www.youtube.com/watch?v=stream-0')).resolves.toMatchObject({
      text: ''
    });
    await expect(loadChatInputDraft('https://www.youtube.com/watch?v=stream-54')).resolves.toMatchObject({
      text: 'draft 54'
    });
  });
});

function textDraft(text: string) {
  return {
    contentParts: text ? [{ text, type: 'text' as const }] : [],
    text
  };
}
