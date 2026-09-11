import { describe, expect, it, vi } from 'vitest';
import {
  createOnboardingPreview,
  getPreviewSourceMessage,
  type PreviewTranslator
} from './preview';

describe('onboarding preview', () => {
  it('chooses a source language unlike the browser and translation target', () => {
    expect(getPreviewSourceMessage('en-US', 'ja').language).toBe('zh-CN');
    expect(getPreviewSourceMessage('zh-CN', 'ja').language).toBe('es');
    expect(getPreviewSourceMessage('es-ES', 'zh-TW').language).toBe('ja');
  });

  it('updates translation display, theme, Playground, and Lite mode live', async () => {
    document.body.innerHTML = `
      <div id="preview">
        <span id="previewFeaturedMessage"></span>
        <span id="previewGamesIcon" hidden></span>
        <span id="previewPrimaryText"><span id="previewPrimaryTextLead"></span><span class="preview-inline-translation-tail"><span id="previewPrimaryTextTail"></span><span id="previewInlineTranslateIcon" hidden></span></span></span>
        <p id="previewTranslationLine" hidden>
          <span id="previewSecondaryText"></span>
        </p>
      </div>
    `;
    const root = document.querySelector<HTMLElement>('#preview')!;
    let resolveTranslation: ((text: string) => void) | undefined;
    const translator = vi.fn<PreviewTranslator>(() => new Promise<string>((resolve) => {
      resolveTranslation = resolve;
    }));
    const preview = createOnboardingPreview(root, 'en-US', translator)!;

    preview.applyOptions({
      chatSkin: 'system',
      liteModeEnabled: false,
      playgroundEnabled: false,
      targetLanguage: 'ja',
      translationDisplay: 'replace'
    });

    expect(translator).toHaveBeenCalledWith('看来现在可以正常工作了', 'ja');
    expect(root.dataset.translationState).toBe('loading');
    resolveTranslation?.('今は正常に動作しているようです');
    await Promise.resolve();

    expect(root.dataset.translationState).toBe('translated');
    expect(document.querySelector('#previewPrimaryText')?.textContent).toBe('今は正常に動作しているようです');
    expect(document.querySelector('#previewPrimaryTextLead')?.textContent).toBe('今は正常に動作しているようで');
    expect(document.querySelector('#previewPrimaryTextTail')?.textContent).toBe('す');
    expect(
      document
        .querySelector('#previewFeaturedMessage')
        ?.classList.contains('ytcq-translation-replaced')
    ).toBe(true);
    expect(
      document
        .querySelector('#previewInlineTranslateIcon')
        ?.classList.contains('preview-element-visible')
    ).toBe(true);

    preview.setTranslationDisplay('below');
    expect(
      document
        .querySelector('#previewInlineTranslateIcon')
        ?.classList.contains('preview-element-exiting')
    ).toBe(true);
    expect(document.querySelector('#previewPrimaryText')?.textContent).toBe('看来现在可以正常工作了');
    expect(document.querySelector('#previewSecondaryText')?.textContent).toBe('今は正常に動作しているようです');
    expect(
      document
        .querySelector('#previewTranslationLine')
        ?.classList.contains('preview-element-visible')
    ).toBe(true);

    preview.setChatSkin('aero');
    preview.setPlaygroundEnabled(true);
    preview.setLiteModeEnabled(true);

    expect(root.dataset.chatSkin).toBe('aero');
    expect(root.dataset.chatTheme).toBe('light');
    expect(document.documentElement.getAttribute('data-ytcq-chat-skin')).toBe('aero');
    expect(document.documentElement.getAttribute('data-ytcq-chat-skin-theme')).toBe('light');
    expect(
      document
        .querySelector('#previewGamesIcon')
        ?.classList.contains('preview-element-visible')
    ).toBe(true);
    expect(root.dataset.liteModeEnabled).toBe('true');
    expect(root.dataset.playgroundEnabled).toBe('true');

    preview.setPlaygroundEnabled(false);
    expect(
      document
        .querySelector('#previewGamesIcon')
        ?.classList.contains('preview-element-exiting')
    ).toBe(true);
    expect(root.dataset.playgroundEnabled).toBe('false');

    preview.setLiteModeEnabled(false);
    expect(root.dataset.liteModeEnabled).toBe('false');

    preview.setChatSkin('system');
    expect(document.documentElement.getAttribute('data-ytcq-chat-skin')).toBeNull();
    expect(document.documentElement.getAttribute('data-ytcq-chat-skin-theme')).toBeNull();
  });

  it('ignores an outdated translation response after the target changes', async () => {
    document.body.innerHTML = `
      <div id="preview">
        <span id="previewFeaturedMessage"></span>
        <span id="previewGamesIcon" hidden></span>
        <span id="previewPrimaryText"><span id="previewPrimaryTextLead"></span><span class="preview-inline-translation-tail"><span id="previewPrimaryTextTail"></span><span id="previewInlineTranslateIcon" hidden></span></span></span>
        <p id="previewTranslationLine" hidden>
          <span id="previewSecondaryText"></span>
        </p>
      </div>
    `;
    const resolvers: Array<(text: string) => void> = [];
    const translator: PreviewTranslator = () => new Promise((resolve) => resolvers.push(resolve));
    const preview = createOnboardingPreview(
      document.querySelector<HTMLElement>('#preview')!,
      'en',
      translator
    )!;

    preview.setTargetLanguage('ja');
    preview.setTargetLanguage('fr');
    resolvers[0]('古い翻訳');
    resolvers[1]('La traduction actuelle');
    await Promise.resolve();

    expect(document.querySelector('#previewPrimaryText')?.textContent).toBe('La traduction actuelle');
  });

  it('keeps the preview skin in sync with the system color scheme', () => {
    document.body.innerHTML = `
      <div id="preview">
        <span id="previewFeaturedMessage"></span>
        <span id="previewGamesIcon"></span>
        <span id="previewPrimaryText"><span id="previewPrimaryTextLead"></span><span class="preview-inline-translation-tail"><span id="previewPrimaryTextTail"></span><span id="previewInlineTranslateIcon"></span></span></span>
        <p id="previewTranslationLine">
          <span id="previewSecondaryText"></span>
        </p>
      </div>
    `;
    let darkMode = false;
    let handleColorSchemeChange: EventListener | undefined;
    vi.mocked(window.matchMedia).mockReturnValueOnce({
      addEventListener: vi.fn((_type, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') handleColorSchemeChange = listener;
      }),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      get matches() {
        return darkMode;
      },
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn()
    });

    const root = document.querySelector<HTMLElement>('#preview')!;
    const preview = createOnboardingPreview(root, 'en')!;
    preview.setChatSkin('aero');

    expect(root.dataset.chatTheme).toBe('light');
    expect(document.documentElement.getAttribute('data-ytcq-chat-skin-theme')).toBe('light');

    darkMode = true;
    handleColorSchemeChange?.(new Event('change'));

    expect(root.dataset.chatTheme).toBe('dark');
    expect(document.documentElement.getAttribute('data-ytcq-chat-skin-theme')).toBe('dark');

    preview.setChatSkin('system');
  });
});
