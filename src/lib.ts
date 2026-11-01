import { getCollection } from 'astro:content';

// 取得已公開（draft: false）的作品，新的在前
export async function getWorks(category?: string | string[]) {
  const cats = category === undefined ? undefined : [category].flat();
  const all = await getCollection('works', ({ data }) => !data.draft && (!cats || cats.includes(data.category)));
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}
