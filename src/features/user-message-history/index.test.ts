import { beforeEach, describe, expect, it, vi } from 'vitest';

interface TestRendererData {
  authorExternalChannelId?: string;
  authorName?: { simpleText: string };
  id?: string;
  message?: { runs: { text: string }[] };
}

type TestMessageElement = HTMLElement & {
  data?: TestRendererData;
};

describe('user message history', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.replaceChildren();
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-05-31T12:00:00Z').getTime());
  });

  it('updates existing records when YouTube re-renders a stable message id', async () => {
    const history = await import('./index');
    const first = createMessage({
      authorName: '@ExampleCreator',
      channelId: 'channel-1',
      messageId: 'message-1',
      text: 'first text'
    });
    const rerendered = createMessage({
      authorName: '@ExampleCreator',
      channelId: 'channel-1',
      messageId: 'message-1',
      text: 'edited text'
    });

    history.recordUserMessage(first);
    history.recordUserMessage(rerendered);

    expect(history.getRecentMessagesForIdentity({ channelId: 'channel-1', authorName: '@ExampleCreator' }))
      .toMatchObject([
        {
          messageId: 'message-1',
          text: 'edited text'
        }
      ]);
  });

  it('keeps repeated identical messages without stable ids when they come from different live renderers', async () => {
    const history = await import('./index');
    const first = createMessage({
      authorName: '@Repeater',
      channelId: 'channel-2',
      text: 'same message'
    });
    const second = createMessage({
      authorName: '@Repeater',
      channelId: 'channel-2',
      text: 'same message'
    });

    history.recordUserMessage(first);
    history.recordUserMessage(second);

    expect(history.getRecentMessagesForIdentity({ channelId: 'channel-2', authorName: '@Repeater' })
      .map((record) => record.text)).toEqual(['same message', 'same message']);
  });

  it('updates one record when the same renderer receives late text changes', async () => {
    const history = await import('./index');
    const message = createMessage({
      authorName: '@LateText',
      channelId: 'channel-3',
      text: 'loading'
    });

    history.recordUserMessage(message);
    message.querySelector('#message')!.textContent = 'loaded text';
    message.data!.message = { runs: [{ text: 'loaded text' }] };
    history.recordUserMessage(message);

    expect(history.getRecentMessagesForIdentity({ channelId: 'channel-3', authorName: '@LateText' }))
      .toMatchObject([
        {
          text: 'loaded text'
        }
      ]);
  });

  it('keeps only the newest messages per user', async () => {
    const history = await import('./index');
    Array.from({ length: 13 }, (_, index) => {
      history.recordUserMessage(createMessage({
        authorName: '@BusyUser',
        channelId: 'channel-4',
        messageId: `message-${index}`,
        text: `message ${index}`
      }));
    });

    const messages = history.getRecentMessagesForIdentity({ channelId: 'channel-4', authorName: '@BusyUser' });

    expect(messages).toHaveLength(12);
    expect(messages[0].text).toBe('message 1');
    expect(messages.at(-1)?.text).toBe('message 12');
  });

  it('finds channel-id records even when the visible handle changes', async () => {
    const history = await import('./index');
    history.recordUserMessage(createMessage({
      authorName: '@OldHandle',
      channelId: 'stable-channel',
      messageId: 'message-1',
      text: 'message before rename'
    }));

    expect(history.getRecentMessagesForIdentity({ channelId: 'stable-channel', authorName: '@NewHandle' }))
      .toMatchObject([
        {
          authorName: '@OldHandle',
          text: 'message before rename'
        }
      ]);
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
}): TestMessageElement {
  const message = document.createElement('yt-live-chat-text-message-renderer') as TestMessageElement;
  message.data = {
    authorExternalChannelId: channelId,
    authorName: { simpleText: authorName },
    id: messageId,
    message: { runs: [{ text }] }
  };
  message.innerHTML = `
    <span id="timestamp">${timestampText}</span>
    <span id="author-name">${authorName}</span>
    <span id="message">${text}</span>
  `;
  document.body.append(message);
  return message;
}
