import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FocusRecord, FocusSource } from './types';

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

  it('records messages from the focused user on the left side', async () => {
    const { createFocusRecord } = await import('./records');
    const source: FocusSource = { authorName: '@FocusedUser', channelId: 'focused-channel' };
    const records: FocusRecord[] = [];

    const record = createFocusRecord(createMessage({
      authorName: '@FocusedUser',
      channelId: 'focused-channel',
      messageId: 'message-1',
      text: 'hello'
    }), source, records, () => 1);

    expect(record).toMatchObject({
      authorName: '@FocusedUser',
      messageId: 'message-1',
      side: 'them',
      text: 'hello'
    });
  });

  it('records current-user messages only when they mention the focused handle', async () => {
    const { createFocusRecord } = await import('./records');
    const source: FocusSource = { authorName: '@FocusedUser', channelId: 'focused-channel' };
    const records: FocusRecord[] = [];

    expect(createFocusRecord(createMessage({
      authorName: '@CurrentUser',
      channelId: 'current-channel',
      text: 'replying to focuseduser'
    }), source, records, () => 1)).toMatchObject({
      side: 'us',
      text: 'replying to focuseduser'
    });

    expect(createFocusRecord(createMessage({
      authorName: '@CurrentUser',
      channelId: 'current-channel',
      text: 'talking to someone else'
    }), source, records, () => 2)).toBeNull();
  });

  it('ignores unrelated users', async () => {
    const { createFocusRecord } = await import('./records');

    expect(createFocusRecord(createMessage({
      authorName: '@OtherUser',
      channelId: 'other-channel',
      text: '@FocusedUser hello'
    }), { authorName: '@FocusedUser', channelId: 'focused-channel' }, [], () => 1)).toBeNull();
  });

  it('dedupes by stable message id but keeps repeated missing-id renderers', async () => {
    const { createFocusRecord } = await import('./records');
    const source: FocusSource = { authorName: '@FocusedUser', channelId: 'focused-channel' };
    const records: FocusRecord[] = [];
    let nextId = 1;

    const first = createFocusRecord(createMessage({
      authorName: '@FocusedUser',
      channelId: 'focused-channel',
      messageId: 'same-message-id',
      text: 'same'
    }), source, records, () => nextId++);
    if (first) records.push(first);

    expect(createFocusRecord(createMessage({
      authorName: '@FocusedUser',
      channelId: 'focused-channel',
      messageId: 'same-message-id',
      text: 'same'
    }), source, records, () => nextId++)).toBeNull();

    const repeatedA = createFocusRecord(createMessage({
      authorName: '@FocusedUser',
      channelId: 'focused-channel',
      text: 'repeated'
    }), source, records, () => nextId++);
    const repeatedB = createFocusRecord(createMessage({
      authorName: '@FocusedUser',
      channelId: 'focused-channel',
      text: 'repeated'
    }), source, records, () => nextId++);

    expect(repeatedA).toMatchObject({ text: 'repeated' });
    expect(repeatedB).toMatchObject({ text: 'repeated' });
  });
});

function createMessage({
  authorName,
  channelId,
  messageId,
  text,
  timestampText = '12:00 PM'
}: {
  authorName: string;
  channelId?: string;
  messageId?: string;
  text: string;
  timestampText?: string;
}): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer');
  if (messageId) message.setAttribute('data-message-id', messageId);
  const authorHtml = channelId
    ? `<a href="/channel/${channelId}"><span id="author-name">${authorName}</span></a>`
    : `<span id="author-name">${authorName}</span>`;
  message.innerHTML = `
    <span id="timestamp">${timestampText}</span>
    ${authorHtml}
    <span id="message">${text}</span>
  `;
  document.body.append(message);
  return message;
}
