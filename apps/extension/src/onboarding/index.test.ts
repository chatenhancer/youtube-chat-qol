import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const preview = vi.hoisted(() => ({
  applyOptions: vi.fn(),
  setChatSkin: vi.fn(),
  setLiteModeEnabled: vi.fn(),
  setPlaygroundEnabled: vi.fn(),
  setTargetLanguage: vi.fn(),
  setTranslationDisplay: vi.fn()
}));

vi.mock('./preview', () => ({
  createOnboardingPreview: vi.fn(() => preview)
}));

const onboardingHtml = readFileSync(resolve(import.meta.dirname, '../onboarding.html'), 'utf8');

describe('onboarding settings', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn();
      disconnect = vi.fn();
    });
    document.open();
    document.write(onboardingHtml);
    document.close();
    await chrome.storage.sync.clear();
    vi.mocked(chrome.storage.sync.get).mockClear();
    vi.mocked(chrome.storage.sync.set).mockClear();
    Object.values(preview).forEach((mock) => mock.mockClear());
    installMatchMedia(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('links the Playground option to the Playground site', () => {
    const learnMoreLink = document.querySelector<HTMLAnchorElement>(
      'label[for="onboardingPlaygroundEnabled"] .setting-helper a'
    );

    expect(learnMoreLink?.href).toBe('https://playground.chatenhancer.com/');
  });

  it('shows translation appearance only while translation is enabled', async () => {
    await import('./index');

    const targetLanguage = document.querySelector<HTMLSelectElement>('#onboardingTargetLanguage')!;
    const displayRow = document.querySelector<HTMLElement>('#onboardingTranslationDisplayRow')!;
    expect(displayRow.hidden).toBe(true);

    targetLanguage.value = 'ja';
    targetLanguage.dispatchEvent(new Event('change', { bubbles: true }));
    expect(displayRow.hidden).toBe(false);
    expect(preview.setTargetLanguage).toHaveBeenCalledWith('ja');

    targetLanguage.value = '';
    targetLanguage.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(180);
    expect(displayRow.hidden).toBe(true);
  });

  it('uses the localized translated prefix in the below-message preview', async () => {
    vi.mocked(chrome.i18n.getMessage).mockImplementation((key: string) =>
      key === 'translated' ? 'Traduit :' : key
    );

    await import('./index');

    expect(document.querySelector('#previewTranslationPrefix')?.textContent).toBe('Traduit :');
    expect(document.querySelector('#previewBelowTranslateIcon')).toBeNull();
  });

  it('does not animate onboarding setting icons when reduced motion is preferred', async () => {
    installMatchMedia(true);
    await import('./index');

    const targetLanguage = document.querySelector<HTMLSelectElement>('#onboardingTargetLanguage')!;
    targetLanguage.value = 'ja';
    targetLanguage.dispatchEvent(new Event('change', { bubbles: true }));

    const translationDisplay = document.querySelector<HTMLSelectElement>(
      '#onboardingTranslationDisplay'
    )!;
    translationDisplay.value = 'below';
    translationDisplay.dispatchEvent(new Event('change', { bubbles: true }));

    const chatSkin = document.querySelector<HTMLSelectElement>('#onboardingChatSkin')!;
    chatSkin.value = 'aero';
    chatSkin.dispatchEvent(new Event('change', { bubbles: true }));

    const playgroundEnabled = document.querySelector<HTMLInputElement>(
      '#onboardingPlaygroundEnabled'
    )!;
    playgroundEnabled.checked = true;
    playgroundEnabled.dispatchEvent(new Event('change', { bubbles: true }));

    const liteModeEnabled = document.querySelector<HTMLInputElement>('#onboardingLiteModeEnabled')!;
    liteModeEnabled.checked = true;
    liteModeEnabled.dispatchEvent(new Event('change', { bubbles: true }));

    expect(
      document
        .querySelector('.translation-target-icon')
        ?.classList.contains('ytcq-translation-pulse')
    ).toBe(false);
    expect(
      document.querySelector('.translation-display-icon')?.classList.contains('ytcq-display-reflow')
    ).toBe(false);
    expect(document.querySelector('.chat-skin-icon')?.classList.contains('ytcq-palette-pop')).toBe(
      false
    );
    document.querySelectorAll('.lite-mode-icon').forEach((icon) => {
      expect(icon.classList.contains('ytcq-bolt-redraw')).toBe(false);
    });
    expect(
      document
        .querySelector('.playground-joystick-icon')
        ?.classList.contains('ytcq-playground-joystick-wiggle')
    ).toBe(false);
    expect(
      document.querySelector('.game-invites-icon')?.classList.contains('ytcq-game-controller-hop')
    ).toBe(false);
  });
});

function installMatchMedia(reducedMotion: boolean): void {
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: query === '(prefers-reduced-motion: reduce)' && reducedMotion,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn()
      }) as MediaQueryList
  );
}
