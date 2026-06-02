import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('background translation bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('registers only ytcq translation messages as asynchronous requests', async () => {
    await import('./translate');
    const listener = getMessageListener();

    expect(listener({ type: 'other' }, {}, vi.fn())).toBe(false);
    expect(listener({ type: 'ytcq:translate', text: 'hola', targetLanguage: 'en' }, {}, vi.fn())).toBe(true);
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
});

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
