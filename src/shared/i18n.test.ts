import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('runtime i18n', () => {
  beforeEach(() => {
    vi.resetModules();
    document.documentElement.lang = '';
    vi.mocked(chrome.i18n.getUILanguage).mockReturnValue('en');
  });

  it('uses the YouTube document language before the browser UI language', async () => {
    document.documentElement.lang = 'es-MX';
    vi.mocked(chrome.i18n.getUILanguage).mockReturnValue('ja');
    const i18n = await import('./i18n');

    i18n.initUiLocaleFromDocument();

    expect(i18n.getUiLocale()).toBe('es');
    expect(i18n.t('translateChat')).toBe('Traducir chat');
  });

  it('normalizes Chinese page-language variants to supported catalogs', async () => {
    document.documentElement.lang = 'zh-Hans-CN';
    const i18n = await import('./i18n');

    i18n.initUiLocaleFromDocument();

    expect(i18n.getUiLocale()).toBe('zh-CN');
    expect(i18n.t('inbox')).toBe('收件箱');
  });

  it('falls back to the browser language and then English', async () => {
    vi.mocked(chrome.i18n.getUILanguage).mockReturnValue('de-DE');
    let i18n = await import('./i18n');

    i18n.initUiLocaleFromDocument();

    expect(i18n.getUiLocale()).toBe('de');
    expect(i18n.t('translateChat')).toBe('Chat übersetzen');

    vi.resetModules();
    vi.mocked(chrome.i18n.getUILanguage).mockReturnValue('unknown-locale');
    i18n = await import('./i18n');
    i18n.initUiLocaleFromDocument();

    expect(i18n.getUiLocale()).toBe('en');
    expect(i18n.t('translateChat')).toBe('Translate chat');
  });

  it('formats parameters and plural messages', async () => {
    const i18n = await import('./i18n');

    expect(i18n.t('translateToLanguage', { language: 'Japanese' })).toBe('Translate to Japanese.');
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
