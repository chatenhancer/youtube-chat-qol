import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({
    base: './docs/src/content/blog',
    generateId: ({ entry, data }) => {
      const translationKey = String(data.translationKey || entry.replace(/\/[^/]+$/, ''));
      const locale = String(data.locale || getLocaleFromBlogEntry(entry));
      return `${translationKey}/${locale}`;
    },
    pattern: '**/*.md'
  }),
  schema: ({ image }) => z.object({
    date: z.date(),
    description: z.string(),
    cover_width: z.number().min(25).max(100).optional(),
    image: image().optional(),
    locale: z.string().default('en'),
    slug: z.string(),
    tags: z.array(z.string()).default([]),
    title: z.string(),
    translationKey: z.string(),
    video: z.string().optional()
  })
});

const privacyPolicy = defineCollection({
  loader: glob({
    base: '.',
    generateId: () => 'privacy-policy',
    pattern: 'PRIVACY.md'
  }),
  schema: z.object({})
});

export const collections = { blog, privacyPolicy };

function getLocaleFromBlogEntry(entry: string): string {
  const fileName = entry.split('/').pop() || '';
  return fileName === 'index.md' ? 'en' : fileName.replace(/\.md$/, '');
}
