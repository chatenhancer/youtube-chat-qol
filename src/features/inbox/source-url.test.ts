import { afterEach, describe, expect, it } from 'vitest';
import { getCurrentInboxSourceUrl } from './source-url';

describe('inbox source url scoping', () => {
  const originalReferrer = document.referrer;

  afterEach(() => {
    window.history.replaceState({}, '', '/');
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: originalReferrer
    });
  });

  it('normalizes watch pages to the video id only', () => {
    window.history.replaceState({}, '', '/watch?v=stream-1&t=30s');

    expect(getCurrentInboxSourceUrl()).toBe('https://www.youtube.com/watch?v=stream-1');
  });

  it('uses the watch-page referrer when running inside a live chat iframe', () => {
    window.history.replaceState({}, '', '/live_chat?continuation=iframe-token');
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: 'https://www.youtube.com/watch?v=stream-from-referrer'
    });

    expect(getCurrentInboxSourceUrl()).toBe('https://www.youtube.com/watch?v=stream-from-referrer');
  });

  it('falls back to a stable live-chat continuation url', () => {
    window.history.replaceState({}, '', '/live_chat_replay?continuation=chat-token&extra=ignored');

    expect(getCurrentInboxSourceUrl()).toBe('http://localhost:3000/live_chat_replay?continuation=chat-token');
  });

  it('falls back to the page path when no stream identifier exists', () => {
    window.history.replaceState({}, '', '/channel/example?ignored=1');

    expect(getCurrentInboxSourceUrl()).toBe('http://localhost:3000/channel/example');
  });
});
