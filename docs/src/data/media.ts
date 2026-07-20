import walkthroughMedia from './walkthrough-videos.json';
import { defaultLocale } from './locales';
import type { Locale } from './locales';

const videos = walkthroughMedia.videos as Partial<Record<Locale, string>>;

export function getWalkthroughVideoUrl(
  locale: Locale,
  publicBaseUrl = walkthroughMedia.publicBaseUrl
): string {
  const fileName = videos[locale] || videos[defaultLocale];
  if (!fileName) return '';

  return new URL(fileName, ensureTrailingSlash(publicBaseUrl)).href;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}
