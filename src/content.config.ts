import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

export const categories = ['painting', 'photography', 'piano', 'certificate'] as const;

const works = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/works' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      category: z.enum(categories),
      date: z.coerce.date(),
      summary: z.string().max(120).optional(),
      cover: image(),
      coverAlt: z.string(),
      featured: z.boolean().default(false),
      draft: z.boolean().default(false),
      // 畫作
      medium: z.string().optional(),
      size: z.string().optional(),
      // 攝影
      location: z.string().optional(),
      camera: z.string().optional(),
      // 鋼琴 / 證書
      composer: z.string().optional(),
      event: z.string().optional(),
      result: z.string().optional(),
      video: z
        .discriminatedUnion('type', [
          z.object({ type: z.literal('file'), src: z.string().regex(/^[\w.\-]+\.(mp4|webm)$/, '請填 public/videos 內的檔名，例如 recital.mp4') }),
          z.object({ type: z.literal('youtube'), id: z.string().regex(/^[\w-]{11}$/, 'YouTube 影片 ID 為 11 碼') }),
        ])
        .optional(),
    }),
});

export const collections = { works };
