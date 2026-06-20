import { describe, expect, it } from 'vitest';
import {
  getParticipantAuthorName,
  getParticipantAvatarElement,
  getParticipantAvatarSrc,
  getParticipantChannelId
} from './participants';

describe('YouTube participant adapter', () => {
  it('reads author, channel, and avatar details from visible DOM', () => {
    const participant = document.createElement('yt-live-chat-participant-renderer');
    participant.innerHTML = '<a href="/channel/dom-channel"><span id="author-name">@FallbackUser <span>Verified</span></span></a><yt-img-shadow><img src="https://example.test/avatar.png"></yt-img-shadow>';

    expect(getParticipantAuthorName(participant)).toBe('@FallbackUser');
    expect(getParticipantChannelId(participant)).toBe('dom-channel');
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
