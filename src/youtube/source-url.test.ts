import { afterEach, describe, expect, it } from 'vitest';
import {
  getCurrentYouTubeChatStreamKey,
  getCurrentYouTubeChatSourceTitle,
  getCurrentYouTubeChatSourceUrl,
  getYouTubeChatSourceStorageKey
} from './source-url';

describe('YouTube chat source url helpers', () => {
  const originalReferrer = document.referrer;
  const originalTopWindow = window.top;
  const originalParentWindow = window.parent;

  afterEach(() => {
    window.history.replaceState({}, '', '/');
    document.head.replaceChildren();
    document.title = '';
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: originalReferrer
    });
    Object.defineProperty(window, 'top', {
      configurable: true,
      value: originalTopWindow
    });
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: originalParentWindow
    });
  });

  it('normalizes watch pages to the video id only', () => {
    window.history.replaceState({}, '', '/watch?v=stream-1&t=30s');

    expect(getCurrentYouTubeChatSourceUrl()).toBe('https://www.youtube.com/watch?v=stream-1');
  });

  it('normalizes chat iframe urls with video ids to watch urls', () => {
    window.history.replaceState({}, '', '/live_chat?video_id=stream-from-chat&is_popout=1');

    expect(getCurrentYouTubeChatSourceUrl()).toBe('https://www.youtube.com/watch?v=stream-from-chat');
    expect(getCurrentYouTubeChatStreamKey()).toBe('stream-from-chat');

    window.history.replaceState({}, '', '/live_chat_replay?v=stream-from-replay&continuation=iframe-token');

    expect(getCurrentYouTubeChatSourceUrl()).toBe('https://www.youtube.com/watch?v=stream-from-replay');
  });

  it('uses the watch-page referrer when running inside a live chat iframe', () => {
    window.history.replaceState({}, '', '/live_chat?continuation=iframe-token');
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: 'https://www.youtube.com/watch?v=stream-from-referrer'
    });

    expect(getCurrentYouTubeChatSourceUrl()).toBe('https://www.youtube.com/watch?v=stream-from-referrer');
  });

  it('recovers the video id from direct live chat continuation urls when YouTube encodes it there', () => {
    window.history.replaceState(
      {},
      '',
      '/live_chat?continuation=0ofMyAOAARpeQ2lrcUp3b1lWVU0xVDNKRWRrdzVSSE5qY0dOQmMzUjZOMHB1VVVkQkVnc3RUMlpCTURSQ1JEUkhRUm9UNnFqZHVRRU5DZ3N0VDJaQk1EUkNSRFJIUVNBQk1BQSUzRDABggEICAQYAiAAKACIAQGgAdih0vjL-pQDqAEAsgEA&dark_theme=true&authuser=0'
    );

    expect(getCurrentYouTubeChatSourceUrl()).toBe('https://www.youtube.com/watch?v=-OfA04BD4GA');
    expect(getCurrentYouTubeChatStreamKey()).toBe('-OfA04BD4GA');
    expect(getYouTubeChatSourceStorageKey(getCurrentYouTubeChatSourceUrl())).toBe('video:-OfA04BD4GA');
  });

  it('chooses the most repeated video-id candidate from plain continuation text', () => {
    window.history.replaceState(
      {},
      '',
      '/live_chat?continuation=AAAAAAAAAAA.BBBBBBBBBBB.AAAAAAAAAAA'
    );

    expect(getCurrentYouTubeChatSourceUrl()).toBe('https://www.youtube.com/watch?v=AAAAAAAAAAA');
  });

  it('falls back for live chat urls without usable continuations', () => {
    window.history.replaceState({}, '', '/live_chat');
    expect(getCurrentYouTubeChatSourceUrl()).toBe('http://localhost:3000/live_chat');

    window.history.replaceState({}, '', '/live_chat?continuation=%E0%A4%A');
    expect(getCurrentYouTubeChatStreamKey()).toMatch(/^source-[a-z0-9]+$/);
  });

  it('uses an accessible top watch url before falling back to the chat iframe url', () => {
    window.history.replaceState({}, '', '/live_chat?continuation=iframe-token');
    Object.defineProperty(window, 'top', {
      configurable: true,
      value: {
        location: {
          href: 'https://www.youtube.com/watch?v=stream-from-top&feature=live'
        }
      } as Window
    });

    expect(getCurrentYouTubeChatSourceUrl()).toBe('https://www.youtube.com/watch?v=stream-from-top');
  });

  it('uses accessible parent watch metadata for live channel pages', () => {
    window.history.replaceState({}, '', '/live_chat?continuation=first-volatile-token');
    const topDocument = document.implementation.createHTMLDocument('Top Stream - YouTube');
    const canonical = topDocument.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = 'https://www.youtube.com/watch?v=stable-live-id&feature=live';
    topDocument.head.append(canonical);
    Object.defineProperty(window, 'top', {
      configurable: true,
      value: {
        document: topDocument,
        location: {
          href: 'https://www.youtube.com/@ExampleChannel/live'
        }
      } as Window
    });

    expect(getCurrentYouTubeChatSourceUrl()).toBe('https://www.youtube.com/watch?v=stable-live-id');
    expect(getYouTubeChatSourceStorageKey(getCurrentYouTubeChatSourceUrl())).toBe('video:stable-live-id');
  });

  it('uses an accessible parent watch url when the top window is unavailable', () => {
    window.history.replaceState({}, '', '/live_chat?continuation=iframe-token');
    Object.defineProperty(window, 'top', {
      configurable: true,
      value: {
        get location(): Location {
          throw new Error('cross-origin top');
        }
      } as Window
    });
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: {
        location: {
          href: 'https://www.youtube.com/watch?v=stream-from-parent&feature=live'
        }
      } as Window
    });

    expect(getCurrentYouTubeChatSourceUrl()).toBe('https://www.youtube.com/watch?v=stream-from-parent');
  });

  it('falls back to a stable live-chat continuation url', () => {
    window.history.replaceState({}, '', '/live_chat_replay?continuation=chat-token&extra=ignored');

    expect(getCurrentYouTubeChatSourceUrl()).toBe('http://localhost:3000/live_chat_replay?continuation=chat-token');
    expect(getCurrentYouTubeChatStreamKey()).toMatch(/^source-[a-z0-9]+$/);
  });

  it('falls back to the page path when no stream identifier exists', () => {
    window.history.replaceState({}, '', '/channel/example?ignored=1');

    expect(getCurrentYouTubeChatSourceUrl()).toBe('http://localhost:3000/channel/example');
  });

  it('cleans the current YouTube stream title', () => {
    document.title = '(3) Example Stream - YouTube';

    expect(getCurrentYouTubeChatSourceTitle()).toBe('Example Stream');
  });

  it('uses YouTube title metadata when available', () => {
    const ogTitle = document.createElement('meta');
    ogTitle.setAttribute('property', 'og:title');
    ogTitle.content = '(2) Metadata Stream - YouTube';
    document.head.append(ogTitle);

    expect(getCurrentYouTubeChatSourceTitle()).toBe('Metadata Stream');

    document.head.replaceChildren();
    const pageTitle = document.createElement('meta');
    pageTitle.setAttribute('name', 'title');
    pageTitle.content = 'Fallback Metadata Stream - YouTube';
    document.head.append(pageTitle);

    expect(getCurrentYouTubeChatSourceTitle()).toBe('Fallback Metadata Stream');
  });

  it('prefers the live document title over stale YouTube metadata', () => {
    document.title = 'Current Stream - YouTube';
    const ogTitle = document.createElement('meta');
    ogTitle.setAttribute('property', 'og:title');
    ogTitle.content = 'Stale Previous Video - YouTube';
    document.head.append(ogTitle);

    expect(getCurrentYouTubeChatSourceTitle()).toBe('Current Stream');
  });

  it('uses an accessible top watch document title from a chat frame', () => {
    const topDocument = document.implementation.createHTMLDocument('Top Stream - YouTube');
    Object.defineProperty(window, 'top', {
      configurable: true,
      value: {
        document: topDocument
      }
    });
    document.title = 'Live Chat - YouTube';

    expect(getCurrentYouTubeChatSourceTitle()).toBe('Top Stream');
  });

  it('falls back when parent title contexts are missing or inaccessible', () => {
    Object.defineProperty(window, 'top', {
      configurable: true,
      value: null
    });
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: {
        get document(): Document {
          throw new Error('cross-origin parent');
        }
      }
    });
    document.title = 'Fallback Stream - YouTube';

    expect(getCurrentYouTubeChatSourceTitle()).toBe('Fallback Stream');
  });

  it('ignores generic live chat titles', () => {
    document.title = 'Live Chat - YouTube';

    expect(getCurrentYouTubeChatSourceTitle()).toBe('');
  });

  it('creates stable per-video storage keys', () => {
    expect(getYouTubeChatSourceStorageKey('https://www.youtube.com/watch?v=stream-1')).toBe('video:stream-1');
  });

  it('creates per-video storage keys from live chat video_id urls', () => {
    expect(getYouTubeChatSourceStorageKey('https://www.youtube.com/live_chat?video_id=stream-2')).toBe('video:stream-2');
  });

  it('hashes non-video and blank source urls into stable fallback keys', () => {
    expect(getYouTubeChatSourceStorageKey('https://www.youtube.com/channel/example')).toMatch(/^source:/);
    expect(getYouTubeChatSourceStorageKey('')).toMatch(/^source:/);
  });

  it('keeps invalid urls as stable page source fallbacks', () => {
    expect(getYouTubeChatSourceStorageKey('not a url')).toMatch(/^source:/);
    window.history.replaceState({}, '', '/watch?v=');
    expect(getCurrentYouTubeChatSourceUrl()).toBe('http://localhost:3000/watch');
  });
});
