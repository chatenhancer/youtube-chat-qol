/**
 * Runtime localization for UI injected into YouTube.
 *
 * WebExtension `_locales` follows the browser, but injected chat UI should
 * follow YouTube's page language. Both systems use the same source catalogs in
 * `src/shared/locales`; build output derives `_locales` from those files.
 */
import deCatalog from './locales/de.json';
import enCatalog from './locales/en.json';
import esCatalog from './locales/es.json';
import frCatalog from './locales/fr.json';
import jaCatalog from './locales/ja.json';
import koCatalog from './locales/ko.json';
import ptCatalog from './locales/pt.json';
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
  de: deCatalog,
  en: enCatalog,
  es: esCatalog,
  fr: frCatalog,
  ja: jaCatalog,
  ko: koCatalog,
  pt: ptCatalog
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
  const base = String(locale || '').trim().toLowerCase().replace('_', '-').split('-')[0];
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
