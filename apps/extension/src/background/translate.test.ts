// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('background translation bridge', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    await chrome.storage.session.clear();
  });

  afterEach(() => vi.useRealTimers());

  it('registers only ytcq translation messages as asynchronous requests', async () => {
    await import('./translate');
    const listener = getMessageListener();

    expect(listener({ type: 'other' }, {}, vi.fn())).toBe(false);
    expect(listener({ type: 'ytcq:translate', text: '', targetLanguage: 'en' }, {}, vi.fn())).toBe(true);
    expect(listener({ type: 'ytcq:translateBatch', texts: [], targetLanguage: 'en' }, {}, vi.fn())).toBe(true);
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('calls Google Translate without credentials and returns translated text', async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: () => Promise.resolve({
        sentences: [{ trans: 'hello ' }, { trans: 'everyone' }],
        src: 'es'
      }),
      ok: true
    } as Response);
    await import('./translate');
    const listener = getMessageListener();
    const sendResponse = vi.fn();

    listener({ type: 'ytcq:translate', text: 'hola a todos', targetLanguage: 'en' }, {}, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        sourceLanguage: 'es',
        translatedText: 'hello everyone'
      });
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://translate.googleapis.com/translate_a/single'),
      expect.objectContaining({
        credentials: 'omit',
        signal: expect.any(AbortSignal)
      })
    );
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('tl=en');
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('q=hola+a+todos');
  });

  it('defaults missing target language to English and falls back to source text when no sentences return', async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: () => Promise.resolve({
        sentences: [],
        src: ''
      }),
      ok: true
    } as Response);
    await import('./translate');
    const listener = getMessageListener();
    const sendResponse = vi.fn();

    listener({ type: 'ytcq:translate', text: 'hola' }, {}, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        sourceLanguage: '',
        translatedText: 'hola'
      });
    });
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('tl=en');
  });

  it('returns a clear error for missing request data', async () => {
    await import('./translate');
    const listener = getMessageListener();
    const sendResponse = vi.fn();

    listener({ type: 'ytcq:translate', text: '', targetLanguage: 'en' }, {}, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        error: 'Missing text or target language.',
        ok: false
      });
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('calls the batch endpoint with repeated query values and returns per-text results', async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: () => Promise.resolve([['hello', 'es'], ['bye', 'es']]),
      ok: true
    } as Response);
    await import('./translate');
    const listener = getMessageListener();
    const sendResponse = vi.fn();

    listener({ type: 'ytcq:translateBatch', texts: ['hola', 'adios'], targetLanguage: 'en' }, {}, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        results: [
          { sourceLanguage: 'es', translatedText: 'hello' },
          { sourceLanguage: 'es', translatedText: 'bye' }
        ]
      });
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://translate.googleapis.com/translate_a/t'),
      expect.objectContaining({
        credentials: 'omit',
        signal: expect.any(AbortSignal)
      })
    );
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).toContain('sl=auto');
    expect(url).toContain('tl=en');
    expect(url).toContain('q=hola');
    expect(url).toContain('q=adios');
  });

  it('falls back to single requests when a batch response cannot be mapped', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        json: () => Promise.resolve([['hello', 'es']]),
        ok: true
      } as Response)
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          sentences: [{ trans: 'hello' }],
          src: 'es'
        }),
        ok: true
      } as Response)
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          sentences: [{ trans: 'bye' }],
          src: 'es'
        }),
        ok: true
      } as Response);
    await import('./translate');
    const listener = getMessageListener();
    const sendResponse = vi.fn();

    listener({ type: 'ytcq:translateBatch', texts: ['hola', 'adios'], targetLanguage: 'en' }, {}, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        results: [
          { sourceLanguage: 'es', translatedText: 'hello' },
          { sourceLanguage: 'es', translatedText: 'bye' }
        ]
      });
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/translate_a/t');
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain('/translate_a/single');
    expect(String(vi.mocked(fetch).mock.calls[2][0])).toContain('/translate_a/single');
  });

  it('returns request errors from failed translation responses', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500
    } as Response);
    await import('./translate');
    const listener = getMessageListener();
    const sendResponse = vi.fn();

    listener({ type: 'ytcq:translate', text: 'hola', targetLanguage: 'en' }, {}, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        error: 'Translate request failed with 500',
        ok: false
      });
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('returns stringified errors for non-Error translation failures', async () => {
    vi.mocked(fetch).mockRejectedValue('network down');
    await import('./translate');
    const listener = getMessageListener();
    const sendResponse = vi.fn();

    listener({ type: 'ytcq:translate', text: 'hola', targetLanguage: 'en' }, {}, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        error: 'network down',
        ok: false
      });
    });
  });

  it.each(['ytcq:translate', 'ytcq:translateBatch'])(
    'shares a 429 cooldown from %s with both translation paths and recovers afterward',
    async (type) => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.mocked(fetch).mockResolvedValueOnce(new Response('', {
        status: 429,
        headers: { 'Retry-After': '2' }
      }));
      await import('./translate');

      const rateLimited = { ok: false, code: 'rate_limited', retryAt: now + 2_000 };
      await expect(requestTranslation(type)).resolves.toMatchObject(rateLimited);
      await expect(requestTranslation('ytcq:translate')).resolves.toMatchObject(rateLimited);
      await expect(requestTranslation('ytcq:translateBatch')).resolves.toMatchObject(rateLimited);
      expect(fetch).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(1_999);
      await expect(requestTranslation('ytcq:translate')).resolves.toMatchObject(rateLimited);
      expect(fetch).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(1);
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
        sentences: [{ trans: 'こんにちは' }], src: 'en'
      })));
      await expect(requestTranslation('ytcq:translate')).resolves.toMatchObject({
        ok: true, translatedText: 'こんにちは'
      });
      expect(fetch).toHaveBeenCalledTimes(2);
    }
  );

  it.each([
    { retryAfter: undefined, delay: 60_000 },
    { retryAfter: 'invalid', delay: 60_000 },
    { retryAfter: '0', delay: 1_000 },
    { retryAfter: '5', delay: 5_000 },
    { retryAfter: 'Tue, 01 Jan 2030 00:00:05 GMT', delay: 5_000 },
    { retryAfter: 'Mon, 31 Dec 2029 23:59:59 GMT', delay: 60_000 }
  ])('uses a safe cooldown for Retry-After=$retryAfter', async ({ retryAfter, delay }) => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2030, 0, 1));
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', {
      status: 429,
      headers: retryAfter === undefined ? {} : { 'Retry-After': retryAfter }
    }));
    await import('./translate');

    await expect(requestTranslation('ytcq:translateBatch')).resolves.toMatchObject({
      ok: false, code: 'rate_limited', retryAt: Date.now() + delay
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('preserves the cooldown when the extension service worker restarts', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 429 }));
    await import('./translate');
    const firstResponse = await requestTranslation('ytcq:translateBatch');

    vi.resetModules();
    await import('./translate');

    await expect(requestTranslation('ytcq:translate')).resolves.toEqual(firstResponse);
    expect(fetch).toHaveBeenCalledOnce();
  });
});

function requestTranslation(type: string): Promise<unknown> {
  return new Promise((resolve) => {
    getMessageListener()({ type, text: 'hello', texts: ['hello', 'thank you'], targetLanguage: 'ja' }, {}, resolve);
  });
}

function getMessageListener(): (
  message: unknown,
  sender: Partial<chrome.runtime.MessageSender>,
  sendResponse: (response?: unknown) => void
) => boolean {
  const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('No runtime message listener registered');
  return listener as (
    message: unknown,
    sender: Partial<chrome.runtime.MessageSender>,
    sendResponse: (response?: unknown) => void
  ) => boolean;
}
