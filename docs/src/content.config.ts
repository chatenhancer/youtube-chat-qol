import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({
    base: './docs/src/content/blog',
    pattern: '**/index.md'
  }),
  schema: ({ image }) => z.object({
    date: z.date(),
    description: z.string(),
    image: image().optional(),
    slug: z.string(),
    tags: z.array(z.string()).default([]),
    title: z.string(),
    video: z.string().optional()
  })
});

export const collections = { blog };
