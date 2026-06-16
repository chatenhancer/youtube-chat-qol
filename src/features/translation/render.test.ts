import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '../../shared/options';
import { setOptions } from '../../shared/state';
import {
  clearTranslationRenderings,
  createInlineTranslationElement,
  createReplacedTranslationIcon,
  getOriginalReplacementTitle,
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

  it('toggles replaced translations between translated and original text from the icon', () => {
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'en', translationDisplay: 'replace' });
    const message = createMessage('gracias <img alt=":wave:" src="https://example.test/wave.png">');
    document.body.appendChild(message);

    expect(renderTranslation(message, result({ targetLanguage: 'en', text: 'thank you §0§' }), 'gracias :wave:', [
      {
        fallbackText: ':wave:',
        node: null,
        nodes: [message.querySelector('img')!.cloneNode(true)],
        placeholder: '§0§'
      }
    ])).toBe(true);

    expect(message.dataset.ytcqTranslationView).toBe('translated');
    expect(message.querySelector('#message')?.textContent).toContain('thank you');
    expect(message.querySelector('#message')?.getAttribute('title')).toBe('Original (Spanish): gracias :wave:');

    message.querySelector<HTMLButtonElement>('.ytcq-replaced-translation-icon')?.click();

    expect(message.dataset.ytcqTranslationView).toBe('original');
    expect(message.querySelector('#message')?.textContent).toContain('gracias');
    expect(message.querySelector('#message')?.getAttribute('title')).toBe('Translated: thank you :wave:');
    expect(message.querySelector('#message img')?.getAttribute('alt')).toBe(':wave:');
    expect(message.querySelector<HTMLButtonElement>('.ytcq-replaced-translation-icon')?.title).toBe('Translated message');

    message.querySelector<HTMLButtonElement>('.ytcq-replaced-translation-icon')?.click();

    expect(message.dataset.ytcqTranslationView).toBe('translated');
    expect(message.querySelector('#message')?.textContent).toContain('thank you');
    expect(message.querySelector<HTMLButtonElement>('.ytcq-replaced-translation-icon')?.title).toBe('Original message');
  });

  it('restores original language metadata when toggling back to original text', () => {
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'en', translationDisplay: 'replace' });
    const message = createMessage('gracias');
    const messageText = message.querySelector<HTMLElement>('#message')!;
    messageText.lang = 'es-MX';
    document.body.appendChild(message);

    expect(renderTranslation(message, result({ targetLanguage: 'en', text: 'thank you' }), 'gracias')).toBe(true);
    message.querySelector<HTMLButtonElement>('.ytcq-replaced-translation-icon')?.click();

    expect(messageText.lang).toBe('es-MX');
    expect(messageText.getAttribute('lang')).toBe('es-MX');
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
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('ytcq-translation-replaced');
    document.body.appendChild(message);
    document.body.appendChild(svg);
    renderTranslation(message, result({ text: 'ありがとう' }), 'gracias');

    clearTranslationRenderings();

    expect(message.querySelector('.ytcq-translation')).toBeNull();
    expect(message.dataset.ytcqTranslationKey).toBeUndefined();
  });

  it('updates an existing below-message translation in place', () => {
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'ja', translationDisplay: 'below' });
    const message = createMessage('gracias');
    document.body.appendChild(message);

    expect(renderTranslation(message, result({ text: 'ありがとう' }), 'gracias')).toBe(true);
    expect(renderTranslation(message, result({ text: 'どうも' }), 'gracias')).toBe(true);

    const translations = message.querySelectorAll('.ytcq-translation');
    expect(translations).toHaveLength(1);
    expect(translations[0].textContent).toContain('どうも');
    expect(translations[0].textContent).not.toContain('ありがとう');
  });

  it('falls back to inline rendering when replacement mode cannot find message text', () => {
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'en', translationDisplay: 'replace' });
    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.innerHTML = '<span id="content">custom renderer text</span>';
    document.body.appendChild(message);

    expect(renderTranslation(message, result({ targetLanguage: 'en', text: 'custom translation' }), 'custom renderer text')).toBe(true);

    expect(message.classList.contains('ytcq-translation-replaced')).toBe(false);
    expect(message.querySelector('.ytcq-translation')?.textContent).toContain('custom translation');
  });

  it('uses fallback titles when source language or original text is not reliable', () => {
    expect(createInlineTranslationElement(result({
      sourceLanguage: 'ja',
      targetLanguage: 'ja',
      text: 'hello'
    })).title).toBe('Translated message');

    expect(createInlineTranslationElement(result({
      sourceLanguage: '',
      targetLanguage: 'ja',
      text: 'hello'
    })).title).toBe('Translated message');

    expect(getReplacementTranslationTitle(result({ text: 'hello' }), '')).toBe('Original message');
    expect(getReplacementTranslationTitle(result({
      sourceLanguage: 'ja',
      targetLanguage: 'ja',
      text: 'hello'
    }), 'ありがとう')).toContain('ありがとう');
    expect(getOriginalReplacementTitle(result({ text: '' }))).toBe('Translated message');
    const staticIcon = createReplacedTranslationIcon();
    expect(staticIcon).toBeInstanceOf(HTMLSpanElement);
    expect(staticIcon.getAttribute('aria-hidden')).toBe('true');
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

  it('preserves the chat scroller bottom position after clearing translations', async () => {
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'ja', translationDisplay: 'below' });
    const { list, scroller, message } = createScrollableChatMessage('gracias');
    document.body.appendChild(list);
    renderTranslation(message, result({ text: 'ありがとう' }), 'gracias');
    scroller.scrollTop = 200;

    clearTranslationRenderings();
    await nextFrame();

    expect(scroller.scrollTop).toBe(300);
  });

  it('clamps the chat scroller position when clearing translations while scrolled in the middle', async () => {
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'ja', translationDisplay: 'below' });
    const { list, scroller, message } = createScrollableChatMessage('gracias');
    const chatRenderer = document.createElement('yt-live-chat-renderer');
    chatRenderer.appendChild(list);
    document.body.appendChild(chatRenderer);
    renderTranslation(message, result({ text: 'ありがとう' }), 'gracias');
    const events: string[] = [];
    chatRenderer.addEventListener('iron-resize', () => events.push('chat-resize'));
    scroller.scrollTop = 150;

    clearTranslationRenderings();
    setScrollMetrics(scroller, { clientHeight: 100, scrollHeight: 220 });
    await nextFrame();

    expect(scroller.scrollTop).toBe(120);
    expect(events).toContain('chat-resize');
  });

  it('does not restore scroll when the chat scroller disconnects before the next frame', async () => {
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'ja', translationDisplay: 'below' });
    const { list, scroller, message } = createScrollableChatMessage('gracias');
    document.body.appendChild(list);
    renderTranslation(message, result({ text: 'ありがとう' }), 'gracias');
    scroller.scrollTop = 150;

    clearTranslationRenderings();
    list.remove();
    await nextFrame();

    expect(scroller.scrollTop).toBe(150);
  });

  it('builds meaningful translation metadata and protected-token text', () => {
    expect(isMeaningfulTranslation(
      result({ text: 'hello §0§' }),
      [{ fallbackText: '@ExampleUser', node: null, nodes: [], placeholder: '§0§' }],
      'hola §0§'
    )).toBe(true);
    expect(createInlineTranslationElement(result({ text: 'hello' })).textContent).toContain('hello');
    expect(getReplacementTranslationTitle(result({ sourceLanguage: 'es', text: 'hello' }), 'hola')).toBe('Original (Spanish): hola');
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
