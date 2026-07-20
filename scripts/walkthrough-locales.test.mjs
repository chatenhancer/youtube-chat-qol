import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  defaultWalkthroughLocale,
  getWalkthroughAppleLanguage,
  getWalkthroughBrowserLocale,
  getWalkthroughLocales,
  getWalkthroughPreferredLanguages,
  getWalkthroughTextDirection,
  loadWalkthroughCopy,
  loadWalkthroughDemoCopy,
  loadWalkthroughExtensionMessages,
  getWalkthroughTranslationLanguage,
  walkthroughLocaleMatches,
  withWalkthroughYouTubePreference
} from './walkthrough-locales.mjs';
import {
  configureWalkthroughProfileLocale,
  getWalkthroughProfilePath
} from './walkthrough-profile.mjs';

describe('walkthrough locales', () => {
  it('keeps every docs locale aligned with the English walkthrough script', async () => {
    const locales = await getWalkthroughLocales();
    const englishCopy = await loadWalkthroughCopy(defaultWalkthroughLocale);
    const englishKeys = Object.keys(englishCopy).sort();

    expect(locales[0]).toBe(defaultWalkthroughLocale);
    expect(englishKeys).not.toHaveLength(0);
    expect(englishKeys.every((key) => key.endsWith('Title') || key.endsWith('Body'))).toBe(true);

    for (const locale of locales) {
      const copy = await loadWalkthroughCopy(locale);
      const demoCopy = await loadWalkthroughDemoCopy(locale);
      const extensionMessages = await loadWalkthroughExtensionMessages(locale);
      expect(Object.keys(copy).sort(), locale).toEqual(englishKeys);
      expect(Object.keys(demoCopy).sort(), locale).toEqual([
        'composerDraft',
        'incomingTranslation',
        'nativeBlock',
        'nativeReport'
      ]);
      expect(demoCopy.composerDraft, locale).toContain('@ChatDemo');
      expect(demoCopy.composerDraft, locale).toContain('✅');
      expect(extensionMessages.originalMessage.trim(), locale).not.toBe('');
      expect(extensionMessages.translated.trim(), locale).not.toBe('');
      expect(extensionMessages.translatedMessage.trim(), locale).not.toBe('');
    }
  });

  it('maps regional browser locales and right-to-left scripts', () => {
    expect(getWalkthroughBrowserLocale('pt')).toBe('pt-BR');
    expect(getWalkthroughBrowserLocale('zh_CN')).toBe('zh-CN');
    expect(getWalkthroughBrowserLocale('zh_TW')).toBe('zh-TW');
    expect(getWalkthroughBrowserLocale('es')).toBe('es');
    expect(getWalkthroughAppleLanguage('zh_CN')).toBe('zh-Hans');
    expect(getWalkthroughAppleLanguage('zh_TW')).toBe('zh-Hant');
    expect(getWalkthroughAppleLanguage('pt')).toBe('pt-BR');
    expect(getWalkthroughPreferredLanguages('pt')).toEqual(['pt-BR', 'pt', 'en-US', 'en']);
    expect(getWalkthroughTranslationLanguage('he')).toBe('iw');
    expect(getWalkthroughTranslationLanguage('zh_CN')).toBe('zh-CN');
    expect(getWalkthroughTranslationLanguage('zh_TW')).toBe('zh-TW');
    expect(getWalkthroughTranslationLanguage('pt')).toBe('pt');
    expect(getWalkthroughTextDirection('ar')).toBe('rtl');
    expect(getWalkthroughTextDirection('fa')).toBe('rtl');
    expect(getWalkthroughTextDirection('he')).toBe('rtl');
    expect(getWalkthroughTextDirection('ja')).toBe('ltr');
  });

  it('matches browser locale variants and updates the YouTube preference', () => {
    expect(walkthroughLocaleMatches('pt-PT', 'pt')).toBe(true);
    expect(walkthroughLocaleMatches('zh-Hans-CN', 'zh_CN')).toBe(true);
    expect(walkthroughLocaleMatches('zh-Hant-HK', 'zh_TW')).toBe(true);
    expect(walkthroughLocaleMatches('zh-CN', 'zh_TW')).toBe(false);
    expect(walkthroughLocaleMatches('iw', 'he')).toBe(true);
    expect(walkthroughLocaleMatches('en-US', 'ja')).toBe(false);

    const preferences = new URLSearchParams(withWalkthroughYouTubePreference('f6=400&hl=en', 'ja'));
    expect(preferences.get('f6')).toBe('400');
    expect(preferences.get('hl')).toBe('ja');
  });

  it('uses an isolated profile path and writes its locale preferences', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'ytcq-walkthrough-profile-'));
    const profileDir = getWalkthroughProfilePath(rootDir, 'zh_CN');
    const preferencesPath = path.join(profileDir, 'Default', 'Preferences');
    try {
      await mkdir(path.dirname(preferencesPath), { recursive: true });
      await writeFile(preferencesPath, JSON.stringify({ intl: { existing: true }, untouched: 1 }));

      await expect(configureWalkthroughProfileLocale(profileDir, 'zh_CN')).resolves.toEqual({
        browserLocale: 'zh-CN',
        preferredLanguages: 'zh-CN,zh,en-US,en'
      });
      const preferences = JSON.parse(await readFile(preferencesPath, 'utf8'));
      expect(preferences).toEqual({
        intl: {
          accept_languages: 'zh-CN,zh,en-US,en',
          app_locale: 'zh-CN',
          existing: true,
          selected_languages: 'zh-CN,zh,en-US,en'
        },
        untouched: 1
      });
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });
});
