import { getCollection } from 'astro:content';
import { canonicalUrlFor, locales } from '../data/locales';
import { site } from '../data/site';

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
      loc: `${site.url}/blog/`
    },
    ...posts.map((post) => ({
      changefreq: 'monthly',
      lastmod: post.data.date.toISOString().slice(0, 10),
      loc: `${site.url}/blog/${post.data.slug}/`
    }))
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
