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

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(panel.hidden).toBe(true);

    document.querySelector<HTMLButtonElement>('.ytcq-composer-translate-button')?.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
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

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
