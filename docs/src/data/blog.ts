import type { CollectionEntry } from 'astro:content';
import { defaultLocale, getLocaleUrl, htmlLangFor, localeMeta, locales } from './locales';
import type { Locale } from './locales';
import { site } from './site';

export type BlogPost = CollectionEntry<'blog'>;

export interface AlternateLink {
  href: string;
  hreflang: string;
}

export interface BlogTagArchive {
  posts: BlogPost[];
  tag: string;
  tagSlug: string;
}

export function getLocalizedBlogPosts(posts: BlogPost[], locale: Locale): BlogPost[] {
  return Array.from(groupPostsByTranslationKey(posts).values())
    .map((translations) => findPostForLocale(translations, locale) || findPostForLocale(translations, defaultLocale))
    .filter((post): post is BlogPost => Boolean(post))
    .sort(comparePostsByDate);
}

export function getBlogTagArchives(posts: BlogPost[], locale: Locale): BlogTagArchive[] {
  const archives = new Map<string, BlogTagArchive>();

  for (const post of getLocalizedBlogPosts(posts, locale)) {
    const postTagSlugs = new Set<string>();

    for (const tag of post.data.tags) {
      const tagSlug = getBlogTagSlug(tag);
      if (!tagSlug || postTagSlugs.has(tagSlug)) continue;

      postTagSlugs.add(tagSlug);
      const archive = archives.get(tagSlug) || {
        posts: [],
        tag: tag.trim(),
        tagSlug
      };

      archive.posts.push(post);
      archives.set(tagSlug, archive);
    }
  }

  return Array.from(archives.values()).sort((first, second) => first.tag.localeCompare(second.tag));
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

export function getBlogTagPath(locale: Locale, tag: string): string {
  const tagSlug = getBlogTagSlug(tag);
  if (!tagSlug) throw new Error(`Unsupported blog tag: ${tag}`);

  return `${getLocaleUrl(locale)}blog/tags/${tagSlug}/`;
}

export function getBlogIndexUrl(locale: Locale): string {
  return `${site.url}${getBlogIndexPath(locale)}`;
}

export function getBlogPostUrl(post: BlogPost): string {
  return `${site.url}${getBlogPostPath(post)}`;
}

export function getBlogTagUrl(locale: Locale, tag: string): string {
  return `${site.url}${getBlogTagPath(locale, tag)}`;
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

export function getBlogTagAlternateLinks(posts: BlogPost[], tag: string): AlternateLink[] {
  return getBlogTagLocales(posts, tag).map((locale) => ({
    href: getBlogTagUrl(locale, tag),
    hreflang: htmlLangFor(locale)
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

export function getBlogTagLanguageUrls(posts: BlogPost[], tag: string): Partial<Record<Locale, string>> {
  return Object.fromEntries(getBlogTagLocales(posts, tag).map((locale) => [locale, getBlogTagPath(locale, tag)]));
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

export function getBlogTagSlug(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getBlogTagLocales(posts: BlogPost[], tag: string): Locale[] {
  const tagSlug = getBlogTagSlug(tag);
  return locales.filter((locale) =>
    getBlogTagArchives(posts, locale).some((archive) => archive.tagSlug === tagSlug)
  );
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
