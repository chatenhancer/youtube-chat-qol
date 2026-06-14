import type { CollectionEntry } from 'astro:content';
import { defaultLocale, getLocaleUrl, htmlLangFor, localeMeta, locales } from './locales';
import type { Locale } from './locales';
import { site } from './site';

export type BlogPost = CollectionEntry<'blog'>;

export interface AlternateLink {
  href: string;
  hreflang: string;
}

export function getLocalizedBlogPosts(posts: BlogPost[], locale: Locale): BlogPost[] {
  return Array.from(groupPostsByTranslationKey(posts).values())
    .map((translations) => findPostForLocale(translations, locale) || findPostForLocale(translations, defaultLocale))
    .filter((post): post is BlogPost => Boolean(post))
    .sort(comparePostsByDate);
}

export function getRelatedBlogPosts(posts: BlogPost[], post: BlogPost, locale: Locale, limit = 3): BlogPost[] {
  const currentTags = new Set(post.data.tags.map(normalizeTag));
  const candidates = getLocalizedBlogPosts(posts, locale)
    .filter((candidate) => candidate.data.translationKey !== post.data.translationKey)
    .map((candidate) => ({
      post: candidate,
      sharedTagCount: candidate.data.tags.filter((tag) => currentTags.has(normalizeTag(tag))).length
    }))
    .sort((first, second) => {
      if (second.sharedTagCount !== first.sharedTagCount) {
        return second.sharedTagCount - first.sharedTagCount;
      }

      return comparePostsByDate(first.post, second.post);
    });

  const relatedPosts = candidates.filter((candidate) => candidate.sharedTagCount > 0);
  return (relatedPosts.length > 0 ? relatedPosts : candidates)
    .slice(0, limit)
    .map((candidate) => candidate.post);
}

export function getBlogPostTranslations(posts: BlogPost[], post: BlogPost): BlogPost[] {
  return groupPostsByTranslationKey(posts).get(post.data.translationKey) || [post];
}

export function getPostLocale(post: BlogPost): Locale {
  return toLocale(post.data.locale);
}

export function getBlogIndexPath(locale: Locale): string {
  return `${getLocaleUrl(locale)}blog/`;
}

export function getBlogPostPath(post: BlogPost): string {
  return `${getLocaleUrl(getPostLocale(post))}blog/${post.data.slug}/`;
}

export function getBlogIndexUrl(locale: Locale): string {
  return `${site.url}${getBlogIndexPath(locale)}`;
}

export function getBlogPostUrl(post: BlogPost): string {
  return `${site.url}${getBlogPostPath(post)}`;
}

export function getBlogIndexAlternateLinks(): AlternateLink[] {
  return locales.map((locale) => ({
    href: getBlogIndexUrl(locale),
    hreflang: htmlLangFor(locale)
  }));
}

export function getBlogPostAlternateLinks(posts: BlogPost[], post: BlogPost): AlternateLink[] {
  return getBlogPostTranslations(posts, post).map((translation) => ({
    href: getBlogPostUrl(translation),
    hreflang: htmlLangFor(getPostLocale(translation))
  }));
}

export function getBlogIndexLanguageUrls(): Partial<Record<Locale, string>> {
  return Object.fromEntries(locales.map((locale) => [locale, getBlogIndexPath(locale)]));
}

export function getBlogPostLanguageUrls(posts: BlogPost[], post: BlogPost): Partial<Record<Locale, string>> {
  return Object.fromEntries(
    getBlogPostTranslations(posts, post).map((translation) => [
      getPostLocale(translation),
      getBlogPostPath(translation)
    ])
  );
}

export function getBlogEntryFolder(post: BlogPost): string {
  const normalizedId = post.id.replace(/\\/g, '/').replace(/\.[^/.]+$/, '');
  const parts = normalizedId.split('/');
  const fileName = parts[parts.length - 1] || '';
  if (fileName === 'index' || isLocaleFileName(fileName)) {
    parts.pop();
  }

  return parts.join('/');
}

export function toLocale(value: string): Locale {
  if (isLocale(value)) return value;
  throw new Error(`Unsupported blog locale: ${value}`);
}

function groupPostsByTranslationKey(posts: BlogPost[]): Map<string, BlogPost[]> {
  const groups = new Map<string, BlogPost[]>();
  for (const post of posts) {
    const group = groups.get(post.data.translationKey) || [];
    group.push(post);
    groups.set(post.data.translationKey, group);
  }

  return groups;
}

function findPostForLocale(posts: BlogPost[], locale: Locale): BlogPost | undefined {
  return posts.find((post) => getPostLocale(post) === locale);
}

function comparePostsByDate(first: BlogPost, second: BlogPost): number {
  return second.data.date.valueOf() - first.data.date.valueOf();
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

function isLocaleFileName(value: string): boolean {
  return value === 'zh_CN' || value === 'zh_TW' || Boolean(localeMeta[value as Locale]);
}
