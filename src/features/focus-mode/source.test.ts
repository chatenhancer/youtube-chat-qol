import { describe, expect, it } from 'vitest';
import {
  getFocusMentionPrefix,
  getFocusSourceFromMessage,
  isSameFocusSource,
  normalizeFocusSource,
  textMentionsFocusSource
} from './source';

describe('focus mode source helpers', () => {
  it('normalizes verified author names before focus use', () => {
    expect(normalizeFocusSource({
      authorName: '@ExampleCreator Verified',
      channelId: 'channel-1'
    })).toEqual({
      authorName: '@ExampleCreator',
      avatarSrc: '',
      channelId: 'channel-1'
    });
  });

  it('builds a focus source from renderer data and avatar DOM', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer') as HTMLElement & {
      data?: {
        authorExternalChannelId?: string;
        authorName?: { simpleText: string };
      };
    };
    message.data = {
      authorExternalChannelId: 'channel-1',
      authorName: { simpleText: '@ExampleCreator Verified' }
    };
    message.innerHTML = '<div id="author-photo"><img src="https://example.test/avatar.png"></div>';

    expect(getFocusSourceFromMessage(message)).toEqual({
      authorName: '@ExampleCreator',
      avatarSrc: 'https://example.test/avatar.png',
      channelId: 'channel-1'
    });
  });

  it('matches sources by channel id before falling back to author name', () => {
    expect(isSameFocusSource(
      { authorName: '@FirstName', channelId: 'same-channel' },
      { authorName: '@DifferentName', channelId: 'same-channel' }
    )).toBe(true);

    expect(isSameFocusSource(
      { authorName: '@ExampleCreator' },
      { authorName: '@examplecreator' }
    )).toBe(true);
  });

  it('matches focused-user mentions with or without at-sign at handle boundaries', () => {
    const source = { authorName: '@ExampleCreator' };

    expect(textMentionsFocusSource('thanks @ExampleCreator!', source)).toBe(true);
    expect(textMentionsFocusSource('thanks examplecreator', source)).toBe(true);
    expect(textMentionsFocusSource('thanks examplecreator123', source)).toBe(false);
    expect(getFocusMentionPrefix(source)).toBe('@ExampleCreator ');
  });
});
