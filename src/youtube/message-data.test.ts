import { describe, expect, it, vi } from 'vitest';
import {
  YOUTUBE_MESSAGE_DATA_EVENT,
  YOUTUBE_MESSAGE_DATA_REQUEST_EVENT
} from './message-data-events';

describe('YouTube message data receiver', () => {
  it('caches sanitized message data and notifies listeners with the matching DOM message', async () => {
    vi.resetModules();
    document.body.replaceChildren();
    const { getYouTubeMessageData, initYouTubeMessageData } = await import('./message-data');
    const listener = vi.fn();
    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.id = 'msg-1';
    document.body.append(message);

    initYouTubeMessageData(listener);
    window.dispatchEvent(new CustomEvent(YOUTUBE_MESSAGE_DATA_EVENT, {
      detail: JSON.stringify({
        authorExternalChannelId: 'UC123',
        authorName: '@Example',
        authorPhotoUrl: 'https://example.test/avatar.jpg',
        ignored: { raw: true },
        messageId: 'msg-1',
        timestampUsec: '1782000000000000'
      })
    }));

    expect(listener).toHaveBeenCalledWith(message, {
      authorExternalChannelId: 'UC123',
      authorName: '@Example',
      authorPhotoUrl: 'https://example.test/avatar.jpg',
      messageId: 'msg-1',
      timestampUsec: '1782000000000000'
    });
    expect(getYouTubeMessageData(message)).toMatchObject({
      messageId: 'msg-1',
      timestampUsec: '1782000000000000'
    });
  });

  it('requests YouTube message data on the specific message element', async () => {
    vi.resetModules();
    document.body.replaceChildren();
    const { requestYouTubeMessageData } = await import('./message-data');
    const message = document.createElement('yt-live-chat-text-message-renderer');
    const requests: Event[] = [];
    document.body.append(message);
    document.addEventListener(YOUTUBE_MESSAGE_DATA_REQUEST_EVENT, (event) => requests.push(event));

    requestYouTubeMessageData(message);

    expect(requests).toHaveLength(1);
    expect(requests[0].target).toBe(message);
  });

  it('ignores malformed event details and timestamp values', async () => {
    vi.resetModules();
    document.body.replaceChildren();
    const { initYouTubeMessageData } = await import('./message-data');
    const listener = vi.fn();
    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.id = 'msg-1';
    document.body.append(message);

    initYouTubeMessageData(listener);
    window.dispatchEvent(new CustomEvent(YOUTUBE_MESSAGE_DATA_EVENT, {
      detail: { messageId: 'msg-1', timestampUsec: '1782000000000000' }
    }));
    window.dispatchEvent(new CustomEvent(YOUTUBE_MESSAGE_DATA_EVENT, {
      detail: JSON.stringify({
        messageId: 'msg-1',
        timestampUsec: 'not-a-timestamp'
      })
    }));

    expect(listener).not.toHaveBeenCalled();
  });
});
