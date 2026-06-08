import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('runtime i18n', () => {
  const originalUrl = window.location.href;

  beforeEach(() => {
    vi.resetModules();
    document.documentElement.lang = '';
    vi.mocked(chrome.i18n.getUILanguage).mockReturnValue('en');
    window.history.replaceState({}, '', originalUrl);
  });

  afterEach(() => {
    window.history.replaceState({}, '', originalUrl);
  });

  it('uses the YouTube document language before the browser UI language', async () => {
    document.documentElement.lang = 'es-MX';
    vi.mocked(chrome.i18n.getUILanguage).mockReturnValue('ja');
    const i18n = await import('./i18n');

    i18n.initUiLocaleFromDocument();

    expect(i18n.getUiLocale()).toBe('es');
    expect(i18n.t('translateChat')).toBe('Traducir');
  });

  it('normalizes Chinese page-language variants to supported catalogs', async () => {
    document.documentElement.lang = 'zh-Hans-CN';
    const i18n = await import('./i18n');

    i18n.initUiLocaleFromDocument();

    expect(i18n.getUiLocale()).toBe('zh-CN');
    expect(i18n.t('inbox')).toBe('收件箱');
  });

  it('normalizes Traditional Chinese and URL language fallbacks', async () => {
    document.documentElement.lang = ' zh_Hant_HK ';
    let i18n = await import('./i18n');

    i18n.initUiLocaleFromDocument();
    expect(i18n.getUiLocale()).toBe('zh-TW');

    vi.resetModules();
    document.documentElement.lang = '';
    window.history.replaceState({}, '', `${originalUrl.split('?')[0]}?hl=fr`);
    i18n = await import('./i18n');

    i18n.initUiLocaleFromDocument();
    expect(i18n.getUiLocale()).toBe('fr');
  });

  it('uses the parent document language when the chat frame document has no language', async () => {
    const originalParent = window.parent;
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: {
        document: {
          documentElement: { lang: 'it-IT' },
          querySelector: vi.fn()
        }
      }
    });
    const i18n = await import('./i18n');

    i18n.initUiLocaleFromDocument();

    expect(i18n.getUiLocale()).toBe('it');

    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: originalParent
    });
  });

  it('falls back when the parent document language is inaccessible', async () => {
    const originalParent = window.parent;
    Object.defineProperty(window, 'parent', {
      configurable: true,
      get: () => {
        throw new Error('cross-origin parent');
      }
    });
    const i18n = await import('./i18n');

    i18n.initUiLocaleFromDocument();

    expect(i18n.getUiLocale()).toBe('en');

    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: originalParent
    });
  });

  it('falls back to the browser language and then English', async () => {
    vi.mocked(chrome.i18n.getUILanguage).mockReturnValue('de-DE');
    let i18n = await import('./i18n');

    i18n.initUiLocaleFromDocument();

    expect(i18n.getUiLocale()).toBe('de');
    expect(i18n.t('translateChat')).toBe('Übersetzen');

    vi.resetModules();
    vi.mocked(chrome.i18n.getUILanguage).mockReturnValue('unknown-locale');
    i18n = await import('./i18n');
    i18n.initUiLocaleFromDocument();

    expect(i18n.getUiLocale()).toBe('en');
    expect(i18n.t('translateChat')).toBe('Translate');
  });

  it('formats parameters and plural messages', async () => {
    const i18n = await import('./i18n');

    expect(i18n.t('translateToLanguage', { language: 'Japanese' })).toBe('Translate to Japanese.');
    expect(i18n.t('translateToLanguage')).toBe('Translate to {language}.');
    expect(i18n.t('unreadMessages', { count: 1 })).toBe('1 new message');
    expect(i18n.t('unreadMessages', { count: 3 })).toBe('3 new messages');
  });

  it('returns localized language labels with a static fallback', async () => {
    const i18n = await import('./i18n');

    expect(i18n.getLocalizedLanguageLabel('ja')).toBe('Japanese');
    expect(i18n.getLocalizedLanguageLabel('not-a-language')).toBe('not-a-language');
    expect(i18n.getLocalizedLanguageLabel('')).toBe('');
  });
});
