import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsLocalesDir = path.join(repoRoot, 'docs', 'src', 'i18n');
const extensionLocalesDir = path.join(repoRoot, 'src', 'shared', 'locales');
const walkthroughDemoCopyPath = path.join(repoRoot, 'scripts', 'walkthrough-demo-copy.json');

export const defaultWalkthroughLocale = 'en';

export async function getWalkthroughLocales() {
  const locales = (await readdir(docsLocalesDir))
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => path.basename(fileName, '.json'))
    .sort();

  if (!locales.includes(defaultWalkthroughLocale)) {
    throw new Error('Docs locales must include en.json before walkthrough videos can be generated.');
  }

  return [
    defaultWalkthroughLocale,
    ...locales.filter((locale) => locale !== defaultWalkthroughLocale)
  ];
}

export async function loadWalkthroughCopy(locale) {
  const supportedLocales = await getWalkthroughLocales();
  if (!supportedLocales.includes(locale)) {
    throw new Error(`Unsupported walkthrough locale: ${locale}. Expected one of: ${supportedLocales.join(', ')}.`);
  }

  const localePath = path.join(docsLocalesDir, `${locale}.json`);
  const messages = JSON.parse(await readFile(localePath, 'utf8'));
  const copy = messages.walkthroughVideo;
  if (!isPlainObject(copy)) {
    throw new Error(`${localePath} must define walkthroughVideo copy.`);
  }

  const invalidKeys = Object.entries(copy)
    .filter(([, value]) => typeof value !== 'string' || !value.trim())
    .map(([key]) => key);
  if (invalidKeys.length) {
    throw new Error(`${localePath} has empty walkthroughVideo values: ${invalidKeys.join(', ')}.`);
  }

  return copy;
}

export async function loadWalkthroughDemoCopy(locale) {
  const supportedLocales = await getWalkthroughLocales();
  if (!supportedLocales.includes(locale)) {
    throw new Error(`Unsupported walkthrough locale: ${locale}. Expected one of: ${supportedLocales.join(', ')}.`);
  }

  const copyByLocale = JSON.parse(await readFile(walkthroughDemoCopyPath, 'utf8'));
  const copy = copyByLocale[locale];
  const expectedKeys = ['composerDraft', 'incomingTranslation', 'nativeBlock', 'nativeReport'];
  if (!isPlainObject(copy) || expectedKeys.some((key) => typeof copy[key] !== 'string' || !copy[key].trim())) {
    throw new Error(`${walkthroughDemoCopyPath} must define ${expectedKeys.join(' and ')} for ${locale}.`);
  }

  return copy;
}

export async function loadWalkthroughExtensionMessages(locale) {
  const localePath = path.join(extensionLocalesDir, `${locale}.json`);
  const localeCatalog = JSON.parse(await readFile(localePath, 'utf8'));
  const messages = localeCatalog.messages;
  const expectedKeys = ['originalMessage', 'translated', 'translatedMessage'];
  if (!isPlainObject(messages) || expectedKeys.some((key) => typeof messages[key] !== 'string' || !messages[key].trim())) {
    throw new Error(`${localePath} must define ${expectedKeys.join(', ')} for the walkthrough.`);
  }

  return messages;
}

export function getWalkthroughBrowserLocale(locale) {
  if (locale === 'zh_CN') return 'zh-CN';
  if (locale === 'zh_TW') return 'zh-TW';
  if (locale === 'pt') return 'pt-BR';
  return locale;
}

export function getWalkthroughTranslationLanguage(locale) {
  if (locale === 'he') return 'iw';
  if (locale === 'zh_CN') return 'zh-CN';
  if (locale === 'zh_TW') return 'zh-TW';
  return locale;
}

export function getWalkthroughAppleLanguage(locale) {
  if (locale === 'zh_CN') return 'zh-Hans';
  if (locale === 'zh_TW') return 'zh-Hant';
  return getWalkthroughBrowserLocale(locale);
}

export function getWalkthroughPreferredLanguages(locale) {
  const browserLocale = getWalkthroughBrowserLocale(locale);
  const baseLocale = browserLocale.split('-')[0];
  return [...new Set([browserLocale, baseLocale, 'en-US', 'en'])];
}

export function getWalkthroughTextDirection(locale) {
  return ['ar', 'fa', 'he'].includes(locale) ? 'rtl' : 'ltr';
}

export function walkthroughLocaleMatches(value, locale) {
  return normalizeWalkthroughLocale(value) === normalizeWalkthroughLocale(
    getWalkthroughBrowserLocale(locale)
  );
}

export function withWalkthroughYouTubePreference(value, locale) {
  const preferences = new URLSearchParams(value || '');
  preferences.set('hl', getWalkthroughBrowserLocale(locale));
  return preferences.toString();
}

function normalizeWalkthroughLocale(value) {
  const normalized = String(value || '').trim().toLowerCase().replaceAll('_', '-');
  if (!normalized) return '';
  if (normalized === 'iw' || normalized.startsWith('iw-')) return 'he';
  if (
    normalized === 'zh' ||
    normalized.startsWith('zh-cn') ||
    normalized.startsWith('zh-hans') ||
    normalized.startsWith('zh-sg')
  ) {
    return 'zh-CN';
  }
  if (
    normalized.startsWith('zh-tw') ||
    normalized.startsWith('zh-hant') ||
    normalized.startsWith('zh-hk') ||
    normalized.startsWith('zh-mo')
  ) {
    return 'zh-TW';
  }
  return normalized.split('-')[0];
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
