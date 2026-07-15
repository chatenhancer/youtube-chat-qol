import { describe, expect, it } from 'vitest';
import { isYouTubeChatFeedLocation, isYouTubeChatFeedPath } from './pages';

describe('YouTube chat feed pages', () => {
  it.each([
    ['www.youtube.com', '/live_chat'],
    ['www.youtube.com', '/live_chat_replay'],
    ['youtube.com', '/live_chat'],
    ['studio.youtube.com', '/live_chat'],
    ['studio.youtube.com', '/live_chat_replay']
  ])('supports %s%s', (hostname, pathname) => {
    expect(isYouTubeChatFeedLocation({ hostname, pathname })).toBe(true);
  });

  it.each([
    ['m.youtube.com', '/live_chat'],
    ['studio.youtube.com', '/watch'],
    ['example.com', '/live_chat']
  ])('rejects %s%s', (hostname, pathname) => {
    expect(isYouTubeChatFeedLocation({ hostname, pathname })).toBe(false);
  });

  it.each(['/live_chat', '/live_chat_replay'])('recognizes the injected chat path %s', (pathname) => {
    expect(isYouTubeChatFeedPath(pathname)).toBe(true);
  });
});
