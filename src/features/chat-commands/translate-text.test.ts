import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTranslateTextCommand, translateCommandText } from './translate-text';

const toastMock = vi.hoisted(() => vi.fn());

vi.mock('../../shared/toast', () => ({
  showToast: toastMock
}));

describe('inline translate command helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses stable language codes and preserves the text after the code', () => {
    expect(parseTranslateTextCommand('JA hello everyone')).toEqual({
      targetLanguage: 'ja',
      text: 'hello everyone'
    });
    expect(parseTranslateTextCommand('zh-cn   thanks for the stream')).toEqual({
      targetLanguage: 'zh-CN',
      text: 'thanks for the stream'
    });
  });

  it('shows clear toasts for missing or invalid parameters', () => {
    expect(parseTranslateTextCommand('')).toBeNull();
    expect(parseTranslateTextCommand('ja')).toBeNull();
    expect(parseTranslateTextCommand('zz hello')).toBeNull();

    expect(toastMock).toHaveBeenNthCalledWith(1, 'Missing language code.');
    expect(toastMock).toHaveBeenNthCalledWith(2, 'Missing text to translate.');
    expect(toastMock).toHaveBeenNthCalledWith(3, 'Invalid language code.');
  });

  it('sends the protected command text through the background translation bridge', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      message: unknown,
      callback?: (response: unknown) => void
    ) => {
      const sourceText = (message as { text?: string }).text || '';
      callback?.({
        ok: true,
        sourceLanguage: 'en',
        translatedText: sourceText.replace('hello', 'こんにちは')
      });
      return Promise.resolve();
    }) as never);

    await expect(translateCommandText('hello @ExampleViewer', 'ja'))
      .resolves.toBe('こんにちは @ExampleViewer');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        targetLanguage: 'ja',
        type: 'ytcq:translate'
      }),
      expect.any(Function)
    );
  });

  it('rejects when the background translation bridge reports an error', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      _message: unknown,
      callback?: (response: unknown) => void
    ) => {
      callback?.({ ok: false, error: 'Translate request failed.' });
      return Promise.resolve();
    }) as never);

    await expect(translateCommandText('hello', 'ja')).rejects.toThrow('Translate request failed.');
  });
});
