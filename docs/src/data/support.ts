import { getLocaleUrl, htmlLangFor, locales } from './locales';
import type { Locale } from './locales';
import { site } from './site';

export const supportPath = '/support/';

export function getSupportPath(locale: Locale = 'en'): string {
  return locale === 'en' ? supportPath : `${getLocaleUrl(locale)}support/`;
}

export function getSupportUrl(locale: Locale = 'en'): string {
  return `${site.url}${getSupportPath(locale)}`;
}

export function getSupportLanguageUrls(): Partial<Record<Locale, string>> {
  return Object.fromEntries(locales.map((locale) => [locale, getSupportPath(locale)]));
}

export function getSupportAlternateLinks(): { href: string; hreflang: string }[] {
  return locales.map((locale) => ({
    href: getSupportUrl(locale),
    hreflang: htmlLangFor(locale)
  }));
}
