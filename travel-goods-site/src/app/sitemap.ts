import type { MetadataRoute } from 'next';

// output: 'export' ではビルド時に生成する必要がある。
export const dynamic = 'force-static';
import { siteConfig, shouldAllowIndexing } from '@/config/site';
import { CATEGORIES } from '@/lib/catalog/types';
import { getPublishedArticles } from '@/lib/content/load';

/**
 * サイトマップ（計画書 9節）。
 * - 公開済みページだけを含める。下書き・保留記事は getPublishedArticles に出てこない。
 * - プレビューや SITE_URL 未設定のときは空にする（誤ったURLを配らない）。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.baseUrl;
  if (!base || !shouldAllowIndexing) return [];

  const today = new Date().toISOString().slice(0, 10);

  const staticPaths = [
    '/',
    '/articles/',
    '/about/',
    '/editorial-policy/',
    '/privacy/',
    '/contact/',
    ...CATEGORIES.map((category) => `/categories/${category}/`),
  ];

  return [
    ...staticPaths.map((path) => ({
      url: `${base}${path}`,
      lastModified: today,
    })),
    ...getPublishedArticles().map((article) => ({
      url: `${base}/articles/${article.slug}/`,
      lastModified: article.updatedAt ?? article.publishedAt ?? today,
    })),
  ];
}
