import { afterEach, describe, expect, it } from 'vitest';
import {
  getCurrentYouTubeChatSourceUrl,
  getYouTubeChatSourceStorageKey
} from './source-url';

describe('YouTube chat source url helpers', () => {
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

    expect(getCurrentYouTubeChatSourceUrl()).toBe('https://www.youtube.com/watch?v=stream-1');
  });

  it('uses the watch-page referrer when running inside a live chat iframe', () => {
    window.history.replaceState({}, '', '/live_chat?continuation=iframe-token');
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: 'https://www.youtube.com/watch?v=stream-from-referrer'
    });

    expect(getCurrentYouTubeChatSourceUrl()).toBe('https://www.youtube.com/watch?v=stream-from-referrer');
  });

  it('falls back to a stable live-chat continuation url', () => {
    window.history.replaceState({}, '', '/live_chat_replay?continuation=chat-token&extra=ignored');

    expect(getCurrentYouTubeChatSourceUrl()).toBe('http://localhost:3000/live_chat_replay?continuation=chat-token');
  });

  it('falls back to the page path when no stream identifier exists', () => {
    window.history.replaceState({}, '', '/channel/example?ignored=1');

    expect(getCurrentYouTubeChatSourceUrl()).toBe('http://localhost:3000/channel/example');
  });

  it('creates stable per-video storage keys', () => {
    expect(getYouTubeChatSourceStorageKey('https://www.youtube.com/watch?v=stream-1')).toBe('video:stream-1');
  });
});
