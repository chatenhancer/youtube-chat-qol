import { describe, expect, it } from 'vitest';
import {
  getMessageProfileSource,
  getParticipantProfileSource
} from './source';

describe('profile source extraction', () => {
  it('extracts profile source data from chat message renderers', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer') as HTMLElement & {
      data?: unknown;
    };
    message.data = {
      authorExternalChannelId: 'channel-1',
      authorName: { simpleText: '@ExampleCreator' }
    };
    message.innerHTML = '<span id="author-name">@Fallback</span><div id="author-photo"><img src="https://example.test/avatar.png"></div>';

    expect(getMessageProfileSource(message)).toEqual({
      authorName: '@ExampleCreator',
      avatarSrc: 'https://example.test/avatar.png',
      identity: {
        authorName: '@ExampleCreator',
        channelId: 'channel-1'
      },
      profileUrl: 'https://www.youtube.com/channel/channel-1'
    });
  });

  it('extracts profile source data from participant rows and strips badge text', () => {
    const participant = document.createElement('yt-live-chat-participant-renderer') as HTMLElement & {
      data?: unknown;
    };
    participant.data = {
      authorChannelId: 'channel-2',
      authorName: {
        runs: [
          { text: '@ParticipantUser' },
          { text: ' Verified' }
        ]
      }
    };
    participant.innerHTML = '<span id="author-name">@FallbackUser <span>Verified</span></span><yt-img-shadow><img src="https://example.test/participant.png"></yt-img-shadow>';

    expect(getParticipantProfileSource(participant)).toEqual({
      authorName: '@ParticipantUser',
      avatarSrc: 'https://example.test/participant.png',
      identity: {
        authorName: '@ParticipantUser',
        channelId: 'channel-2'
      },
      profileUrl: 'https://www.youtube.com/channel/channel-2'
    });
  });

  it('returns null when required author or avatar data is missing', () => {
    expect(getMessageProfileSource(document.createElement('yt-live-chat-text-message-renderer'))).toBeNull();
    expect(getParticipantProfileSource(document.createElement('yt-live-chat-participant-renderer'))).toBeNull();
  });
});
