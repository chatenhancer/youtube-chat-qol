/**
 * Runtime localization for UI injected into YouTube.
 *
 * WebExtension `_locales` follows the browser, but injected chat UI should
 * follow YouTube's page language. English stays bundled as the synchronous
 * fallback; the chosen non-English catalog is loaded from extension assets
 * before feature lifecycle startup so feature code can keep using `t()`.
 */
import enCatalog from './locales/en.json';
import { getLanguageLabel } from './languages';

type MessageParams = Record<string, number | string>;
type PluralMessage = { one?: string; other: string; zero?: string };
type MessageValue = string | PluralMessage;
type LocaleCatalog = {
  messages: Partial<Record<MessageKey, MessageValue>>;
};
export type MessageKey = keyof typeof enCatalog.messages;

const EN_MESSAGES = enCatalog.messages as Record<MessageKey, MessageValue>;
const SUPPORTED_LOCALES = new Set([
  'ar',
  'de',
  'en',
  'es',
  'fa',
  'fr',
  'he',
  'hi',
  'id',
  'it',
  'ja',
  'ko',
  'nl',
  'pl',
  'pt',
  'ru',
  'th',
  'tr',
  'uk',
  'vi',
  'zh-CN',
  'zh-TW'
]);
const LOCALE_FILENAMES: Record<string, string> = {
  'zh-CN': 'zh_CN',
  'zh-TW': 'zh_TW'
};
const LOCALES: Record<string, LocaleCatalog> = {
  en: enCatalog,
};

let currentUiLocale = 'en';

export async function initUiLocaleFromDocument(): Promise<void> {
  const documentLocale = getDocumentLocale();
  const browserLocale = chrome.i18n?.getUILanguage?.() || navigator.language || '';
  const preferredLocales = [
    normalizeSupportedLocale(documentLocale),
    normalizeSupportedLocale(browserLocale),
    'en'
  ].filter(Boolean);

  for (const locale of preferredLocales) {
    if (await ensureLocaleLoaded(locale)) {
      currentUiLocale = locale;
      return;
    }
  }

  currentUiLocale = 'en';
}

export function getUiLocale(): string {
  return currentUiLocale;
}

export function t(key: MessageKey, params: MessageParams = {}): string {
  const message = LOCALES[currentUiLocale]?.messages[key] || EN_MESSAGES[key];
  return formatMessage(message, params);
}

export function getLocalizedLanguageLabel(languageCode: string): string {
  const normalizedCode = String(languageCode || '').toLowerCase();
  if (!normalizedCode) return '';

  try {
    const displayName = new Intl.DisplayNames([currentUiLocale], { type: 'language' }).of(normalizedCode);
    if (displayName) return displayName;
  } catch {
    // Fall back to the static English catalog below.
  }

  return getLanguageLabel(normalizedCode);
}

function formatMessage(message: MessageValue, params: MessageParams): string {
  const template = typeof message === 'string' ? message : selectPluralMessage(message, params);
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

function selectPluralMessage(message: PluralMessage, params: MessageParams): string {
  if (params.count === 0 && message.zero) return message.zero;
  return params.count === 1 && message.one ? message.one : message.other;
}

function normalizeSupportedLocale(locale: string): string {
  const normalized = String(locale || '').trim().toLowerCase().replace('_', '-');
  if (!normalized) return '';
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

  const base = normalized.split('-')[0];
  return base && SUPPORTED_LOCALES.has(base) ? base : '';
}

async function ensureLocaleLoaded(locale: string): Promise<boolean> {
  if (LOCALES[locale]) return true;

  const catalog = await loadRuntimeLocale(locale);
  if (!catalog) return false;
  LOCALES[locale] = catalog;
  return true;
}

async function loadRuntimeLocale(locale: string): Promise<LocaleCatalog | null> {
  try {
    const response = await fetch(chrome.runtime.getURL(`locales/${LOCALE_FILENAMES[locale] || locale}.json`));
    if (!response.ok) return null;
    const catalog = await response.json() as unknown;
    return isLocaleCatalog(catalog) ? catalog : null;
  } catch {
    return null;
  }
}

function isLocaleCatalog(value: unknown): value is LocaleCatalog {
  if (!value || typeof value !== 'object') return false;
  const messages = (value as { messages?: unknown }).messages;
  return !!messages && typeof messages === 'object';
}

function getDocumentLocale(): string {
  return getCurrentDocumentLocale() || getParentDocumentLocale() || getUrlLocale();
}

function getCurrentDocumentLocale(): string {
  return document.documentElement.lang ||
    document.querySelector('html')?.getAttribute('lang') ||
    '';
}

function getParentDocumentLocale(): string {
  try {
    if (window.parent === window) return '';
    return window.parent.document.documentElement.lang ||
      window.parent.document.querySelector('html')?.getAttribute('lang') ||
      '';
  } catch {
    return '';
  }
}

function getUrlLocale(): string {
  try {
    return new URLSearchParams(window.location.search).get('hl') || '';
  } catch {
    return '';
  }
}
