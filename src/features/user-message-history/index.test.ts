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

  it('keeps an existing avatar when a stable message id re-renders without one', async () => {
    const history = await import('./index');
    const first = createMessage({
      authorName: '@AvatarKeeper',
      channelId: 'avatar-keeper-channel',
      messageId: 'message-1',
      text: 'first text'
    });
    first.querySelector('#author-photo')?.append(createAvatarImage('https://example.com/original.jpg'));
    const rerendered = createMessage({
      authorName: '@AvatarKeeper',
      channelId: 'avatar-keeper-channel',
      messageId: 'message-1',
      text: 'new text'
    });

    history.recordUserMessage(first);
    history.recordUserMessage(rerendered);

    expect(history.getAvatarSrcForIdentity({
      authorName: '@AvatarKeeper',
      channelId: 'avatar-keeper-channel'
    })).toBe('https://example.com/original.jpg');
  });

  it('ignores messages without usable author or text', async () => {
    const history = await import('./index');

    history.recordUserMessage(createMessage({
      authorName: '',
      messageId: 'message-0',
      text: 'has text but no identity'
    }));
    history.recordUserMessage(createMessage({
      authorName: '',
      channelId: 'empty-author',
      messageId: 'message-1',
      text: 'has text'
    }));
    history.recordUserMessage(createMessage({
      authorName: '@NoText',
      channelId: 'no-text',
      messageId: 'message-2',
      text: ''
    }));

    expect(history.getRecentMessagesForKey('message-content')).toEqual([]);
    expect(history.getRecentMessagesForIdentity({ channelId: 'empty-author', authorName: '' })).toEqual([]);
    expect(history.getRecentMessagesForIdentity({ channelId: 'no-text', authorName: '@NoText' })).toEqual([]);
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

  it('does not duplicate unchanged records for the same renderer state', async () => {
    const history = await import('./index');
    const listener = vi.fn();
    history.onUserMessagesChanged(listener);
    const message = createMessage({
      authorName: '@StableRenderer',
      channelId: 'stable-renderer-channel',
      messageId: 'message-1',
      text: 'same text'
    });

    history.recordUserMessage(message);
    history.recordUserMessage(message);

    expect(history.getRecentMessagesForIdentity({
      authorName: '@StableRenderer',
      channelId: 'stable-renderer-channel'
    })).toHaveLength(1);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('moves a record when the same renderer changes to another author identity', async () => {
    const history = await import('./index');
    const message = createMessage({
      authorName: '@FirstAuthor',
      channelId: 'first-channel',
      messageId: 'message-1',
      text: 'first message'
    });

    history.recordUserMessage(message);
    message.data = {
      authorExternalChannelId: 'second-channel',
      authorName: { simpleText: '@SecondAuthor' },
      id: 'message-2',
      message: { runs: [{ text: 'second message' }] }
    };
    message.innerHTML = `
      <span id="timestamp">12:00 PM</span>
      <span id="author-photo"></span>
      <span id="author-name">@SecondAuthor</span>
      <span id="message">second message</span>
    `;
    history.recordUserMessage(message);

    expect(history.getRecentMessagesForIdentity({
      authorName: '@FirstAuthor',
      channelId: 'first-channel'
    })).toEqual([]);
    expect(history.getRecentMessagesForIdentity({
      authorName: '@SecondAuthor',
      channelId: 'second-channel'
    })).toMatchObject([{ text: 'second message' }]);
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

  it('prunes the oldest users when the in-memory user cap is exceeded', async () => {
    const history = await import('./index');
    for (let index = 0; index < 161; index += 1) {
      vi.mocked(Date.now).mockReturnValue(new Date(Date.UTC(2026, 4, 31, 12, 0, index)).getTime());
      history.recordUserMessage(createMessage({
        authorName: `@User${index}`,
        channelId: `channel-${index}`,
        messageId: `message-${index}`,
        text: `message ${index}`
      }));
    }

    expect(history.findRecentUsersByHandle('@User0')).toEqual([]);
    expect(history.findRecentUsersByHandle('@User160')).toMatchObject([
      {
        authorName: '@User160',
        latestMessage: { text: 'message 160' }
      }
    ]);
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

  it('falls back to author-name records when no channel id is known', async () => {
    const history = await import('./index');
    history.recordUserMessage(createMessage({
      authorName: '@FallbackHandle',
      messageId: 'message-1',
      text: 'author-only message'
    }));

    expect(history.getRecentMessagesForIdentity({ authorName: '@FallbackHandle' }))
      .toMatchObject([
        {
          authorName: '@FallbackHandle',
          text: 'author-only message'
        }
      ]);
  });

  it('dedupes channel and author fallback records with the same stable message id', async () => {
    const history = await import('./index');
    history.recordUserMessage(createMessage({
      authorName: '@DualIdentity',
      channelId: 'dual-channel',
      messageId: 'shared-message-id',
      text: 'channel-backed copy'
    }));
    history.recordUserMessage(createMessage({
      authorName: '@DualIdentity',
      messageId: 'shared-message-id',
      text: 'author fallback copy'
    }));

    expect(history.getRecentMessagesForIdentity({
      authorName: '@DualIdentity',
      channelId: 'dual-channel'
    })).toMatchObject([
      { text: 'channel-backed copy' }
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

  it('keeps author names without handles in recent user matches', async () => {
    const history = await import('./index');
    history.recordUserMessage(createMessage({
      authorName: '😀',
      channelId: 'emoji-author-channel',
      messageId: 'message-0',
      text: 'message from emoji display name'
    }));
    history.recordUserMessage(createMessage({
      authorName: 'Display Name',
      channelId: 'display-name-channel',
      messageId: 'message-1',
      text: 'message from display name'
    }));

    expect(history.findRecentUsersByHandle('display')).toMatchObject([
      {
        authorName: 'Display Name',
        latestMessage: { text: 'message from display name' }
      }
    ]);
  });

  it('returns no handle matches for blank queries', async () => {
    const history = await import('./index');

    expect(history.findRecentUsersByHandle('   ')).toEqual([]);
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

  it('records visible live messages from the document', async () => {
    const history = await import('./index');
    createMessage({
      authorName: '@VisibleUser',
      channelId: 'visible-channel',
      messageId: 'message-1',
      text: 'visible message'
    });

    history.recordVisibleUserMessages();

    expect(history.getRecentMessagesForKey('channel:visible-channel')).toMatchObject([
      { text: 'visible message' }
    ]);
  });

  it('records changed messages from the lifecycle mutation collector', async () => {
    const history = await import('./index');
    const lifecycle = await import('../../content/lifecycle');
    const message = createMessage({
      authorName: '@MutationUser',
      channelId: 'mutation-channel',
      messageId: 'message-1',
      text: 'mutation message'
    });

    lifecycle.handleFeatureMutations({
      addedElements: [],
      changedMessages: [message],
      mutations: []
    });

    expect(history.getRecentMessagesForIdentity({
      authorName: '@MutationUser',
      channelId: 'mutation-channel'
    })).toMatchObject([{ text: 'mutation message' }]);
  });

  it('uses elapsed replay timestamps for replay chat pages', async () => {
    window.history.replaceState({}, '', '/live_chat_replay?continuation=replay-token');
    const history = await import('./index');
    history.recordUserMessage(createMessage({
      authorName: '@ReplayUser',
      channelId: 'replay-channel',
      messageId: 'message-1',
      text: 'replay message',
      timestampText: '0:09'
    }));
    const expectedTimestamp = new Date(Date.now());
    expectedTimestamp.setHours(0, 0, 9, 0);

    expect(history.getLatestMessageForIdentity({
      authorName: '@ReplayUser',
      channelId: 'replay-channel'
    })?.timestamp).toBe(expectedTimestamp.getTime());
  });

  it('falls back to the recorded time when a visible timestamp cannot be parsed', async () => {
    const history = await import('./index');
    const recordedAt = Date.now();
    history.recordUserMessage(createMessage({
      authorName: '@TimestampFallback',
      channelId: 'timestamp-fallback-channel',
      messageId: 'message-1',
      text: 'fallback timestamp',
      timestampText: 'not a timestamp'
    }));

    expect(history.getLatestMessageForIdentity({
      authorName: '@TimestampFallback',
      channelId: 'timestamp-fallback-channel'
    })?.timestamp).toBe(recordedAt);
  });

  it('mirrors rendered and cleared translations into recent message records', async () => {
    const history = await import('./index');
    const lifecycle = await import('../../content/lifecycle');
    const events = await import('../translation/events');
    lifecycle.initFeatures({ saveOptions: vi.fn() });
    const message = createMessage({
      authorName: '@TranslatedUser',
      channelId: 'translated-channel',
      messageId: 'message-1',
      text: 'hola'
    });
    history.recordUserMessage(message);

    events.emitMessageTranslationRendered({
      message,
      originalText: 'hola',
      protectedTokens: [{ fallbackText: '@TranslatedUser', node: null, nodes: [], placeholder: '§0§' }],
      result: { sourceLanguage: 'es', targetLanguage: 'en', text: 'hello' },
      sourceText: 'hola'
    });

    expect(history.getLatestMessageForIdentity({
      authorName: '@TranslatedUser',
      channelId: 'translated-channel'
    })?.translation).toMatchObject({
      originalText: 'hola',
      result: { text: 'hello' }
    });

    events.emitMessageTranslationCleared(message);
    expect(history.getLatestMessageForIdentity({
      authorName: '@TranslatedUser',
      channelId: 'translated-channel'
    })?.translation).toBeUndefined();

    events.emitMessageTranslationRendered({
      message,
      originalText: 'hola',
      protectedTokens: [],
      result: { sourceLanguage: 'es', targetLanguage: 'en', text: 'hello again' },
      sourceText: 'hola'
    });
    events.emitMessageTranslationsCleared();
    expect(history.getLatestMessageForIdentity({
      authorName: '@TranslatedUser',
      channelId: 'translated-channel'
    })?.translation).toBeUndefined();
  });

  it('records a not-yet-seen message when a translation render event arrives for it', async () => {
    const history = await import('./index');
    const lifecycle = await import('../../content/lifecycle');
    const events = await import('../translation/events');
    lifecycle.initFeatures({ saveOptions: vi.fn() });
    const message = createMessage({
      authorName: '@EventFirstTranslation',
      channelId: 'event-first-channel',
      messageId: 'message-1',
      text: 'hola'
    });

    events.emitMessageTranslationRendered({
      message,
      originalText: 'hola',
      protectedTokens: [],
      result: { sourceLanguage: 'es', targetLanguage: 'en', text: 'hello' },
      sourceText: 'hola'
    });

    expect(history.getLatestMessageForIdentity({
      authorName: '@EventFirstTranslation',
      channelId: 'event-first-channel'
    })?.translation).toMatchObject({
      result: { text: 'hello' }
    });
  });

  it('ignores translation events for unknown messages and missing translations', async () => {
    const history = await import('./index');
    const lifecycle = await import('../../content/lifecycle');
    const events = await import('../translation/events');
    lifecycle.initFeatures({ saveOptions: vi.fn() });
    lifecycle.initFeatures({ saveOptions: vi.fn() });
    const message = createMessage({
      authorName: '@NoTranslationYet',
      channelId: 'no-translation-channel',
      messageId: 'message-1',
      text: 'hola'
    });
    const unknownMessage = createMessage({
      authorName: '@UnknownTranslation',
      channelId: 'unknown-translation-channel',
      messageId: 'message-2',
      text: 'hola'
    });
    history.recordUserMessage(message);

    events.emitMessageTranslationRendered({
      message: unknownMessage,
      originalText: 'hola',
      protectedTokens: [],
      result: { sourceLanguage: 'es', targetLanguage: 'en', text: 'hello' },
      sourceText: 'hola'
    });
    events.emitMessageTranslationCleared(message);

    expect(history.getLatestMessageForIdentity({
      authorName: '@NoTranslationYet',
      channelId: 'no-translation-channel'
    })?.translation).toBeUndefined();
  });

  it('only notifies users whose stored translation records were cleared', async () => {
    const history = await import('./index');
    const lifecycle = await import('../../content/lifecycle');
    const events = await import('../translation/events');
    lifecycle.initFeatures({ saveOptions: vi.fn() });
    const translated = createMessage({
      authorName: '@TranslatedOne',
      channelId: 'translated-one-channel',
      messageId: 'message-1',
      text: 'hola'
    });
    const untranslated = createMessage({
      authorName: '@UntranslatedOne',
      channelId: 'untranslated-one-channel',
      messageId: 'message-2',
      text: 'adios'
    });
    const listener = vi.fn();
    history.recordUserMessage(translated);
    history.recordUserMessage(untranslated);
    history.onUserMessagesChanged(listener);
    events.emitMessageTranslationRendered({
      message: translated,
      originalText: 'hola',
      protectedTokens: [],
      result: { sourceLanguage: 'es', targetLanguage: 'en', text: 'hello' },
      sourceText: 'hola'
    });
    listener.mockClear();

    events.emitMessageTranslationsCleared();

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('channel:translated-one-channel');
    expect(history.getLatestMessageForIdentity({
      authorName: '@TranslatedOne',
      channelId: 'translated-one-channel'
    })?.translation).toBeUndefined();
    expect(history.getLatestMessageForIdentity({
      authorName: '@UntranslatedOne',
      channelId: 'untranslated-one-channel'
    })?.text).toBe('adios');
  });

  it('returns null when a recorded element no longer has a matching user record', async () => {
    const history = await import('./index');
    const message = createMessage({
      authorName: '@RemovedRecord',
      channelId: 'removed-record-channel',
      messageId: 'message-1',
      text: 'first record'
    });
    history.recordUserMessage(message);
    for (let index = 0; index < 161; index += 1) {
      vi.mocked(Date.now).mockReturnValue(new Date(Date.UTC(2026, 4, 31, 12, 1, index)).getTime());
      history.recordUserMessage(createMessage({
        authorName: `@PruneUser${index}`,
        channelId: `prune-channel-${index}`,
        messageId: `prune-message-${index}`,
        text: `prune message ${index}`
      }));
    }

    expect(history.getUserMessageRecordForMessage(message)).toBeNull();
  });

  it('returns null and empty values when identity or record data is unavailable', async () => {
    const history = await import('./index');

    expect(history.getLatestMessageForIdentity({ authorName: '@MissingUser' })).toBeNull();
    expect(history.getRecentMessagesForIdentity({ authorName: '' })).toEqual([]);
    expect(history.getAvatarSrcForIdentity({ authorName: '@MissingUser' })).toBe('');
    expect(history.getLiveMessageForRecord({
      authorName: '@Detached',
      contentParts: [],
      id: 1,
      text: 'detached',
      timestamp: 1,
      timestampText: '12:00 PM'
    })).toBeNull();
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
  image.id = 'img';
  image.setAttribute('src', src);
  return image;
}
