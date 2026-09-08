// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('background translation bridge', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    await chrome.storage.session.clear();
  });

  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('registers only translation messages and rejects missing data before fetching', async () => {
    await import('./translate');
    expect(getMessageListener()({ type: 'other' }, {}, vi.fn())).toBe(false);
    for (const message of [
      { type: 'ytcq:translate', text: '' },
      { type: 'ytcq:translateBatch', texts: [] },
      { type: 'ytcq:translateBatch', texts: ['hello', ''] }
    ]) {
      const response = await new Promise((resolve) => {
        expect(getMessageListener()(message, {}, resolve)).toBe(true);
      });
      expect(response).toEqual({ ok: false, error: 'Missing text or target language.' });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts a single draft without cookies and preserves the existing message response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([['hello everyone'], ['es']])));
    await import('./translate');
    const response = await new Promise((resolve) =>
      getMessageListener()({ type: 'ytcq:translate', text: 'hola a todos' }, {}, resolve)
    );
    expect(response).toEqual({ ok: true, translatedText: 'hello everyone', sourceLanguage: 'es' });
    expect(fetch).toHaveBeenCalledWith('https://translate-pa.googleapis.com/v1/translateHtml', {
      method: 'POST', credentials: 'omit', signal: expect.any(AbortSignal),
      headers: { 'Content-Type': 'application/json+protobuf', 'X-Goog-Api-Key': expect.any(String) },
      body: JSON.stringify([[['hola a todos'], 'auto', 'en'], 'wt_lib'])
    });
  });

  it('maps each translation and detected language to its original batch entry', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([['hello', 'goodbye'], ['es', 'fr']])));
    await import('./translate');
    const response = await new Promise((resolve) =>
      getMessageListener()({ type: 'ytcq:translateBatch', texts: ['hola', 'au revoir'], targetLanguage: 'en' }, {}, resolve)
    );
    expect(response).toEqual({ ok: true, results: [
      { translatedText: 'hello', sourceLanguage: 'es' },
      { translatedText: 'goodbye', sourceLanguage: 'fr' }
    ] });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    { payload: [['hello'], ['en']], error: 'Translate batch response did not match the request.' },
    { payload: [[], []], error: 'Translate batch response did not match the request.' },
    { payload: [['', 'goodbye']], error: 'Translate response was empty.' },
    { payload: [[null, 'goodbye']], error: 'Translate batch response entry was not readable.' }
  ])('rejects unreadable batches without multiplying requests: $error', async ({ payload, error }) => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(payload)));
    await import('./translate');
    expect(await requestTranslation('ytcq:translateBatch')).toEqual({ ok: false, error });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('keeps Chinese corrections batched and restores mixed-language result order', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify([
        ['hello', '你是個好人', 'goodbye', '謝謝你的直播'], ['es', 'en', 'fr', 'en']
      ])))
      .mockResolvedValueOnce(new Response(JSON.stringify([['You are a good person', 'Thanks for the stream']])));
    await import('./translate');
    const response = await new Promise((resolve) =>
      getMessageListener()({
        type: 'ytcq:translateBatch', texts: ['hola', '你是個好人', 'au revoir', '謝謝你的直播'], targetLanguage: 'en'
      }, {}, resolve)
    );
    expect(response).toEqual({ ok: true, results: [
      { translatedText: 'hello', sourceLanguage: 'es' },
      { translatedText: 'You are a good person', sourceLanguage: 'zh-TW' },
      { translatedText: 'goodbye', sourceLanguage: 'fr' },
      { translatedText: 'Thanks for the stream', sourceLanguage: 'zh-TW' }
    ] });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body))[0])
      .toEqual([['你是個好人', '謝謝你的直播'], 'zh-TW', 'en']);
    expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url) === 'https://translate-pa.googleapis.com/v1/translateHtml')).toBe(true);
  });

  it.each([
    { text: '今日', source: 'ja' },
    { text: '你好', source: 'zh-CN' },
    { text: '今日は楽しい', source: 'en' },
    { text: '오늘 漢字', source: 'en' },
    { text: 'The symbol 愛 means love', source: 'en' }
  ])('does not force Chinese over a detected language or another script: $text', async ({ text, source }) => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([[text], [source]])));
    await import('./translate');
    const response = await new Promise((resolve) =>
      getMessageListener()({ type: 'ytcq:translate', text, targetLanguage: 'en' }, {}, resolve)
    );
    expect(response).toEqual({ ok: true, translatedText: text, sourceLanguage: source });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('splits a batch beyond 50 messages while preserving every entry', async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const texts = JSON.parse(String(init?.body))[0][0] as string[];
      return new Response(JSON.stringify([texts.map((text) => 'translated ' + text)]));
    });
    await import('./translate');
    const texts = Array.from({ length: 51 }, (_, index) => 'item ' + index);
    const response = await new Promise((resolve) =>
      getMessageListener()({ type: 'ytcq:translateBatch', texts, targetLanguage: 'es' }, {}, resolve)
    );
    expect(response).toEqual({ ok: true, results: texts.map((text) => ({
      translatedText: 'translated ' + text, sourceLanguage: ''
    })) });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('bounds the Chinese correction to one request and preserves protected text', async () => {
    const text = '你是個好人 §0§';
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify([
      ['你是個好人 <span translate="no">[0]</span>'], ['en']
    ])));
    await import('./translate');
    const response = await new Promise((resolve) =>
      getMessageListener()({ type: 'ytcq:translate', text, targetLanguage: 'en' }, {}, resolve)
    );
    expect(response).toEqual({ ok: true, translatedText: text, sourceLanguage: 'zh-TW' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps protected content private and restores only validated placeholders', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([
      ['Hola <span translate="no">[0]</span> &amp; adiós'], ['en']
    ])));
    await import('./translate');
    const response = await new Promise((resolve) =>
      getMessageListener()({ type: 'ytcq:translate', text: 'Hello §0§ & goodbye', targetLanguage: 'es' }, {}, resolve)
    );
    expect(response).toEqual({ ok: true, translatedText: 'Hola §0§ & adiós', sourceLanguage: 'en' });
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))[0][0])
      .toEqual(['Hello <span translate="no">[0]</span> &amp; goodbye']);
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
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify([['こんにちは'], ['en']])));
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
