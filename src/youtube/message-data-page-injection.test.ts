import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('YouTube message data page injection', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    document.head.replaceChildren();
    document.body.replaceChildren();
    delete (globalThis as { YTCQ_INJECT_MESSAGE_DATA_PAGE?: boolean }).YTCQ_INJECT_MESSAGE_DATA_PAGE;
    fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      text: () => Promise.resolve('window.__ytcqMessageDataProbe = true;')
    }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    delete (globalThis as { YTCQ_INJECT_MESSAGE_DATA_PAGE?: boolean }).YTCQ_INJECT_MESSAGE_DATA_PAGE;
    vi.unstubAllGlobals();
  });

  it('does nothing unless the Safari injection flag is enabled', async () => {
    const { injectYouTubeMessageDataPage } = await import('./message-data-page-injection');

    injectYouTubeMessageDataPage();
    await flushInjection();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelector('#ytcq-message-data-page-adapter')).toBeNull();
  });

  it('injects the page-world message data adapter source once when enabled', async () => {
    (globalThis as { YTCQ_INJECT_MESSAGE_DATA_PAGE?: boolean }).YTCQ_INJECT_MESSAGE_DATA_PAGE = true;
    const { injectYouTubeMessageDataPage } = await import('./message-data-page-injection');

    injectYouTubeMessageDataPage();
    injectYouTubeMessageDataPage();
    await flushInjection();

    const scripts = document.querySelectorAll<HTMLScriptElement>('#ytcq-message-data-page-adapter');
    expect(scripts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(scripts[0].src).toBe('');
    expect(scripts[0].text).toContain('window.__ytcqMessageDataProbe = true;');
    expect(scripts[0].text).toContain('chrome-extension://test/message-data-page.js');
  });

  it('falls back to an external script and allows retry after a load error', async () => {
    (globalThis as { YTCQ_INJECT_MESSAGE_DATA_PAGE?: boolean }).YTCQ_INJECT_MESSAGE_DATA_PAGE = true;
    fetchMock.mockRejectedValueOnce(new Error('fetch failed'));
    const { injectYouTubeMessageDataPage } = await import('./message-data-page-injection');

    injectYouTubeMessageDataPage();
    await flushInjection();
    expect(document.querySelector<HTMLScriptElement>('#ytcq-message-data-page-adapter')?.src)
      .toBe('chrome-extension://test/message-data-page.js');

    document.querySelector<HTMLScriptElement>('#ytcq-message-data-page-adapter')
      ?.dispatchEvent(new Event('error'));

    expect(document.querySelector('#ytcq-message-data-page-adapter')).toBeNull();

    injectYouTubeMessageDataPage();
    await flushInjection();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(document.querySelector<HTMLScriptElement>('#ytcq-message-data-page-adapter')?.text)
      .toContain('window.__ytcqMessageDataProbe = true;');
  });

  it('copies the YouTube script nonce when one is present', async () => {
    (globalThis as { YTCQ_INJECT_MESSAGE_DATA_PAGE?: boolean }).YTCQ_INJECT_MESSAGE_DATA_PAGE = true;
    const youtubeScript = document.createElement('script');
    youtubeScript.nonce = 'youtube-nonce';
    document.head.append(youtubeScript);
    const { injectYouTubeMessageDataPage } = await import('./message-data-page-injection');

    injectYouTubeMessageDataPage();
    await flushInjection();

    expect(document.querySelector<HTMLScriptElement>('#ytcq-message-data-page-adapter')?.nonce)
      .toBe('youtube-nonce');
  });
});

async function flushInjection(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
