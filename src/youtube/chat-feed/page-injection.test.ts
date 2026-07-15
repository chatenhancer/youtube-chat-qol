import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('YouTube chat feed page injection', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    document.head.replaceChildren();
    document.body.replaceChildren();
    delete (globalThis as { YTCQ_INJECT_CHAT_FEED_PAGE?: boolean }).YTCQ_INJECT_CHAT_FEED_PAGE;
    fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      text: () => Promise.resolve('window.__ytcqChatFeedProbe = true;')
    }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    delete (globalThis as { YTCQ_INJECT_CHAT_FEED_PAGE?: boolean }).YTCQ_INJECT_CHAT_FEED_PAGE;
    vi.unstubAllGlobals();
  });

  it('does nothing unless the Safari injection flag is enabled', async () => {
    const { injectYouTubeChatFeedPage } = await import('./page-injection');

    injectYouTubeChatFeedPage();
    await flushInjection();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelector('#ytcq-chat-feed-page-transport')).toBeNull();
  });

  it('injects the page-world chat feed transport source once when enabled', async () => {
    (globalThis as { YTCQ_INJECT_CHAT_FEED_PAGE?: boolean }).YTCQ_INJECT_CHAT_FEED_PAGE = true;
    const { injectYouTubeChatFeedPage } = await import('./page-injection');

    injectYouTubeChatFeedPage();
    injectYouTubeChatFeedPage();
    await flushInjection();

    const scripts = document.querySelectorAll<HTMLScriptElement>('#ytcq-chat-feed-page-transport');
    expect(scripts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(scripts[0].src).toBe('');
    expect(scripts[0].text).toContain('window.__ytcqChatFeedProbe = true;');
    expect(scripts[0].text).toContain('chrome-extension://test/chat-feed-page.js');
  });

  it('falls back to an external script and allows retry after a load error', async () => {
    (globalThis as { YTCQ_INJECT_CHAT_FEED_PAGE?: boolean }).YTCQ_INJECT_CHAT_FEED_PAGE = true;
    fetchMock.mockRejectedValueOnce(new Error('fetch failed'));
    const { injectYouTubeChatFeedPage } = await import('./page-injection');

    injectYouTubeChatFeedPage();
    await flushInjection();
    expect(document.querySelector<HTMLScriptElement>('#ytcq-chat-feed-page-transport')?.src)
      .toBe('chrome-extension://test/chat-feed-page.js');

    document.querySelector<HTMLScriptElement>('#ytcq-chat-feed-page-transport')
      ?.dispatchEvent(new Event('error'));

    expect(document.querySelector('#ytcq-chat-feed-page-transport')).toBeNull();

    injectYouTubeChatFeedPage();
    await flushInjection();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(document.querySelector<HTMLScriptElement>('#ytcq-chat-feed-page-transport')?.text)
      .toContain('window.__ytcqChatFeedProbe = true;');
  });

  it('copies the YouTube script nonce when one is present', async () => {
    (globalThis as { YTCQ_INJECT_CHAT_FEED_PAGE?: boolean }).YTCQ_INJECT_CHAT_FEED_PAGE = true;
    const youtubeScript = document.createElement('script');
    youtubeScript.nonce = 'youtube-nonce';
    document.head.append(youtubeScript);
    const { injectYouTubeChatFeedPage } = await import('./page-injection');

    injectYouTubeChatFeedPage();
    await flushInjection();

    expect(document.querySelector<HTMLScriptElement>('#ytcq-chat-feed-page-transport')?.nonce)
      .toBe('youtube-nonce');
  });
});

async function flushInjection(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
