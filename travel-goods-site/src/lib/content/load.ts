import { loadCatalog } from '@/lib/catalog/load';
import { selectPublishableArticles } from './publication';
import type { Article, Catalog, Category, MerchantLink, Product } from '@/lib/catalog/types';

/**
 * 画面が使う「公開済みだけのビュー」。
 * 下書き・レビュー中・保留中の記事や未公開商品はここから出てこない。
 */

export type SiteData = {
  catalog: Catalog;
  /** 公開条件を満たした記事のみ。 */
  articles: Article[];
  /** 公開条件を満たさず保留になった記事と、その理由。 */
  withheldArticles: { slug: string; reasons: string[] }[];
  /** status === 'published' の商品のみ。 */
  products: Product[];
  merchantLinks: MerchantLink[];
};

let cached: SiteData | null = null;

export function getSiteData(): SiteData {
  if (cached) return cached;
  const catalog = loadCatalog();
  const { published, withheld } = selectPublishableArticles(catalog);
  cached = {
    catalog,
    articles: published,
    withheldArticles: withheld,
    products: catalog.products.filter((product) => product.status === 'published'),
    merchantLinks: catalog.merchantLinks,
  };
  return cached;
}

export function getPublishedProducts(category?: Category): Product[] {
  const { products } = getSiteData();
  return category ? products.filter((product) => product.category === category) : products;
}

export function getPublishedArticles(): Article[] {
  return [...getSiteData().articles].sort((a, b) =>
    (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
  );
}

export function getArticleBySlug(slug: string): Article | null {
  return getSiteData().articles.find((article) => article.slug === slug) ?? null;
}

export function getProductsByIds(ids: string[]): Product[] {
  const { products } = getSiteData();
  const map = new Map(products.map((product) => [product.id, product]));
  return ids.map((id) => map.get(id)).filter((product): product is Product => Boolean(product));
}

export function getSourcesByIds(ids: string[]) {
  const { catalog } = getSiteData();
  const map = new Map(catalog.sources.map((source) => [source.id, source]));
  return ids.map((id) => map.get(id)).filter((source) => Boolean(source));
}

/** 商品が参照している出典を、重複なく集める（記事の出典欄に使う）。 */
export function collectProductSources(products: Product[]): string[] {
  const ids = new Set<string>();
  for (const product of products) {
    for (const fact of [product.weightG, product.outerSizeMm, product.bodySizeMm, product.capacityL]) {
      if (fact?.sourceId) ids.add(fact.sourceId);
    }
    for (const fact of Object.values(product.specs)) {
      if (fact.sourceId) ids.add(fact.sourceId);
    }
    if (product.image) ids.add(product.image.sourceId);
  }
  return [...ids];
}
