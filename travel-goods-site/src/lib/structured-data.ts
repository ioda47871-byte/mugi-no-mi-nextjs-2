import { absoluteUrl, siteConfig } from '@/config/site';
import type { Article } from '@/lib/catalog/types';
import type { Crumb } from '@/components/Breadcrumbs';

/**
 * 構造化データ（計画書 9節）。
 * 画面に出ている内容とだけ一致させる。評価・価格・レビューは作らない。
 */

export function breadcrumbJsonLd(items: Crumb[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.href && absoluteUrl(item.href) ? { item: absoluteUrl(item.href) } : {}),
    })),
  };
}

export function articleJsonLd(article: Article): Record<string, unknown> {
  const url = absoluteUrl(`/articles/${article.slug}/`);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    inLanguage: 'ja',
    ...(url ? { url, mainEntityOfPage: url } : {}),
    ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
    ...(article.updatedAt ? { dateModified: article.updatedAt } : {}),
    // 運営者名が未提供のうちは publisher を出さない（架空の主体を作らない）。
    ...(siteConfig.operatorName
      ? { publisher: { '@type': 'Organization', name: siteConfig.operatorName } }
      : {}),
  };
}
