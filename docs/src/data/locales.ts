import type { Messages } from './site';

export const defaultLocale = 'en';

export const localeMeta = {
  ar: { dir: 'rtl', label: 'العربية', ogLocale: 'ar_AR', path: 'ar' },
  de: { label: 'Deutsch', ogLocale: 'de_DE', path: 'de' },
  en: { label: 'English', ogLocale: 'en_US', path: '' },
  es: { label: 'Español', ogLocale: 'es_ES', path: 'es' },
  fa: { dir: 'rtl', label: 'فارسی', ogLocale: 'fa_IR', path: 'fa' },
  fr: { label: 'Français', ogLocale: 'fr_FR', path: 'fr' },
  he: { dir: 'rtl', label: 'עברית', ogLocale: 'he_IL', path: 'he' },
  hi: { label: 'हिन्दी', ogLocale: 'hi_IN', path: 'hi' },
  id: { label: 'Bahasa Indonesia', ogLocale: 'id_ID', path: 'id' },
  it: { label: 'Italiano', ogLocale: 'it_IT', path: 'it' },
  ja: { label: '日本語', ogLocale: 'ja_JP', path: 'ja' },
  ko: { label: '한국어', ogLocale: 'ko_KR', path: 'ko' },
  nl: { label: 'Nederlands', ogLocale: 'nl_NL', path: 'nl' },
  pl: { label: 'Polski', ogLocale: 'pl_PL', path: 'pl' },
  pt: { label: 'Português', ogLocale: 'pt_BR', path: 'pt' },
  ru: { label: 'Русский', ogLocale: 'ru_RU', path: 'ru' },
  th: { label: 'ไทย', ogLocale: 'th_TH', path: 'th' },
  tr: { label: 'Türkçe', ogLocale: 'tr_TR', path: 'tr' },
  uk: { label: 'Українська', ogLocale: 'uk_UA', path: 'uk' },
  vi: { label: 'Tiếng Việt', ogLocale: 'vi_VN', path: 'vi' },
  zh_CN: { htmlLang: 'zh-CN', label: '中文（简体）', ogLocale: 'zh_CN', path: 'zh-CN' },
  zh_TW: { htmlLang: 'zh-TW', label: '中文（繁體）', ogLocale: 'zh_TW', path: 'zh-TW' }
} as const;

export type Locale = keyof typeof localeMeta;

const messageModules = import.meta.glob<Messages>('../i18n/*.json', {
  eager: true,
  import: 'default'
});

export const locales = Object.keys(localeMeta) as Locale[];

export function getLocaleFromPath(pathValue: string): Locale {
  const match = locales.find((locale) => localeMeta[locale].path === pathValue);
  if (!match) throw new Error(`Unsupported docs locale path: ${pathValue}`);
  return match;
}

export function getLocaleUrl(locale: Locale): string {
  const localePath = localeMeta[locale].path;
  return localePath ? `/${localePath}/` : '/';
}

export function getMessages(locale: Locale): Messages {
  const fileName = locale === 'zh_CN' ? 'zh_CN' : locale === 'zh_TW' ? 'zh_TW' : locale;
  const messages = messageModules[`../i18n/${fileName}.json`];
  if (!messages) throw new Error(`Missing docs locale messages for ${locale}`);
  return messages;
}

export function htmlLangFor(locale: Locale): string {
  return localeMeta[locale].htmlLang || locale;
}

export function canonicalUrlFor(locale: Locale): string {
  return `https://chatenhancer.com${getLocaleUrl(locale)}`;
}
