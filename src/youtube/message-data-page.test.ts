import { describe, expect, it, vi } from 'vitest';
import {
  YOUTUBE_MESSAGE_DATA_EVENT,
  YOUTUBE_MESSAGE_DATA_REQUEST_EVENT
} from './message-data-events';

describe('YouTube message data page adapter', () => {
  it('emits sanitized data only when a specific message is requested', async () => {
    vi.resetModules();
    document.body.replaceChildren();
    const details: string[] = [];
    window.addEventListener(YOUTUBE_MESSAGE_DATA_EVENT, (event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') details.push(event.detail);
    });
    await import('./message-data-page');

    const message = document.createElement('yt-live-chat-text-message-renderer') as HTMLElement & { data?: unknown };
    message.id = 'msg-1';
    message.data = {
      authorExternalChannelId: 'UC123',
      authorName: { runs: [{ text: '@Example' }] },
      authorPhoto: {
        thumbnails: [
          { url: 'https://example.test/small.jpg' },
          { url: 'https://example.test/large.jpg' }
        ]
      },
      ignored: { raw: true },
      timestampUsec: '1782000000000000'
    };
    document.body.append(message);

    expect(details).toEqual([]);

    message.dispatchEvent(new CustomEvent(YOUTUBE_MESSAGE_DATA_REQUEST_EVENT, {
      bubbles: true,
      composed: true
    }));

    expect(details).toHaveLength(1);
    expect(JSON.parse(details[0] || '{}')).toEqual({
      authorExternalChannelId: 'UC123',
      authorName: '@Example',
      authorPhotoUrl: 'https://example.test/large.jpg',
      messageId: 'msg-1',
      timestampUsec: '1782000000000000'
    });
  });
});
