import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../shared/options';
import { setOptions } from '../shared/state';
import { clearToast } from '../shared/toast';
import {
  cleanupStaleComposerTranslation,
  initComposerTranslation,
  refreshComposerTranslation,
  resetComposerTranslation,
  scheduleComposerTranslationWire,
  shouldWireComposerTranslationForNode
} from './composer-translation';

describe('composer translation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setOptions({ ...DEFAULT_OPTIONS });
  });

  afterEach(() => {
    cleanupStaleComposerTranslation();
    clearToast();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('wires the input button, preserves mentions through placeholders, and replaces the draft after debounce', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: 'ja'
    });
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((message: unknown, callback?: (response: unknown) => void) => {
      expect(message).toMatchObject({
        targetLanguage: 'ja',
        text: 'Hola §0§',
        type: 'ytcq:translate'
      });
      callback?.({
        ok: true,
        sourceLanguage: 'es',
        translatedText: 'こんにちは §0§'
      });
      return Promise.resolve({});
    }) as never);
    const input = createVisibleChatInput();
    document.body.append(createComposerHost(input));

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    refreshComposerTranslation();

    const button = document.querySelector<HTMLButtonElement>('.ytcq-composer-translate-button');
    expect(button).not.toBeNull();
    expect(button?.classList.contains('ytcq-composer-translate-button-active')).toBe(true);

    input.textContent = 'Hola @ExampleUser';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();

    expect(input.textContent).toBe('こんにちは @ExampleUser');
  });

  it('does not translate disabled, empty, or slash-command drafts', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    const input = createVisibleChatInput();
    document.body.append(createComposerHost(input));

    setOptions({ ...DEFAULT_OPTIONS, composerTranslateLanguage: '' });
    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();

    input.textContent = 'Hola';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);

    input.textContent = '/help';
    setOptions({ ...DEFAULT_OPTIONS, composerTranslateLanguage: 'ja' });
    refreshComposerTranslation();
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    input.textContent = '';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('does not replace the draft when the user edits while translation is in flight', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: 'ja'
    });
    let resolveTranslation: ((response: unknown) => void) | null = null;
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      resolveTranslation = (response: unknown) => callback?.(response);
      return Promise.resolve({});
    }) as never);
    const input = createVisibleChatInput();
    document.body.append(createComposerHost(input));

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    input.textContent = 'Hola';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    input.textContent = 'Hola amigo';
    const finishTranslation = resolveTranslation as ((response: unknown) => void) | null;
    if (!finishTranslation) throw new Error('Expected draft translation request to be pending.');
    finishTranslation({
      ok: true,
      sourceLanguage: 'es',
      translatedText: 'こんにちは'
    });
    await flushPromises();

    expect(input.textContent).toBe('Hola amigo');
  });

  it('does not restore a translated draft after the user clears while translation is in flight', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: 'ja'
    });
    let resolveTranslation: ((response: unknown) => void) | null = null;
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      resolveTranslation = (response: unknown) => callback?.(response);
      return Promise.resolve({});
    }) as never);
    const input = createVisibleChatInput();
    document.body.append(createComposerHost(input));

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    input.textContent = 'Hola';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    input.textContent = '';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    const finishTranslation = resolveTranslation as ((response: unknown) => void) | null;
    if (!finishTranslation) throw new Error('Expected draft translation request to be pending.');
    finishTranslation({
      ok: true,
      sourceLanguage: 'es',
      translatedText: 'こんにちは'
    });
    await flushPromises();

    expect(input.textContent).toBe('');
  });

  it('shows a toast when draft translation fails', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: 'ja'
    });
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ ok: false, error: 'failed' });
      return Promise.resolve({});
    }) as never);
    const input = createVisibleChatInput();
    document.body.append(createComposerHost(input));

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    input.textContent = 'Hola';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();

    expect(document.querySelector('.ytcq-toast')?.textContent).toBe('Could not translate that text.');
  });

  it('opens the draft translation panel, saves selected language, and closes from outside click or Escape', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    const saveOptions = vi.fn();
    setOptions({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: ''
    });
    const input = createVisibleChatInput();
    document.body.append(createComposerHost(input));

    initComposerTranslation(saveOptions);
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    document.querySelector<HTMLButtonElement>('.ytcq-composer-translate-button')?.click();
    const panel = document.querySelector<HTMLElement>('.ytcq-composer-translate-panel')!;
    const select = panel.querySelector<HTMLSelectElement>('select')!;

    expect(panel.hidden).toBe(false);
    select.value = 'ko';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(saveOptions).toHaveBeenCalledWith({ composerTranslateLanguage: 'ko' });
    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(saveOptions).toHaveBeenCalledWith({ composerTranslateLanguage: '' });

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(panel.hidden).toBe(true);

    document.querySelector<HTMLButtonElement>('.ytcq-composer-translate-button')?.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel.hidden).toBe(true);
  });

  it('positions the draft translation panel within viewport bounds on resize and scroll', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    const input = createVisibleChatInput();
    const host = createComposerHost(input);
    const emojiButton = host.querySelector<HTMLElement>('#emoji-picker-button')!;
    emojiButton.getBoundingClientRect = () => ({
      bottom: 42,
      height: 32,
      left: 300,
      right: 332,
      top: 10,
      width: 32,
      x: 300,
      y: 10,
      toJSON: () => ({})
    });
    document.body.append(host);
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 120 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 340 });

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    const button = document.querySelector<HTMLButtonElement>('.ytcq-composer-translate-button')!;
    button.getBoundingClientRect = () => ({
      bottom: 42,
      height: 32,
      left: 300,
      right: 332,
      top: 10,
      width: 32,
      x: 300,
      y: 10,
      toJSON: () => ({})
    });
    const panel = document.querySelector<HTMLElement>('.ytcq-composer-translate-panel')!;
    Object.defineProperties(panel, {
      offsetHeight: { configurable: true, value: 90 },
      offsetWidth: { configurable: true, value: 180 }
    });
    button.click();
    await vi.runOnlyPendingTimersAsync();
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new Event('scroll'));

    expect(panel.style.left).toBe('152px');
    expect(panel.style.top).toBe('8px');
  });

  it('closes the draft translation panel from a second button click and ignores non-Escape keys', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    const input = createVisibleChatInput();
    document.body.append(createComposerHost(input));

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    const button = document.querySelector<HTMLButtonElement>('.ytcq-composer-translate-button')!;
    const panel = document.querySelector<HTMLElement>('.ytcq-composer-translate-panel')!;

    button.click();
    expect(panel.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(panel.hidden).toBe(false);
    button.click();
    expect(panel.hidden).toBe(true);
  });

  it('does not wire until YouTube exposes the emoji button host', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren(createVisibleChatInput());

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();

    expect(document.querySelector('.ytcq-composer-translate-button')).toBeNull();
  });

  it('handles refresh, reset, and global events before controls are wired', () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({ ...DEFAULT_OPTIONS, composerTranslateLanguage: 'ja' });

    expect(() => refreshComposerTranslation()).not.toThrow();
    expect(() => resetComposerTranslation()).not.toThrow();
    document.dispatchEvent(new Event('scroll'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.body.dispatchEvent(new InputEvent('input', { bubbles: true }));
    vi.runOnlyPendingTimers();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('coalesces pending wire requests and cleans them before they run', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren(createComposerHost(createVisibleChatInput()));
    const cancelAnimationFrameSpy = vi.spyOn(window, 'cancelAnimationFrame');

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    scheduleComposerTranslationWire();
    cleanupStaleComposerTranslation();
    await vi.runOnlyPendingTimersAsync();

    expect(cancelAnimationFrameSpy).toHaveBeenCalled();
    expect(document.querySelector('.ytcq-composer-translate-button')).toBeNull();
  });

  it('keeps one control when the composer is rewired and updates inactive button copy', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({ ...DEFAULT_OPTIONS, composerTranslateLanguage: '' });
    const input = createVisibleChatInput();
    const host = createComposerHost(input);
    document.body.append(host);

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    refreshComposerTranslation();

    const buttons = document.querySelectorAll<HTMLButtonElement>('.ytcq-composer-translate-button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].classList.contains('ytcq-composer-translate-button-active')).toBe(false);
    expect(buttons[0].title).toBe('Draft translation off.');
  });

  it('removes duplicate controls from the emoji host before wiring a fresh control', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    const input = createVisibleChatInput();
    const host = createComposerHost(input);
    const emojiButton = host.querySelector<HTMLElement>('#emoji-picker-button')!;
    const duplicate = document.createElement('div');
    duplicate.className = 'ytcq-composer-translate-control';
    emojiButton.append(duplicate);
    document.body.append(host);

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();

    expect(emojiButton.querySelectorAll(':scope > .ytcq-composer-translate-control')).toHaveLength(1);
    expect(emojiButton.querySelector(':scope > .ytcq-composer-translate-control')).not.toBe(duplicate);
  });

  it('keeps the translation panel open when clicking inside the panel or control', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    const input = createVisibleChatInput();
    document.body.append(createComposerHost(input));

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    const button = document.querySelector<HTMLButtonElement>('.ytcq-composer-translate-button')!;
    button.click();
    const panel = document.querySelector<HTMLElement>('.ytcq-composer-translate-panel')!;

    panel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(panel.hidden).toBe(false);
    document.querySelector<HTMLElement>('.ytcq-composer-translate-control')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(panel.hidden).toBe(false);
  });

  it('retranslates appended text from the saved original draft instead of the translated draft', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: 'ja'
    });
    const requests: string[] = [];
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((message: unknown, callback?: (response: unknown) => void) => {
      const text = (message as { text: string }).text;
      requests.push(text);
      callback?.({
        ok: true,
        sourceLanguage: 'es',
        translatedText: text === 'Hola' ? 'こんにちは' : 'こんにちは 友達'
      });
      return Promise.resolve({});
    }) as never);
    const input = createVisibleChatInput();
    document.body.append(createComposerHost(input));

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    input.textContent = 'Hola';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();
    await vi.runOnlyPendingTimersAsync();
    input.textContent = 'こんにちは amigo';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();

    expect(requests).toEqual(['Hola', 'Hola amigo']);
    expect(input.textContent).toBe('こんにちは 友達');
  });

  it('preserves image emoji inserted after an already translated draft when retranslating', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: 'ja'
    });
    const requests: string[] = [];
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((message: unknown, callback?: (response: unknown) => void) => {
      const text = (message as { text: string }).text;
      requests.push(text);
      callback?.({
        ok: true,
        sourceLanguage: 'es',
        translatedText: text.includes('§0§') ? 'こんにちは §0§ 友達' : 'こんにちは'
      });
      return Promise.resolve({});
    }) as never);
    const input = createVisibleChatInput();
    document.body.append(createComposerHost(input));

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    input.textContent = 'Hola';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();
    await vi.runOnlyPendingTimersAsync();

    input.append(createInputEmoji(':custom-smile:'), document.createTextNode(' amigo'));
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();

    expect(requests).toEqual(['Hola', 'Hola §0§ amigo']);
    expect(input.textContent).toContain('こんにちは');
    expect(input.textContent).toContain('友達');
    const emoji = input.querySelector<HTMLImageElement>('img[data-emoji-id="custom-smile-id"]');
    expect(emoji?.alt).toBe(':custom-smile:');
  });

  it('does not insert an extra source space when continuation nodes already start with whitespace', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: 'ja'
    });
    const requests: string[] = [];
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((message: unknown, callback?: (response: unknown) => void) => {
      const text = (message as { text: string }).text;
      requests.push(text);
      callback?.({
        ok: true,
        sourceLanguage: 'es',
        translatedText: text === 'Hola' ? 'こんにちは' : 'こんにちは 友達'
      });
      return Promise.resolve({});
    }) as never);
    const input = createVisibleChatInput();
    document.body.append(createComposerHost(input));

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    input.textContent = 'Hola';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();
    await vi.runOnlyPendingTimersAsync();

    input.replaceChildren(document.createTextNode('こんにちは'), document.createTextNode(' amigo'));
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();

    expect(requests).toEqual(['Hola', 'Hola amigo']);
  });

  it('does not retranslate a translated draft until new text is appended in order', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: 'ja'
    });
    const requests: string[] = [];
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((message: unknown, callback?: (response: unknown) => void) => {
      const text = (message as { text: string }).text;
      requests.push(text);
      callback?.({
        ok: true,
        sourceLanguage: 'es',
        translatedText: text === 'Hola' ? 'こんにちは' : 'こんにちは 友達'
      });
      return Promise.resolve({});
    }) as never);
    const input = createVisibleChatInput();
    document.body.append(createComposerHost(input));

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    input.textContent = 'Hola';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();

    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();
    input.textContent = 'amigo こんにちは';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();

    expect(requests).toEqual(['Hola', 'amigo こんにちは']);
  });

  it('does not retranslate appended text when translated continuation nodes cannot be matched', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: 'ja'
    });
    const requests: string[] = [];
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((message: unknown, callback?: (response: unknown) => void) => {
      const text = (message as { text: string }).text;
      requests.push(text);
      callback?.({
        ok: true,
        sourceLanguage: 'es',
        translatedText: text === 'Hola' ? 'こんにちは' : 'こんにちは 友達'
      });
      return Promise.resolve({});
    }) as never);
    const input = createVisibleChatInput();
    document.body.append(createComposerHost(input));

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    input.textContent = 'Hola';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();

    input.replaceChildren(document.createElement('span'), document.createTextNode('こんにちは amigo'));
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();

    expect(requests).toEqual(['Hola']);
    expect(input.textContent).toBe('こんにちは amigo');
  });

  it('translates textarea drafts and retranslates appended text through the text fallback path', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: 'ja'
    });
    const requests: string[] = [];
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((message: unknown, callback?: (response: unknown) => void) => {
      const text = (message as { text: string }).text;
      requests.push(text);
      callback?.({
        ok: true,
        sourceLanguage: 'es',
        translatedText: text === 'Hola' ? 'こんにちは' : 'こんにちは 友達'
      });
      return Promise.resolve({});
    }) as never);
    const input = createVisibleTextarea();
    document.body.append(createComposerHost(input));

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    input.value = 'Hola';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();
    await vi.runOnlyPendingTimersAsync();

    input.value = 'こんにちは amigo';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();

    expect(requests).toEqual(['Hola', 'Hola amigo']);
    expect(input.value).toBe('こんにちは 友達');
  });

  it('ignores unrelated input events but accepts input events from descendants of the chat input', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: 'ja'
    });
    const requests: string[] = [];
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((message: unknown, callback?: (response: unknown) => void) => {
      requests.push((message as { text: string }).text);
      callback?.({
        ok: true,
        sourceLanguage: 'es',
        translatedText: 'こんにちは'
      });
      return Promise.resolve({});
    }) as never);
    const input = createVisibleChatInput();
    const child = document.createElement('span');
    child.textContent = 'Hola';
    input.append(child);
    document.body.append(createComposerHost(input));

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    document.body.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    child.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();

    expect(requests).toEqual(['Hola']);
    expect(input.textContent).toBe('こんにちは');
  });

  it('does not retranslate translated text with only whitespace appended', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: 'ja'
    });
    const requests: string[] = [];
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((message: unknown, callback?: (response: unknown) => void) => {
      requests.push((message as { text: string }).text);
      callback?.({
        ok: true,
        sourceLanguage: 'es',
        translatedText: 'こんにちは'
      });
      return Promise.resolve({});
    }) as never);
    const input = createVisibleChatInput();
    document.body.append(createComposerHost(input));

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    input.textContent = 'Hola';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();
    await vi.runOnlyPendingTimersAsync();

    input.textContent = 'こんにちは   ';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();

    expect(requests).toEqual(['Hola']);
    expect(input.textContent).toBe('こんにちは   ');
  });

  it('does not retranslate an unchanged translated draft after the replacement guard clears', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: 'ja'
    });
    const requests: string[] = [];
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((message: unknown, callback?: (response: unknown) => void) => {
      requests.push((message as { text: string }).text);
      callback?.({
        ok: true,
        sourceLanguage: 'es',
        translatedText: 'こんにちは'
      });
      return Promise.resolve({});
    }) as never);
    const input = createVisibleChatInput();
    document.body.append(createComposerHost(input));

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    input.textContent = 'Hola';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();
    await vi.runOnlyPendingTimersAsync();

    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();

    expect(requests).toEqual(['Hola']);
  });

  it('does not replace the draft when translation returns an empty result', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: 'ja'
    });
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({
        ok: true,
        sourceLanguage: 'es',
        translatedText: ''
      });
      return Promise.resolve({});
    }) as never);
    const input = createVisibleChatInput();
    document.body.append(createComposerHost(input));

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    input.textContent = 'Hola';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();

    expect(input.textContent).toBe('Hola');
  });

  it('does not replace unchanged translations or stale language responses', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: 'ja'
    });
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((message: unknown, callback?: (response: unknown) => void) => {
      const text = (message as { text: string }).text;
      callback?.({
        ok: true,
        sourceLanguage: 'es',
        translatedText: text
      });
      return Promise.resolve({});
    }) as never);
    const input = createVisibleChatInput();
    document.body.append(createComposerHost(input));

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    input.textContent = 'Hola';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();
    expect(input.textContent).toBe('Hola');

    let resolveTranslation: ((response: unknown) => void) | null = null;
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      resolveTranslation = (response: unknown) => callback?.(response);
      return Promise.resolve({});
    }) as never);
    input.textContent = 'Adios';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    setOptions({ ...DEFAULT_OPTIONS, composerTranslateLanguage: 'ko' });
    refreshComposerTranslation();
    const finishTranslation = resolveTranslation as ((response: unknown) => void) | null;
    if (!finishTranslation) throw new Error('Expected pending draft translation.');
    finishTranslation({
      ok: true,
      sourceLanguage: 'es',
      translatedText: 'さようなら'
    });
    await flushPromises();

    expect(input.textContent).toBe('Adios');
  });

  it('does not replace a draft when the target language changes before the response returns', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: 'ja'
    });
    let resolveTranslation: ((response: unknown) => void) | null = null;
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      resolveTranslation = (response: unknown) => callback?.(response);
      return Promise.resolve({});
    }) as never);
    const input = createVisibleChatInput();
    document.body.append(createComposerHost(input));

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    input.textContent = 'Hola';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    setOptions({ ...DEFAULT_OPTIONS, composerTranslateLanguage: 'ko' });
    const finishTranslation = resolveTranslation as ((response: unknown) => void) | null;
    if (!finishTranslation) throw new Error('Expected pending draft translation.');
    finishTranslation({
      ok: true,
      sourceLanguage: 'es',
      translatedText: 'こんにちは'
    });
    await flushPromises();

    expect(input.textContent).toBe('Hola');
  });

  it('retranslates translated continuations that are embedded in a non-text element', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: 'ja'
    });
    const requests: string[] = [];
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((message: unknown, callback?: (response: unknown) => void) => {
      const text = (message as { text: string }).text;
      requests.push(text);
      callback?.({
        ok: true,
        sourceLanguage: 'es',
        translatedText: text === 'Hola' ? 'こんにちは' : 'こんにちは 友達'
      });
      return Promise.resolve({});
    }) as never);
    const input = createVisibleChatInput();
    document.body.append(createComposerHost(input));

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    input.textContent = 'Hola';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();
    await vi.runOnlyPendingTimersAsync();

    const wrapper = document.createElement('span');
    wrapper.textContent = 'こんにちは amigo';
    input.replaceChildren(wrapper);
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();

    expect(requests).toEqual(['Hola', 'Hola amigo']);
    expect(input.textContent).toBe('こんにちは 友達');
  });

  it('cleans up stale controls and resets draft memory', async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    setOptions({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: 'ja'
    });
    const input = createVisibleChatInput();
    const host = createComposerHost(input);
    document.body.append(host);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((message: unknown, callback?: (response: unknown) => void) => {
      const text = (message as { text: string }).text;
      callback?.({
        ok: true,
        sourceLanguage: 'es',
        translatedText: text === 'Hola' ? 'こんにちは' : 'こんにちは 友達'
      });
      return Promise.resolve({});
    }) as never);

    initComposerTranslation(vi.fn());
    scheduleComposerTranslationWire();
    await vi.runOnlyPendingTimersAsync();
    input.textContent = 'Hola';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(850);
    await flushPromises();

    resetComposerTranslation();
    cleanupStaleComposerTranslation();
    expect(document.querySelector('.ytcq-composer-translate-control')).toBeNull();
    expect(document.querySelector('.ytcq-composer-translate-panel')).toBeNull();
    expect(document.querySelector('.ytcq-composer-translate-host')).toBeNull();
  });

  it('detects nodes that can contain the composer translation control', () => {
    const host = createComposerHost(createVisibleChatInput());
    const emojiButton = host.querySelector<HTMLElement>('#emoji-picker-button')!;
    const wrapper = document.createElement('div');
    wrapper.append(host);

    expect(shouldWireComposerTranslationForNode(host)).toBe(true);
    expect(shouldWireComposerTranslationForNode(emojiButton)).toBe(true);
    expect(shouldWireComposerTranslationForNode(wrapper)).toBe(true);
    expect(shouldWireComposerTranslationForNode(document.createElement('div'))).toBe(false);
  });
});

function createComposerHost(input: HTMLElement): HTMLElement {
  const host = document.createElement('yt-live-chat-message-input-renderer');
  const emojiButton = document.createElement('div');
  emojiButton.id = 'emoji-picker-button';
  host.append(input, emojiButton);
  return host;
}

function createVisibleChatInput(): HTMLElement {
  const input = document.createElement('div');
  input.id = 'input';
  input.setAttribute('contenteditable', 'true');
  input.getBoundingClientRect = () => ({
    bottom: 120,
    height: 40,
    left: 0,
    right: 320,
    top: 80,
    width: 320,
    x: 0,
    y: 80,
    toJSON: () => ({})
  });
  return input;
}

function createVisibleTextarea(): HTMLTextAreaElement {
  const input = document.createElement('textarea');
  input.getBoundingClientRect = () => ({
    bottom: 120,
    height: 40,
    left: 0,
    right: 320,
    top: 80,
    width: 320,
    x: 0,
    y: 80,
    toJSON: () => ({})
  });
  return input;
}

function createInputEmoji(alt: string): HTMLImageElement {
  const emoji = document.createElement('img');
  emoji.className = 'emoji yt-formatted-string style-scope yt-live-chat-text-input-field-renderer';
  emoji.src = 'https://example.test/custom-smile.png';
  emoji.alt = alt;
  emoji.id = 'custom-smile-id';
  emoji.setAttribute('data-emoji-id', 'custom-smile-id');
  emoji.setAttribute('shared-tooltip-text', alt);
  return emoji;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
