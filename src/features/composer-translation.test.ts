import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../shared/options';
import { setOptions } from '../shared/state';
import { clearToast } from '../shared/toast';
import {
  cleanupStaleComposerTranslation,
  initComposerTranslation,
  refreshComposerTranslation,
  scheduleComposerTranslationWire
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
