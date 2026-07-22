import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageRecord } from '../user-message-history';
import type { FocusSource } from './types';

describe('focus mode records', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.replaceChildren();
    document.body.innerHTML = `
      <yt-live-chat-message-input-renderer>
        <span id="author-name">@CurrentUser</span>
      </yt-live-chat-message-input-renderer>
    `;
  });

  it('maps focused-user history onto the left side', async () => {
    const { createFocusRecordFromHistory } = await import('./records');
    const source: FocusSource = { authorName: '@FocusedUser', channelId: 'focused-channel' };

    const record = createFocusRecordFromHistory(createRecord({
      authorName: '@FocusedUser',
      channelId: 'focused-channel',
      messageId: 'message-1',
      text: 'hello'
    }), source);

    expect(record).toMatchObject({
      authorName: '@FocusedUser',
      historyKey: 'channel:focused-channel',
      messageId: 'message-1',
      side: 'them',
      text: 'hello'
    });
  });

  it('maps current-user history only when it mentions the focused handle', async () => {
    const { createFocusRecordFromHistory } = await import('./records');
    const source: FocusSource = { authorName: '@FocusedUser', channelId: 'focused-channel' };

    expect(createFocusRecordFromHistory(createRecord({
      authorName: '@CurrentUser',
      channelId: 'current-channel',
      text: 'replying to focuseduser'
    }), source)).toMatchObject({
      side: 'us',
      text: 'replying to focuseduser'
    });

    expect(createFocusRecordFromHistory(createRecord({
      authorName: '@CurrentUser',
      channelId: 'current-channel',
      text: 'talking to someone else'
    }), source)).toBeNull();
  });

  it('ignores unrelated users', async () => {
    const { createFocusRecordFromHistory } = await import('./records');

    expect(createFocusRecordFromHistory(createRecord({
      authorName: '@OtherUser',
      channelId: 'other-channel',
      text: '@FocusedUser hello'
    }), { authorName: '@FocusedUser', channelId: 'focused-channel' })).toBeNull();
  });

  it('preserves history-owned rich content, live references, and translations', async () => {
    const { createFocusRecordFromHistory } = await import('./records');
    const message = document.createElement('yt-live-chat-text-message-renderer');
    document.body.append(message);
    const sourceRecord = createRecord({
      authorName: '@FocusedUser',
      channelId: 'focused-channel',
      messageId: 'message-1',
      text: 'hola'
    });
    sourceRecord.avatarSrc = 'https://example.test/avatar.png';
    sourceRecord.contentParts = [{ text: 'hola', type: 'text' }];
    sourceRecord.messageRef = new WeakRef(message);
    sourceRecord.translation = {
      originalText: 'hola',
      protectedTokens: [],
      result: { sourceLanguage: 'es', targetLanguage: 'en', text: 'hello' },
      sourceText: 'hola'
    };

    expect(createFocusRecordFromHistory(sourceRecord, {
      authorName: '@FocusedUser',
      channelId: 'focused-channel'
    })).toMatchObject({
      avatarSrc: 'https://example.test/avatar.png',
      channelId: 'focused-channel',
      contentParts: [{ text: 'hola', type: 'text' }],
      messageId: 'message-1',
      messageRef: sourceRecord.messageRef,
      timestamp: sourceRecord.timestamp,
      translation: { result: { text: 'hello' } }
    });
  });
});

let nextId = 1;

function createRecord({
  authorName,
  channelId,
  messageId,
  text
}: {
  authorName: string;
  channelId?: string;
  messageId?: string;
  text: string;
}): MessageRecord {
  return {
    authorName,
    channelId,
    contentParts: [{ text, type: 'text' }],
    id: nextId++,
    messageId,
    text,
    timestamp: nextId,
    timestampText: '12:00 PM'
  };
}
