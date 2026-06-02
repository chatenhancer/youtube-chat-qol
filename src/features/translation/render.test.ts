import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '../../shared/options';
import { setOptions } from '../../shared/state';
import {
  clearTranslationRenderings,
  createInlineTranslationElement,
  getReplacementTranslationTitle,
  isMeaningfulTranslation,
  removeTranslation,
  renderTranslation
} from './render';
import type { TranslationResult } from './types';

describe('translation rendering', () => {
  afterEach(() => {
    document.body.replaceChildren();
    setOptions({ ...DEFAULT_OPTIONS });
  });

  it('renders below-message translations without replacing original chat text', () => {
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'ja', translationDisplay: 'below' });
    const message = createMessage('gracias');
    document.body.appendChild(message);

    expect(renderTranslation(message, result({ text: 'ありがとう' }), 'gracias')).toBe(true);

    expect(message.querySelector('#message')?.textContent).toBe('gracias');
    expect(message.querySelector('.ytcq-translation')?.textContent).toContain('ありがとう');
    expect(message.querySelector('.ytcq-translation')?.getAttribute('lang')).toBe('ja');
  });

  it('replaces message text and can restore it later', () => {
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'en', translationDisplay: 'replace' });
    const message = createMessage('gracias');
    document.body.appendChild(message);

    expect(renderTranslation(message, result({ targetLanguage: 'en', text: 'thank you' }), 'gracias')).toBe(true);
    expect(message.classList.contains('ytcq-translation-replaced')).toBe(true);
    expect(message.querySelector('#message')?.textContent).toContain('thank you');
    expect(message.querySelector('#message')?.getAttribute('lang')).toBe('en');

    removeTranslation(message);

    expect(message.classList.contains('ytcq-translation-replaced')).toBe(false);
    expect(message.querySelector('#message')?.textContent).toBe('gracias');
  });

  it('does not render unchanged or disconnected translations', () => {
    const message = createMessage('hello');

    expect(renderTranslation(message, result({ text: 'hola' }), 'hello')).toBe(false);
    document.body.appendChild(message);
    expect(renderTranslation(message, result({ text: 'hello' }), 'hello')).toBe(false);
  });

  it('clears all rendered translation UI from the page', () => {
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'ja', translationDisplay: 'below' });
    const message = createMessage('gracias');
    message.dataset.ytcqTranslationKey = 'message-key';
    document.body.appendChild(message);
    renderTranslation(message, result({ text: 'ありがとう' }), 'gracias');

    clearTranslationRenderings();

    expect(message.querySelector('.ytcq-translation')).toBeNull();
    expect(message.dataset.ytcqTranslationKey).toBeUndefined();
  });

  it('preserves the chat scroller top position and nudges YouTube layout after clearing translations', async () => {
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'ja', translationDisplay: 'below' });
    const { list, scroller, message } = createScrollableChatMessage('gracias');
    document.body.appendChild(list);
    renderTranslation(message, result({ text: 'ありがとう' }), 'gracias');
    const events: string[] = [];
    list.addEventListener('iron-resize', () => events.push('list-resize'));
    scroller.addEventListener('iron-resize', () => events.push('scroller-resize'));
    scroller.addEventListener('scroll', () => events.push('scroll'));
    scroller.scrollTop = 0;

    clearTranslationRenderings();
    await nextFrame();

    expect(scroller.scrollTop).toBe(0);
    expect(events).toEqual(expect.arrayContaining(['list-resize', 'scroller-resize', 'scroll']));
  });

  it('builds meaningful translation metadata and protected-token text', () => {
    expect(isMeaningfulTranslation(
      result({ text: 'hello §0§' }),
      [{ fallbackText: '@ExampleUser', node: null, nodes: [], placeholder: '§0§' }],
      'hola §0§'
    )).toBe(true);
    expect(createInlineTranslationElement(result({ text: 'hello' })).textContent).toContain('hello');
    expect(getReplacementTranslationTitle(result({ sourceLanguage: 'es', text: 'hello' }), 'hola')).toContain('hola');
  });
});

function createMessage(text: string): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer');
  message.innerHTML = `<span id="content"><span id="message">${text}</span></span>`;
  return message;
}

function createScrollableChatMessage(text: string): {
  list: HTMLElement;
  message: HTMLElement;
  scroller: HTMLElement;
} {
  const list = document.createElement('yt-live-chat-item-list-renderer');
  const scroller = document.createElement('div');
  const items = document.createElement('div');
  const message = createMessage(text);

  scroller.id = 'item-scroller';
  items.id = 'items';
  items.appendChild(message);
  scroller.appendChild(items);
  list.appendChild(scroller);
  setScrollMetrics(scroller, { clientHeight: 100, scrollHeight: 300 });

  return { list, message, scroller };
}

function setScrollMetrics(element: HTMLElement, {
  clientHeight,
  scrollHeight
}: {
  clientHeight: number;
  scrollHeight: number;
}): void {
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: clientHeight
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: scrollHeight
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function result(overrides: Partial<TranslationResult> = {}): TranslationResult {
  return {
    sourceLanguage: 'es',
    targetLanguage: 'ja',
    text: 'translated',
    ...overrides
  };
}
