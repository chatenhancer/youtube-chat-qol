import { describe, expect, it } from 'vitest';
import {
  getMessageProfileSource,
  getParticipantProfileSource
} from './source';

describe('profile source extraction', () => {
  it('extracts profile source data from chat message renderers', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.innerHTML = '<a href="/channel/dom-channel-1"><span id="author-name">@ExampleCreator</span></a><div id="author-photo"><img src="https://example.test/avatar.png"></div>';

    expect(getMessageProfileSource(message)).toEqual({
      authorName: '@ExampleCreator',
      avatarSrc: 'https://example.test/avatar.png',
      identity: {
        authorName: '@ExampleCreator',
        channelId: 'dom-channel-1'
      },
      profileUrl: 'https://www.youtube.com/channel/dom-channel-1'
    });
  });

  it('extracts profile source data from participant rows and strips badge text', () => {
    const participant = document.createElement('yt-live-chat-participant-renderer');
    participant.innerHTML = '<a href="/channel/dom-channel-2"><span id="author-name">@ParticipantUser <span>Verified</span></span></a><yt-img-shadow><img src="https://example.test/participant.png"></yt-img-shadow>';

    expect(getParticipantProfileSource(participant)).toEqual({
      authorName: '@ParticipantUser',
      avatarSrc: 'https://example.test/participant.png',
      identity: {
        authorName: '@ParticipantUser',
        channelId: 'dom-channel-2'
      },
      profileUrl: 'https://www.youtube.com/channel/dom-channel-2'
    });
  });

  it('returns null when required author or avatar data is missing', () => {
    expect(getMessageProfileSource(document.createElement('yt-live-chat-text-message-renderer'))).toBeNull();
    expect(getParticipantProfileSource(document.createElement('yt-live-chat-participant-renderer'))).toBeNull();
  });
});
