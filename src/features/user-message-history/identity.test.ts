import { describe, expect, it } from 'vitest';
import {
  getAuthorKey,
  getIdentityFromUserKey,
  getNormalizedHandle,
  getUserKey,
  getUserKeyFromIdentity
} from './identity';

describe('user message identity helpers', () => {
  it('prefers channel IDs when available', () => {
    const message = createMessage('@ExampleViewer', 'channel-123');

    expect(getUserKey(message)).toBe('channel:channel-123');
    expect(getUserKeyFromIdentity({ authorName: '@ExampleViewer', channelId: 'channel-123' }))
      .toBe('channel:channel-123');
  });

  it('falls back to normalized author keys', () => {
    expect(getAuthorKey('  @Example.Viewer  ')).toBe('author:@example.viewer');
    expect(getUserKey(createMessage('@ExampleViewer'))).toBe('author:@exampleviewer');
  });

  it('round-trips channel keys back to user identities', () => {
    expect(getIdentityFromUserKey('channel:abc123', '@ExampleViewer')).toEqual({
      authorName: '@ExampleViewer',
      channelId: 'abc123'
    });
    expect(getIdentityFromUserKey('author:@exampleviewer', '@ExampleViewer')).toEqual({
      authorName: '@ExampleViewer'
    });
  });

  it('normalizes handle queries without the leading at sign', () => {
    expect(getNormalizedHandle('@@ExampleViewer')).toBe('exampleviewer');
    expect(getNormalizedHandle(' example-viewer ')).toBe('example-viewer');
  });
});

function createMessage(authorName: string, channelId = ''): HTMLElement & {
  data?: { authorExternalChannelId?: string; authorName: { simpleText: string } };
} {
  const message = document.createElement('yt-live-chat-text-message-renderer') as HTMLElement & {
    data?: { authorExternalChannelId?: string; authorName: { simpleText: string } };
  };
  message.data = {
    authorExternalChannelId: channelId,
    authorName: { simpleText: authorName }
  };
  message.innerHTML = `<span id="author-name">${authorName}</span>`;
  return message;
}
