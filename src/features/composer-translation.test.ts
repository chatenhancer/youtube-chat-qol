import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../shared/options';
import { setOptions } from '../shared/state';
import {
  cleanupStaleComposerTranslation,
  initComposerTranslation,
  refreshComposerTranslation,
  scheduleComposerTranslationWire
} from './composer-translation';

describe('composer translation', () => {
  afterEach(() => {
    cleanupStaleComposerTranslation();
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
