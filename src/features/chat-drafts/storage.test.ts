import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_INPUT_DRAFTS_STORAGE_KEY,
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
    await saveChatInputDraft('https://www.youtube.com/watch?v=stream-a', 'hello stream a');
    await saveChatInputDraft('https://www.youtube.com/watch?v=stream-b', 'hello stream b');

    await expect(loadChatInputDraft('https://www.youtube.com/watch?v=stream-a')).resolves.toBe('hello stream a');
    await expect(loadChatInputDraft('https://www.youtube.com/watch?v=stream-b')).resolves.toBe('hello stream b');
  });

  it('clears a stream draft when the saved text is empty', async () => {
    const sourceUrl = 'https://www.youtube.com/watch?v=stream-a';
    await saveChatInputDraft(sourceUrl, 'unsent draft');
    await saveChatInputDraft(sourceUrl, '   ');

    await expect(loadChatInputDraft(sourceUrl)).resolves.toBe('');
  });

  it('keeps only the newest stored drafts', async () => {
    for (let index = 0; index < 55; index += 1) {
      vi.setSystemTime(new Date(Date.UTC(2026, 5, 2, 12, 0, index)));
      await saveChatInputDraft(`https://www.youtube.com/watch?v=stream-${index}`, `draft ${index}`);
    }

    const stored = await chrome.storage.local.get(CHAT_INPUT_DRAFTS_STORAGE_KEY);
    const drafts = stored[CHAT_INPUT_DRAFTS_STORAGE_KEY] as Record<string, unknown>;
    expect(Object.keys(drafts)).toHaveLength(50);
    await expect(loadChatInputDraft('https://www.youtube.com/watch?v=stream-0')).resolves.toBe('');
    await expect(loadChatInputDraft('https://www.youtube.com/watch?v=stream-54')).resolves.toBe('draft 54');
  });
});
