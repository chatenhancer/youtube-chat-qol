import { getLocaleUrl, htmlLangFor, locales } from './locales';
import type { Locale } from './locales';
import { site } from './site';

export const privacyPolicyPath = '/privacy/';

export function getPrivacyPolicyPath(locale: Locale = 'en'): string {
  return locale === 'en' ? privacyPolicyPath : `${getLocaleUrl(locale)}privacy/`;
}

export function getPrivacyPolicyUrl(locale: Locale = 'en'): string {
  return `${site.url}${getPrivacyPolicyPath(locale)}`;
}

export function getPrivacyPolicyLanguageUrls(): Partial<Record<Locale, string>> {
  return Object.fromEntries(locales.map((locale) => [locale, getPrivacyPolicyPath(locale)]));
}

export function getPrivacyPolicyAlternateLinks(): { href: string; hreflang: string }[] {
  return locales.map((locale) => ({
    href: getPrivacyPolicyUrl(locale),
    hreflang: htmlLangFor(locale)
  }));
}
