import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../shared/options';
import { setOptions } from '../../shared/state';
import {
  onMessageTranslationRendered
} from './events';
import { clearTranslations, createTranslationPriorityScope, queueMessageTranslation } from './queue';

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

  it('prioritizes queued messages retained by an open priority scope', async () => {
    const requests = mockDeferredRuntimeSendMessages();
    const firstLiveMessage = createTextMessage('Mensaje vivo uno');
    const secondLiveMessage = createTextMessage('Mensaje vivo dos');
    const thirdLiveMessage = createTextMessage('Mensaje vivo tres');
    const panelMessage = createTextMessage('Mensaje del panel');

    queueMessageTranslation(firstLiveMessage);
    queueMessageTranslation(secondLiveMessage);
    queueMessageTranslation(thirdLiveMessage);
    queueMessageTranslation(panelMessage, { backfill: true });

    const scope = createTranslationPriorityScope();
    scope.prioritize([panelMessage]);

    requests[0].resolve();
    await waitForRuntimeRequestCount(requests, 3);

    expect(requests[2]?.message).toEqual(expect.objectContaining({
      text: 'Mensaje del panel'
    }));

    scope.close();
    await resolveAllRuntimeRequests(requests);
  });

  it('stops prioritizing queued messages after their priority scope closes', async () => {
    const requests = mockDeferredRuntimeSendMessages();
    const firstLiveMessage = createTextMessage('Otro mensaje vivo uno');
    const secondLiveMessage = createTextMessage('Otro mensaje vivo dos');
    const thirdLiveMessage = createTextMessage('Otro mensaje vivo tres');
    const panelMessage = createTextMessage('Otro mensaje del panel');

    queueMessageTranslation(firstLiveMessage);
    queueMessageTranslation(secondLiveMessage);
    queueMessageTranslation(thirdLiveMessage);
    queueMessageTranslation(panelMessage, { backfill: true });

    const scope = createTranslationPriorityScope();
    scope.prioritize([panelMessage]);
    scope.close();

    requests[0].resolve();
    await waitForRuntimeRequestCount(requests, 3);

    expect(requests[2]?.message).toEqual(expect.objectContaining({
      text: 'Otro mensaje vivo tres'
    }));

    await resolveAllRuntimeRequests(requests);
  });
});

let testMessageId = 0;

function createTextMessage(text: string): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer');
  const id = `translation-test-message-${testMessageId += 1}`;
  Object.assign(message, {
    data: {
      authorName: { simpleText: '@ExampleUser' },
      id,
      message: { runs: [{ text }] }
    }
  });
  message.innerHTML = `
    <span id="author-name">@ExampleUser</span>
    <span id="content"><span id="message"></span></span>
  `;
  message.querySelector('#message')?.append(text);
  document.body.append(message);
  return message;
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }
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

interface DeferredRuntimeRequest {
  message: unknown;
  resolved: boolean;
  resolve: (response?: unknown) => void;
}

function mockDeferredRuntimeSendMessages(): DeferredRuntimeRequest[] {
  const requests: DeferredRuntimeRequest[] = [];
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
    message: unknown,
    callback?: (response: unknown) => void
  ) => {
    const request: DeferredRuntimeRequest = {
      message,
      resolved: false,
      resolve: (response = {
        ok: true,
        sourceLanguage: 'es',
        translatedText: 'translated text'
      }) => {
        if (request.resolved) return;
        request.resolved = true;
        callback?.(response);
      }
    };
    requests.push(request);
    return Promise.resolve();
  }) as never);
  return requests;
}

async function resolveAllRuntimeRequests(requests: DeferredRuntimeRequest[]): Promise<void> {
  for (let index = 0; index < requests.length; index += 1) {
    requests[index].resolve();
    await flushPromises();
  }
}

async function waitForRuntimeRequestCount(
  requests: DeferredRuntimeRequest[],
  count: number
): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    if (requests.length >= count) return;
    await flushPromises();
  }
  throw new Error(`Expected ${count} runtime requests, received ${requests.length}: ${JSON.stringify(requests.map((request) => request.message))}`);
}
