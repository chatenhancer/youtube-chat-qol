import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../shared/options';
import { setOptions } from '../../shared/state';
import {
  onMessageTranslationRendered
} from './events';
import { clearTranslations, queueMessageTranslation } from './queue';

describe('translation queue', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    setOptions({
      ...DEFAULT_OPTIONS,
      targetLanguage: 'en',
      translationDisplay: 'below'
    });
    mockRuntimeSendMessage({
      ok: true,
      sourceLanguage: 'es',
      translatedText: 'hello world'
    });
  });

  afterEach(() => {
    clearTranslations();
    vi.clearAllTimers();
  });

  it('does not queue translations when translation is disabled', async () => {
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: '' });
    queueMessageTranslation(createTextMessage('Hola mundo'));
    await flushPromises();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('renders translated live messages and emits translation state', async () => {
    const rendered = vi.fn();
    const unsubscribe = onMessageTranslationRendered(rendered);
    const message = createTextMessage('Adios mundo');

    queueMessageTranslation(message);
    await flushPromises();
    unsubscribe();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        targetLanguage: 'en',
        text: 'Adios mundo',
        type: 'ytcq:translate'
      }),
      expect.any(Function)
    );
    expect(message.querySelector('.ytcq-translation')?.textContent).toContain('hello world');
    expect(rendered).toHaveBeenCalledWith(expect.objectContaining({
      message,
      originalText: 'Adios mundo',
      sourceText: 'Adios mundo'
    }));
  });

  it('clears queued renderings and translation keys', async () => {
    const message = createTextMessage('Gracias mundo');
    queueMessageTranslation(message);
    await flushPromises();

    clearTranslations();

    expect(message.dataset.ytcqTranslationKey).toBeUndefined();
    expect(message.querySelector('.ytcq-translation')).toBeNull();
  });

  it('drops the pending translation key when the endpoint fails', async () => {
    mockRuntimeSendMessage({ ok: false, error: 'rate limited' });
    const message = createTextMessage('Buenas tardes');

    queueMessageTranslation(message);
    await flushPromises();

    expect(message.dataset.ytcqTranslationKey).toBeUndefined();
    expect(message.querySelector('.ytcq-translation')).toBeNull();
  });
});

function createTextMessage(text: string): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer');
  message.innerHTML = `
    <span id="author-name">@ExampleUser</span>
    <span id="content"><span id="message"></span></span>
  `;
  message.querySelector('#message')?.append(text);
  document.body.append(message);
  return message;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function mockRuntimeSendMessage(response: unknown): void {
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
    _message: unknown,
    callback?: (response: unknown) => void
  ) => {
    callback?.(response);
    return Promise.resolve(response);
  }) as never);
}
