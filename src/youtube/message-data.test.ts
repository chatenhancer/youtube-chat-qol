import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  YOUTUBE_MESSAGE_DATA_EVENT,
  YOUTUBE_MESSAGE_DATA_REQUEST_EVENT
} from './message-data-events';

describe('YouTube message data receiver', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('caches sanitized message data and resolves the matching request promise', async () => {
    vi.resetModules();
    document.body.replaceChildren();
    const { getYouTubeMessageData, requestYouTubeMessageData } = await import('./message-data');
    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.id = 'msg-1';
    document.body.append(message);

    const messageData = requestYouTubeMessageData(message);
    const querySelectorAll = vi.spyOn(document, 'querySelectorAll');
    message.dispatchEvent(new CustomEvent(YOUTUBE_MESSAGE_DATA_EVENT, {
      bubbles: true,
      composed: true,
      detail: JSON.stringify({
        authorExternalChannelId: 'UC123',
        authorName: '@Example',
        authorPhotoUrl: 'https://example.test/avatar.jpg',
        ignored: { raw: true },
        messageId: 'msg-1',
        timestampUsec: '1782000000000000'
      })
    }));

    await expect(messageData).resolves.toEqual({
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
    expect(querySelectorAll).not.toHaveBeenCalled();

    await expect(requestYouTubeMessageData(message)).resolves.toMatchObject({
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

    await expect(requestYouTubeMessageData(message)).resolves.toBeNull();

    expect(requests).toHaveLength(1);
    expect(requests[0].target).toBe(message);
  });

  it('ignores malformed event details and resolves pending requests after a bounded wait', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    document.body.replaceChildren();
    const { requestYouTubeMessageData } = await import('./message-data');
    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.id = 'msg-1';
    document.body.append(message);

    let resolved = false;
    const messageData = requestYouTubeMessageData(message);
    messageData.then(() => {
      resolved = true;
    });
    message.dispatchEvent(new CustomEvent(YOUTUBE_MESSAGE_DATA_EVENT, {
      bubbles: true,
      composed: true,
      detail: { messageId: 'msg-1', timestampUsec: '1782000000000000' }
    }));
    message.dispatchEvent(new CustomEvent(YOUTUBE_MESSAGE_DATA_EVENT, {
      bubbles: true,
      composed: true,
      detail: JSON.stringify({
        messageId: 'msg-1',
        timestampUsec: 'not-a-timestamp'
      })
    }));
    await vi.advanceTimersByTimeAsync(1499);
    await Promise.resolve();

    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(messageData).resolves.toBeNull();
  });

  it('keeps pending requests open long enough for valid late data', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    document.body.replaceChildren();
    const { requestYouTubeMessageData } = await import('./message-data');
    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.id = 'msg-1';
    document.body.append(message);

    const messageData = requestYouTubeMessageData(message);
    await vi.advanceTimersByTimeAsync(200);

    message.dispatchEvent(new CustomEvent(YOUTUBE_MESSAGE_DATA_EVENT, {
      bubbles: true,
      composed: true,
      detail: JSON.stringify({
        messageId: 'msg-1',
        timestampUsec: '1782000000000000'
      })
    }));

    await expect(messageData).resolves.toEqual({
      messageId: 'msg-1',
      timestampUsec: '1782000000000000'
    });
  });
});
