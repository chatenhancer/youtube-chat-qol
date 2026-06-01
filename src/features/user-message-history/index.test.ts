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

  it('finds recently seen users by exact handle before prefix matches', async () => {
    const history = await import('./index');
    history.recordUserMessage(createMessage({
      authorName: '@Viewer',
      channelId: 'viewer-channel',
      messageId: 'message-1',
      text: 'exact handle'
    }));
    history.recordUserMessage(createMessage({
      authorName: '@ViewerExtra',
      channelId: 'viewer-extra-channel',
      messageId: 'message-2',
      text: 'prefix handle'
    }));

    expect(history.findRecentUsersByHandle('@Viewer')).toMatchObject([
      {
        authorName: '@Viewer',
        identity: { channelId: 'viewer-channel' },
        latestMessage: { text: 'exact handle' }
      }
    ]);
    expect(history.findRecentUsersByHandle('@View')).toHaveLength(2);
  });

  it('dedupes recent user matches that share the same handle fallback', async () => {
    const history = await import('./index');
    history.recordUserMessage(createMessage({
      authorName: '@SameHandle',
      messageId: 'message-1',
      text: 'first fallback record'
    }));
    history.recordUserMessage(createMessage({
      authorName: '@SameHandle',
      messageId: 'message-2',
      text: 'second fallback record'
    }));

    const matches = history.findRecentUsersByHandle('@SameHandle');

    expect(matches).toHaveLength(1);
    expect(matches[0].latestMessage.text).toBe('second fallback record');
  });

  it('notifies listeners when a user history record changes and stops after unsubscribe', async () => {
    const history = await import('./index');
    const listener = vi.fn();
    const unsubscribe = history.onUserMessagesChanged(listener);

    history.recordUserMessage(createMessage({
      authorName: '@ListenerTarget',
      channelId: 'listener-channel',
      messageId: 'message-1',
      text: 'first notification'
    }));
    unsubscribe();
    history.recordUserMessage(createMessage({
      authorName: '@ListenerTarget',
      channelId: 'listener-channel',
      messageId: 'message-2',
      text: 'second notification'
    }));

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('channel:listener-channel');
  });

  it('returns the latest message, avatar, and connected live element for an identity', async () => {
    const history = await import('./index');
    const first = createMessage({
      authorName: '@CardViewer',
      channelId: 'card-channel',
      messageId: 'message-1',
      text: 'older message'
    });
    first.querySelector('#author-photo')?.append(createAvatarImage('https://example.com/avatar.jpg'));
    const latest = createMessage({
      authorName: '@CardViewer',
      channelId: 'card-channel',
      messageId: 'message-2',
      text: 'newer message'
    });
    history.recordUserMessage(first);
    history.recordUserMessage(latest);

    const latestRecord = history.getLatestMessageForIdentity({
      authorName: '@CardViewer',
      channelId: 'card-channel'
    });

    expect(latestRecord).toMatchObject({ text: 'newer message' });
    expect(history.getAvatarSrcForIdentity({
      authorName: '@CardViewer',
      channelId: 'card-channel'
    })).toBe('https://example.com/avatar.jpg');
    expect(history.getLiveMessageForRecord(latestRecord!)).toBe(latest);

    latest.remove();
    expect(history.getLiveMessageForRecord(latestRecord!)).toBeNull();
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
    <span id="author-photo"></span>
    <span id="author-name">${authorName}</span>
    <span id="message">${text}</span>
  `;
  document.body.append(message);
  return message;
}

function createAvatarImage(src: string): HTMLImageElement {
  const image = document.createElement('img');
  image.src = src;
  return image;
}
