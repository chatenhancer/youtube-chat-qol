import { describe, expect, it } from 'vitest';
import {
  getParticipantAuthorName,
  getParticipantAvatarElement,
  getParticipantAvatarSrc,
  getParticipantChannelId
} from './participants';

describe('YouTube participant adapter', () => {
  it('reads author, channel, and avatar data from renderer data and DOM', () => {
    const participant = document.createElement('yt-live-chat-participant-renderer') as HTMLElement & {
      data?: unknown;
    };
    participant.data = {
      authorExternalChannelId: 'channel-1',
      authorName: {
        runs: [
          { text: '@ParticipantUser' },
          { text: ' Verified' }
        ]
      }
    };
    participant.innerHTML = '<span id="author-name">@FallbackUser <span>Verified</span></span><yt-img-shadow><img src="https://example.test/avatar.png"></yt-img-shadow>';

    expect(getParticipantAuthorName(participant)).toBe('@ParticipantUser');
    expect(getParticipantChannelId(participant)).toBe('channel-1');
    expect(getParticipantAvatarSrc(participant)).toBe('https://example.test/avatar.png');
    expect(getParticipantAvatarElement(participant)?.tagName.toLowerCase()).toBe('yt-img-shadow');
  });

  it('falls back to visible participant DOM text while stripping badge text', () => {
    const participant = document.createElement('yt-live-chat-participant-renderer');
    participant.innerHTML = '<span id="author-name">@FallbackUser <span>Verified</span></span>';

    expect(getParticipantAuthorName(participant)).toBe('@FallbackUser');
    expect(getParticipantChannelId(participant)).toBe('');
    expect(getParticipantAvatarSrc(participant)).toBe('');
  });
});
