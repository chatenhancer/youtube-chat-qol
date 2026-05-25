/**
 * Runtime localization for UI injected into YouTube.
 *
 * WebExtension `_locales` follows the browser, but injected chat UI should
 * follow YouTube's page language. Both systems use the same source catalogs in
 * `src/shared/locales`; build output derives `_locales` from those files.
 */
import arCatalog from './locales/ar.json';
import deCatalog from './locales/de.json';
import enCatalog from './locales/en.json';
import esCatalog from './locales/es.json';
import faCatalog from './locales/fa.json';
import frCatalog from './locales/fr.json';
import heCatalog from './locales/he.json';
import hiCatalog from './locales/hi.json';
import idCatalog from './locales/id.json';
import itCatalog from './locales/it.json';
import jaCatalog from './locales/ja.json';
import koCatalog from './locales/ko.json';
import nlCatalog from './locales/nl.json';
import plCatalog from './locales/pl.json';
import ptCatalog from './locales/pt.json';
import ruCatalog from './locales/ru.json';
import thCatalog from './locales/th.json';
import trCatalog from './locales/tr.json';
import ukCatalog from './locales/uk.json';
import viCatalog from './locales/vi.json';
import zhCnCatalog from './locales/zh_CN.json';
import zhTwCatalog from './locales/zh_TW.json';
import { getLanguageLabel } from './languages';

type MessageParams = Record<string, number | string>;
type PluralMessage = { one?: string; other: string };
type MessageValue = string | PluralMessage;
type LocaleCatalog = {
  messages: Partial<Record<MessageKey, MessageValue>>;
};
type MessageKey = keyof typeof enCatalog.messages;

const EN_MESSAGES = enCatalog.messages as Record<MessageKey, MessageValue>;
const LOCALES: Record<string, LocaleCatalog> = {
  ar: arCatalog,
  de: deCatalog,
  en: enCatalog,
  es: esCatalog,
  fa: faCatalog,
  fr: frCatalog,
  he: heCatalog,
  hi: hiCatalog,
  id: idCatalog,
  it: itCatalog,
  ja: jaCatalog,
  ko: koCatalog,
  nl: nlCatalog,
  pl: plCatalog,
  pt: ptCatalog,
  ru: ruCatalog,
  th: thCatalog,
  tr: trCatalog,
  uk: ukCatalog,
  vi: viCatalog,
  'zh-TW': zhTwCatalog,
  'zh-CN': zhCnCatalog
};

let currentUiLocale = 'en';

export function initUiLocaleFromDocument(): void {
  const documentLocale = getDocumentLocale();
  const browserLocale = chrome.i18n?.getUILanguage?.() || navigator.language || '';
  currentUiLocale = normalizeSupportedLocale(documentLocale) || normalizeSupportedLocale(browserLocale) || 'en';
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
  return base && LOCALES[base] ? base : '';
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
