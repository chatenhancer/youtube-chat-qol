import type { Locale } from '@chatenhancer/product-config/locales';

// Keep the published English URLs stable. Translations use static WebP siblings.
export function localizedImage(source: string, locale: Locale): string {
  return locale === 'en' ? source : source.replace(/\.(png|webp)$/, `-${locale}.webp`);
}
