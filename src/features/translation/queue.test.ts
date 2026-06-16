import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../shared/options';
import { setOptions } from '../../shared/state';
import {
  onMessageTranslationCleared,
  onMessageTranslationRendered
} from './events';
import {
  clearTranslations,
  createTranslationPriorityScope,
  queueMessageTranslation,
  queueRetroactiveTranslations
} from './queue';

describe('translation queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('drops the pending translation key when the runtime reports lastError', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      _message: unknown,
      callback?: (response: unknown) => void
    ) => {
      Object.defineProperty(chrome.runtime, 'lastError', {
        configurable: true,
        value: { message: 'context invalidated' }
      });
      callback?.(undefined);
      Object.defineProperty(chrome.runtime, 'lastError', {
        configurable: true,
        value: undefined
      });
      return Promise.resolve();
    }) as never);
    const message = createTextMessage('Buenas noches');

    queueMessageTranslation(message);
    await flushPromises();

    expect(message.dataset.ytcqTranslationKey).toBeUndefined();
    expect(message.querySelector('.ytcq-translation')).toBeNull();
  });

  it('clears translation state when the response is unchanged', async () => {
    const cleared = vi.fn();
    const unsubscribe = onMessageTranslationCleared(cleared);
    mockRuntimeSendMessage({
      ok: true,
      sourceLanguage: 'es',
      translatedText: 'Hola mundo'
    });
    const message = createTextMessage('Hola mundo');

    queueMessageTranslation(message);
    await flushPromises();
    unsubscribe();

    expect(message.dataset.ytcqTranslationKey).toBeUndefined();
    expect(message.querySelector('.ytcq-translation')).toBeNull();
    expect(cleared).toHaveBeenCalledWith({ message });
  });

  it('does not translate messages without meaningful language text', async () => {
    queueMessageTranslation(createTextMessage(''));
    queueMessageTranslation(createTextMessage('   \n   '));
    queueMessageTranslation(createTextMessage('https://example.com'));
    queueMessageTranslation(createTextMessage('12345 !!!'));
    queueMessageTranslation(createTextMessage('😀😀😀'));
    queueMessageTranslation(createTextMessage('a'));
    await flushPromises();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('does translate short non-latin language text', async () => {
    const message = createTextMessage('あ');

    queueMessageTranslation(message);
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce();
    expect(message.querySelector('.ytcq-translation')?.textContent).toContain('hello world');
  });

  it('reuses cached translations for later messages with the same text and target', async () => {
    const first = createTextMessage('Saludos mundo');
    const second = createTextMessage('Saludos mundo');

    queueMessageTranslation(first);
    await flushPromises();
    queueMessageTranslation(second);
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(second.querySelector('.ytcq-translation')?.textContent).toContain('hello world');
  });

  it('evicts a cached translation when a later message can no longer render it', async () => {
    const cleared = vi.fn();
    const unsubscribe = onMessageTranslationCleared(cleared);
    const first = createTextMessage('Mensaje cache desconectado');
    const disconnected = createTextMessage('Mensaje cache desconectado');

    queueMessageTranslation(first);
    await flushPromises();
    vi.mocked(chrome.runtime.sendMessage).mockClear();
    disconnected.remove();

    queueMessageTranslation(disconnected);
    await flushPromises();
    unsubscribe();

    expect(disconnected.dataset.ytcqTranslationKey).toBeUndefined();
    expect(cleared).toHaveBeenCalledWith({ message: disconnected });

    queueMessageTranslation(createTextMessage('Mensaje cache desconectado'));
    await flushPromises();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce();
  });

  it('shares one pending request across duplicate messages and renders both responses', async () => {
    const requests = mockDeferredRuntimeSendMessages();
    const first = createTextMessage('Mensaje duplicado');
    const second = createTextMessage('Mensaje duplicado');

    queueMessageTranslation(first);
    queueMessageTranslation(second);
    await waitForRuntimeRequestCount(requests, 1);
    requests[0].resolve({
      ok: true,
      sourceLanguage: 'es',
      translatedText: 'duplicated message'
    });
    await flushPromises();

    expect(requests).toHaveLength(1);
    expect(first.querySelector('.ytcq-translation')?.textContent).toContain('duplicated message');
    expect(second.querySelector('.ytcq-translation')?.textContent).toContain('duplicated message');
  });

  it('shares one pending backfill request across duplicate backfill messages', async () => {
    const requests = mockDeferredRuntimeSendMessages();
    const first = createTextMessage('Mensaje duplicado historial');
    const second = createTextMessage('Mensaje duplicado historial');

    queueMessageTranslation(first, { backfill: true });
    queueMessageTranslation(second, { backfill: true });
    await waitForRuntimeRequestCount(requests, 1);
    requests[0].resolve({
      ok: true,
      sourceLanguage: 'es',
      translatedText: 'duplicate history message'
    });
    await flushPromises();

    expect(requests).toHaveLength(1);
    expect(first.querySelector('.ytcq-translation')?.textContent).toContain('duplicate history message');
    expect(second.querySelector('.ytcq-translation')?.textContent).toContain('duplicate history message');
  });

  it('does not queue the same message again while its translation key is unchanged', async () => {
    const requests = mockDeferredRuntimeSendMessages();
    const message = createTextMessage('Mensaje en progreso');

    queueMessageTranslation(message);
    queueMessageTranslation(message);
    await waitForRuntimeRequestCount(requests, 1);

    expect(requests).toHaveLength(1);
    requests[0].resolve();
    await flushPromises();
  });

  it('does not render pending responses after translations are cleared', async () => {
    const requests = mockDeferredRuntimeSendMessages();
    const message = createTextMessage('Mensaje pendiente');

    queueMessageTranslation(message);
    await waitForRuntimeRequestCount(requests, 1);
    clearTranslations();
    requests[0].resolve({
      ok: true,
      sourceLanguage: 'es',
      translatedText: 'pending message'
    });
    await flushPromises();

    expect(message.dataset.ytcqTranslationKey).toBeUndefined();
    expect(message.querySelector('.ytcq-translation')).toBeNull();
  });

  it('can replace original message text when replace display mode is selected', async () => {
    setOptions({
      ...DEFAULT_OPTIONS,
      targetLanguage: 'en',
      translationDisplay: 'replace'
    });
    const message = createTextMessage('Hola mundo');

    queueMessageTranslation(message);
    await flushPromises();

    expect(message.querySelector('#message')?.textContent).toBe('hello world');
    expect(message.querySelector('.ytcq-translation')).toBeNull();
    expect(message.querySelector('#message')?.getAttribute('title')).toContain('Hola mundo');
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

  it('ignores invalid priority messages and allows priority scopes to close idempotently', async () => {
    const requests = mockDeferredRuntimeSendMessages();
    const disconnected = createTextMessage('Mensaje desconectado');
    const punctuationOnly = createTextMessage('12345 !!!');
    disconnected.remove();
    const scope = createTranslationPriorityScope();

    scope.prioritize([null, undefined, disconnected, punctuationOnly]);
    scope.close();
    scope.close();
    await flushPromises();

    expect(requests).toHaveLength(0);
  });

  it('does not retain unrelated messages just because another priority scope is open', async () => {
    const requests = mockDeferredRuntimeSendMessages();
    const priorityMessage = createTextMessage('Mensaje prioritario aislado');
    const unrelatedLiveMessage = createTextMessage('Mensaje vivo sin prioridad activa');
    const laterLiveMessage = createTextMessage('Mensaje vivo posterior sin prioridad');
    const scope = createTranslationPriorityScope();

    scope.prioritize([priorityMessage]);
    queueMessageTranslation(unrelatedLiveMessage);
    queueMessageTranslation(laterLiveMessage);
    scope.close();
    await waitForRuntimeRequestCount(requests, 2);

    expect(requests[0].message).toEqual(expect.objectContaining({
      text: 'Mensaje prioritario aislado'
    }));
    expect(requests[1].message).toEqual(expect.objectContaining({
      text: 'Mensaje vivo sin prioridad activa'
    }));

    await resolveAllRuntimeRequests(requests);
  });

  it('queues unqueued messages from an open priority scope and ignores prioritize after close', async () => {
    const requests = mockDeferredRuntimeSendMessages();
    const message = createTextMessage('Mensaje prioritario nuevo');
    const ignoredAfterClose = createTextMessage('Mensaje ignorado tras cerrar');
    const scope = createTranslationPriorityScope();

    scope.prioritize([message]);
    await waitForRuntimeRequestCount(requests, 1);
    scope.close();
    scope.prioritize([ignoredAfterClose]);
    await flushPromises();

    expect(requests).toHaveLength(1);
    expect(requests[0].message).toEqual(expect.objectContaining({
      text: 'Mensaje prioritario nuevo'
    }));

    await resolveAllRuntimeRequests(requests);
  });

  it('keeps a priority key retained only once per scope and releases shared priority counts gradually', async () => {
    const requests = mockDeferredRuntimeSendMessages();
    const firstLiveMessage = createTextMessage('Mensaje con prioridad compartida uno');
    const secondLiveMessage = createTextMessage('Mensaje con prioridad compartida dos');
    const thirdLiveMessage = createTextMessage('Mensaje con prioridad compartida tres');
    const priorityMessage = createTextMessage('Mensaje con prioridad compartida panel');

    queueMessageTranslation(firstLiveMessage);
    queueMessageTranslation(secondLiveMessage);
    queueMessageTranslation(thirdLiveMessage);
    queueMessageTranslation(priorityMessage, { backfill: true });

    const firstScope = createTranslationPriorityScope();
    const secondScope = createTranslationPriorityScope();
    firstScope.prioritize([priorityMessage, priorityMessage]);
    secondScope.prioritize([priorityMessage]);
    firstScope.close();

    requests[0].resolve();
    await waitForRuntimeRequestCount(requests, 3);

    expect(requests[2].message).toEqual(expect.objectContaining({
      text: 'Mensaje con prioridad compartida panel'
    }));

    secondScope.close();
    await resolveAllRuntimeRequests(requests);
  });

  it('promotes a queued backfill translation when a matching live message appears', async () => {
    const requests = mockDeferredRuntimeSendMessages();
    const firstBackfill = createTextMessage('Mensaje de historial promocion uno');
    const secondBackfill = createTextMessage('Mensaje de historial promocion dos');
    const promotedBackfill = createTextMessage('Mensaje de historial promocion tres');
    const liveDuplicate = createTextMessage('Mensaje de historial promocion tres');

    queueMessageTranslation(firstBackfill, { backfill: true });
    queueMessageTranslation(secondBackfill, { backfill: true });
    queueMessageTranslation(promotedBackfill, { backfill: true });
    queueMessageTranslation(liveDuplicate);

    await waitForRuntimeRequestCount(requests, 2);
    requests[0].resolve();
    await waitForRuntimeRequestCount(requests, 3);

    expect(requests[2].message).toEqual(expect.objectContaining({
      text: 'Mensaje de historial promocion tres'
    }));

    await resolveAllRuntimeRequests(requests);
  });

  it('clears the backfill delay when a delayed backfill is promoted by a live duplicate', async () => {
    const requests = mockDeferredRuntimeSendMessages();
    const delayedBackfill = createTextMessage('Mensaje de historial con retardo');

    queueMessageTranslation(createTextMessage('Mensaje de historial inicial'), { backfill: true });
    queueMessageTranslation(createTextMessage('Mensaje de historial segundo'), { backfill: true });
    queueMessageTranslation(delayedBackfill, { backfill: true });
    await waitForRuntimeRequestCount(requests, 2);
    requests[0].resolve();
    await flushPromises();

    queueMessageTranslation(createTextMessage('Mensaje de historial con retardo'));
    await waitForRuntimeRequestCount(requests, 3);

    expect(requests[2].message).toEqual(expect.objectContaining({
      text: 'Mensaje de historial con retardo'
    }));

    await resolveAllRuntimeRequests(requests);
  });

  it('caps pending backfill translations by dropping the oldest queued backfill entries first', async () => {
    const requests = mockDeferredRuntimeSendMessages();
    const messages = Array.from({ length: 305 }, (_value, index) => {
      const message = createTextMessage(`Mensaje antiguo de historial ${index}`);
      queueMessageTranslation(message, { backfill: true });
      return message;
    });
    await waitForRuntimeRequestCount(requests, 2);

    expect(messages[0].dataset.ytcqTranslationKey).toBeDefined();
    expect(messages[1].dataset.ytcqTranslationKey).toBeDefined();
    expect(messages[2].dataset.ytcqTranslationKey).toBeUndefined();
    expect(messages[304].dataset.ytcqTranslationKey).toBeDefined();

    await resolveAllRuntimeRequests(requests);
  });

  it('caps pending live translations when live chat outpaces translation responses', async () => {
    const requests = mockDeferredRuntimeSendMessages();
    const messages = Array.from({ length: 305 }, (_value, index) => {
      const message = createTextMessage(`Mensaje vivo muy rapido ${index}`);
      queueMessageTranslation(message);
      return message;
    });
    await waitForRuntimeRequestCount(requests, 2);

    expect(messages[0].dataset.ytcqTranslationKey).toBeDefined();
    expect(messages[1].dataset.ytcqTranslationKey).toBeDefined();
    expect(messages[2].dataset.ytcqTranslationKey).toBeUndefined();
    expect(messages[304].dataset.ytcqTranslationKey).toBeDefined();

    await resolveAllRuntimeRequests(requests);
  });

  it('prunes disconnected pending translation entries before dropping connected messages', async () => {
    const requests = mockDeferredRuntimeSendMessages();
    const disconnected = Array.from({ length: 10 }, (_value, index) => {
      const message = createTextMessage(`Mensaje desconectado pendiente ${index}`);
      queueMessageTranslation(message, { backfill: true });
      message.remove();
      return message;
    });
    const connected = Array.from({ length: 295 }, (_value, index) => {
      const message = createTextMessage(`Mensaje conectado pendiente ${index}`);
      queueMessageTranslation(message, { backfill: true });
      return message;
    });
    await waitForRuntimeRequestCount(requests, 2);

    expect(disconnected).toHaveLength(10);
    expect(connected[connected.length - 1].dataset.ytcqTranslationKey).toBeDefined();

    await resolveAllRuntimeRequests(requests);
  });

  it('caps duplicate pending entries even when there are no queued jobs to drop', async () => {
    const requests = mockDeferredRuntimeSendMessages();
    const messages = Array.from({ length: 305 }, () => {
      const message = createTextMessage('Mensaje duplicado saturado');
      queueMessageTranslation(message);
      return message;
    });
    await waitForRuntimeRequestCount(requests, 1);

    expect(messages[0].dataset.ytcqTranslationKey).toBeUndefined();
    expect(messages[304].dataset.ytcqTranslationKey).toBeDefined();

    requests[0].resolve({
      ok: true,
      sourceLanguage: 'es',
      translatedText: 'saturated duplicate'
    });
    await flushPromises();

    expect(messages[304].querySelector('.ytcq-translation')?.textContent).toContain('saturated duplicate');
  });

  it('clears a disconnected pending message when the translated result cannot render', async () => {
    const cleared = vi.fn();
    const unsubscribe = onMessageTranslationCleared(cleared);
    const requests = mockDeferredRuntimeSendMessages();
    const message = createTextMessage('Mensaje desconectado al responder');

    queueMessageTranslation(message);
    await waitForRuntimeRequestCount(requests, 1);
    message.remove();
    requests[0].resolve({
      ok: true,
      sourceLanguage: 'es',
      translatedText: 'disconnected message'
    });
    await flushPromises();
    unsubscribe();

    expect(cleared).toHaveBeenCalledWith({ message });
  });

  it('handles translate responses without optional translated text or source language', async () => {
    mockRuntimeSendMessage({ ok: true });
    const message = createTextMessage('Respuesta sin campos opcionales');

    queueMessageTranslation(message);
    await flushPromises();

    expect(message.dataset.ytcqTranslationKey).toBeUndefined();
    expect(message.querySelector('.ytcq-translation')).toBeNull();
  });

  it('uses a default translate failure message when the endpoint omits one', async () => {
    mockRuntimeSendMessage({ ok: false });
    const message = createTextMessage('Fallo sin mensaje');

    queueMessageTranslation(message);
    await flushPromises();

    expect(message.dataset.ytcqTranslationKey).toBeUndefined();
  });

  it('evicts the oldest cached translation after the cache reaches its cap', async () => {
    for (let index = 0; index < 560; index += 1) {
      mockRuntimeSendMessage({
        ok: true,
        sourceLanguage: 'es',
        translatedText: `translated ${index}`
      });
      queueMessageTranslation(createTextMessage(`Mensaje cache unico ${index}`));
      await flushPromises();
    }
    vi.mocked(chrome.runtime.sendMessage).mockClear();
    mockRuntimeSendMessage({
      ok: true,
      sourceLanguage: 'es',
      translatedText: 'translated again'
    });

    queueMessageTranslation(createTextMessage('Mensaje cache unico 0'));
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce();
  });

  it('queues retroactive translations with visible messages first and respects disabled translation', async () => {
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: '' });
    queueRetroactiveTranslations();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();

    setOptions({
      ...DEFAULT_OPTIONS,
      targetLanguage: 'en',
      translationDisplay: 'below'
    });
    const requests = mockDeferredRuntimeSendMessages();
    const offscreen = createTextMessage('Mensaje fuera de pantalla');
    const lowerVisible = createTextMessage('Mensaje visible bajo');
    const upperVisible = createTextMessage('Mensaje visible alto');
    mockMessageRect(offscreen, { top: -500, bottom: -450 });
    mockMessageRect(lowerVisible, { top: 500, bottom: 540 });
    mockMessageRect(upperVisible, { top: 100, bottom: 140 });

    queueRetroactiveTranslations();
    await waitForRuntimeRequestCount(requests, 2);

    expect(requests[0].message).toEqual(expect.objectContaining({
      text: 'Mensaje visible bajo'
    }));
    expect(requests[1].message).toEqual(expect.objectContaining({
      text: 'Mensaje visible alto'
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

function mockMessageRect(message: HTMLElement, { top, bottom }: { top: number; bottom: number }): void {
  vi.spyOn(message, 'getBoundingClientRect').mockReturnValue({
    bottom,
    height: bottom - top,
    left: 0,
    right: 300,
    top,
    width: 300,
    x: 0,
    y: top,
    toJSON: () => ({})
  } as DOMRect);
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
