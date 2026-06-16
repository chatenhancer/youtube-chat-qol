import type { Locale } from './locales';
import { site } from './site';

export const privacyPolicyPath = '/privacy/';

export function getPrivacyPolicyUrl(): string {
  return `${site.url}${privacyPolicyPath}`;
}

export function getPrivacyPolicyLanguageUrls(): Partial<Record<Locale, string>> {
  return { en: privacyPolicyPath };
}
