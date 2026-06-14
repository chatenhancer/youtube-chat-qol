import { getCollection } from 'astro:content';
import { getBlogIndexUrl, getBlogPostUrl, getBlogTagArchives, getBlogTagUrl } from '../data/blog';
import { canonicalUrlFor, locales } from '../data/locales';

export async function GET() {
  const posts = await getCollection('blog');
  const postLastmodDates = posts
    .map((post) => post.data.date.toISOString().slice(0, 10))
    .sort();
  const latestPostLastmod = postLastmodDates[postLastmodDates.length - 1];
  const urls = [
    ...locales.map((locale) => ({
      changefreq: 'weekly',
      lastmod: latestPostLastmod,
      loc: canonicalUrlFor(locale)
    })),
    {
      changefreq: 'weekly',
      lastmod: latestPostLastmod,
      loc: getBlogIndexUrl('en')
    },
    ...locales
      .filter((locale) => locale !== 'en')
      .map((locale) => ({
        changefreq: 'weekly',
        lastmod: latestPostLastmod,
        loc: getBlogIndexUrl(locale)
      })),
    ...posts.map((post) => ({
      changefreq: 'monthly',
      lastmod: post.data.date.toISOString().slice(0, 10),
      loc: getBlogPostUrl(post)
    })),
    ...locales.flatMap((locale) =>
      getBlogTagArchives(posts, locale).map((archive) => ({
        changefreq: 'weekly',
        lastmod: archive.posts[0]?.data.date.toISOString().slice(0, 10),
        loc: getBlogTagUrl(locale, archive.tag)
      }))
    ).filter((url) => url.lastmod)
  ];

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => [
      '  <url>',
      `    <loc>${escapeXml(url.loc)}</loc>`,
      url.lastmod ? `    <lastmod>${escapeXml(url.lastmod)}</lastmod>` : '',
      `    <changefreq>${escapeXml(url.changefreq)}</changefreq>`,
      '  </url>'
    ].filter(Boolean).join('\n')),
    '</urlset>',
    ''
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8'
    }
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
