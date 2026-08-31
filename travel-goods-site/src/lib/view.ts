import { getMerchantConfig } from '@/config/merchants';
import { resolveMerchantLinks, type MerchantLinkResolution } from '@/lib/affiliate/resolve';
import type { MerchantLink, Product, Source } from '@/lib/catalog/types';

/**
 * 画面へ渡す表示用モデル。
 *
 * 購入リンクの解決は「ビルド時（サーバー側）」でだけ行い、結果の href だけを
 * クライアントへ渡す。理由:
 *   - 紹介IDやリンク判定ロジックをブラウザ側の分岐に依存させない
 *   - フィルタ用のクライアントコンポーネントからでも同じカードを再利用できる
 */

export type SourceRef = {
  id: string;
  publisher: string;
  url: string;
  checkedAt: string;
};

export type ProductView = {
  product: Product;
  merchants: MerchantLinkResolution;
  sourceRefs: SourceRef[];
  /** 仕様の確認日のうち最も新しいもの。 */
  latestCheckedAt: string | null;
};

function collectFactMeta(product: Product): { sourceIds: string[]; checkedDates: string[] } {
  const sourceIds = new Set<string>();
  const checkedDates: string[] = [];
  const facts = [
    product.weightG,
    product.outerSizeMm,
    product.bodySizeMm,
    product.capacityL,
    ...Object.values(product.specs),
  ];
  for (const fact of facts) {
    if (!fact) continue;
    if (fact.sourceId) sourceIds.add(fact.sourceId);
    if (fact.checkedAt) checkedDates.push(fact.checkedAt);
  }
  return { sourceIds: [...sourceIds], checkedDates };
}

export function buildProductView(
  product: Product,
  merchantLinks: MerchantLink[],
  sources: Map<string, Source>,
): ProductView {
  const { sourceIds, checkedDates } = collectFactMeta(product);
  return {
    product,
    merchants: resolveMerchantLinks(product, merchantLinks, getMerchantConfig()),
    sourceRefs: sourceIds
      .map((id) => sources.get(id))
      .filter((source): source is Source => Boolean(source))
      .map(({ id, publisher, url, checkedAt }) => ({ id, publisher, url, checkedAt })),
    latestCheckedAt: checkedDates.length > 0 ? checkedDates.sort().at(-1)! : null,
  };
}

export function buildProductViews(
  products: Product[],
  merchantLinks: MerchantLink[],
  sources: Source[],
): ProductView[] {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  return products.map((product) => buildProductView(product, merchantLinks, sourceMap));
}
