import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import deCatalog from './locales/de.json';
import esCatalog from './locales/es.json';
import frCatalog from './locales/fr.json';
import itCatalog from './locales/it.json';
import zhCnCatalog from './locales/zh_CN.json';
import zhTwCatalog from './locales/zh_TW.json';

describe('runtime i18n', () => {
  const originalUrl = window.location.href;
  const runtimeCatalogs = new Map<string, unknown>([
    ['chrome-extension://test/locales/de.json', deCatalog],
    ['chrome-extension://test/locales/es.json', esCatalog],
    ['chrome-extension://test/locales/fr.json', frCatalog],
    ['chrome-extension://test/locales/it.json', itCatalog],
    ['chrome-extension://test/locales/zh_CN.json', zhCnCatalog],
    ['chrome-extension://test/locales/zh_TW.json', zhTwCatalog]
  ]);

  beforeEach(() => {
    vi.resetModules();
    document.documentElement.lang = '';
    vi.mocked(chrome.i18n.getUILanguage).mockReturnValue('en');
    window.history.replaceState({}, '', originalUrl);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const catalog = runtimeCatalogs.get(String(input));
      return {
        json: vi.fn(async () => catalog || {}),
        ok: !!catalog
      } as unknown as Response;
    }));
  });

  afterEach(() => {
    window.history.replaceState({}, '', originalUrl);
    vi.unstubAllGlobals();
  });

  it('uses the YouTube document language before the browser UI language', async () => {
    document.documentElement.lang = 'es-MX';
    vi.mocked(chrome.i18n.getUILanguage).mockReturnValue('ja');
    const i18n = await import('./i18n');

    await i18n.initUiLocaleFromDocument();

    expect(i18n.getUiLocale()).toBe('es');
    expect(i18n.t('translateChat')).toBe('Traducir');
    expect(fetch).toHaveBeenCalledWith('chrome-extension://test/locales/es.json');
  });

  it('normalizes Chinese page-language variants to supported catalogs', async () => {
    document.documentElement.lang = 'zh-Hans-CN';
    const i18n = await import('./i18n');

    await i18n.initUiLocaleFromDocument();

    expect(i18n.getUiLocale()).toBe('zh-CN');
    expect(i18n.t('inbox')).toBe('收件箱');
    expect(fetch).toHaveBeenCalledWith('chrome-extension://test/locales/zh_CN.json');
  });

  it('normalizes Traditional Chinese and URL language fallbacks', async () => {
    document.documentElement.lang = ' zh_Hant_HK ';
    let i18n = await import('./i18n');

    await i18n.initUiLocaleFromDocument();
    expect(i18n.getUiLocale()).toBe('zh-TW');

    vi.resetModules();
    document.documentElement.lang = '';
    window.history.replaceState({}, '', `${originalUrl.split('?')[0]}?hl=fr`);
    i18n = await import('./i18n');

    await i18n.initUiLocaleFromDocument();
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

    await i18n.initUiLocaleFromDocument();

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

    await i18n.initUiLocaleFromDocument();

    expect(i18n.getUiLocale()).toBe('en');

    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: originalParent
    });
  });

  it('falls back to the browser language and then English', async () => {
    vi.mocked(chrome.i18n.getUILanguage).mockReturnValue('de-DE');
    let i18n = await import('./i18n');

    await i18n.initUiLocaleFromDocument();

    expect(i18n.getUiLocale()).toBe('de');
    expect(i18n.t('translateChat')).toBe('Übersetzen');

    vi.resetModules();
    vi.mocked(chrome.i18n.getUILanguage).mockReturnValue('unknown-locale');
    i18n = await import('./i18n');
    await i18n.initUiLocaleFromDocument();

    expect(i18n.getUiLocale()).toBe('en');
    expect(i18n.t('translateChat')).toBe('Translate');
  });

  it('falls back to English when the selected runtime catalog cannot be loaded', async () => {
    document.documentElement.lang = 'pt-BR';
    const i18n = await import('./i18n');

    await i18n.initUiLocaleFromDocument();

    expect(i18n.getUiLocale()).toBe('en');
    expect(i18n.t('translateChat')).toBe('Translate');
  });

  it('formats parameters and plural messages', async () => {
    const i18n = await import('./i18n');

    expect(i18n.t('translateToLanguage', { language: 'Japanese' })).toBe('Translate to Japanese.');
    expect(i18n.t('translateToLanguage')).toBe('Translate to {language}.');
    expect(i18n.t('gamesPlayersOnline', { count: 0 })).toBe('No players online');
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
