import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  YOUTUBE_MESSAGE_DATA_EVENT,
  YOUTUBE_MESSAGE_DATA_REQUEST_EVENT
} from './message-data-events';

describe('YouTube message data page adapter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits sanitized data from requested messages, dedupes repeats, and retries late renderer data', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    document.body.replaceChildren();
    const events: CustomEvent<string>[] = [];
    window.addEventListener(YOUTUBE_MESSAGE_DATA_EVENT, (event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') events.push(event);
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

    expect(events).toEqual([]);

    message.dispatchEvent(new CustomEvent(YOUTUBE_MESSAGE_DATA_REQUEST_EVENT, {
      bubbles: true,
      composed: true
    }));

    expect(events).toHaveLength(1);
    expect(events[0].target).toBe(message);
    expect(JSON.parse(events[0].detail || '{}')).toEqual({
      authorExternalChannelId: 'UC123',
      authorName: '@Example',
      authorPhotoUrl: 'https://example.test/large.jpg',
      messageId: 'msg-1',
      timestampUsec: '1782000000000000'
    });

    message.dispatchEvent(new CustomEvent(YOUTUBE_MESSAGE_DATA_REQUEST_EVENT, {
      bubbles: true,
      composed: true
    }));

    expect(events).toHaveLength(1);

    const lateMessage = document.createElement('yt-live-chat-text-message-renderer') as HTMLElement & { data?: unknown };
    lateMessage.id = 'msg-2';
    document.body.append(lateMessage);
    lateMessage.dispatchEvent(new CustomEvent(YOUTUBE_MESSAGE_DATA_REQUEST_EVENT, {
      bubbles: true,
      composed: true
    }));

    expect(events).toHaveLength(1);

    lateMessage.data = {
      authorName: { simpleText: '@Late' },
      timestampUsec: '1782000000000001'
    };
    await vi.advanceTimersByTimeAsync(0);

    expect(events).toHaveLength(2);
    expect(events[1].target).toBe(lateMessage);
    expect(JSON.parse(events[1].detail || '{}')).toEqual({
      authorName: '@Late',
      messageId: 'msg-2',
      timestampUsec: '1782000000000001'
    });
  });
});
