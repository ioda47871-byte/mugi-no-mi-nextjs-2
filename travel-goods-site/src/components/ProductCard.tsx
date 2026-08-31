'use client';

import Link from 'next/link';
import { CATEGORY_LABELS } from '@/lib/catalog/types';
import { SPEC_LABELS, SPEC_UNITS } from '@/lib/catalog/schema';
import { formatCapacity, formatDate, formatSize, formatSpec, formatWeight, productName } from '@/lib/format';
import type { ProductView } from '@/lib/view';
import MerchantActions from './MerchantActions';

/**
 * 商品カード。
 * - 使用感・体験は書かない。掲載するのは公表仕様と、その確認日・出典。
 * - 画像は権利確認できたものだけ。無い場合は文字・仕様主体のカードで完成させる。
 */

type Props = {
  view: ProductView;
  placement: string;
  articleSlug?: string | null;
  categoryId?: string | null;
};

export default function ProductCard({ view, placement, articleSlug = null, categoryId = null }: Props) {
  const { product, sourceRefs, latestCheckedAt, merchants } = view;
  const specEntries = Object.entries(product.specs).filter(([, fact]) => fact.value !== null);

  return (
    <article
      className="card flex flex-col gap-4 p-4 sm:p-5"
      data-testid="product-card"
      data-product-id={product.id}
      data-category={product.category}
    >
      <header className="space-y-1.5">
        <p className="text-xs font-medium text-accent-dark">{CATEGORY_LABELS[product.category]}</p>
        <h3 className="text-base font-bold leading-snug text-ink">{productName(product)}</h3>
        <p className="text-sm leading-relaxed text-ink-soft">{product.summary}</p>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-paper p-3 text-sm">
        <div>
          <dt className="text-xs text-ink-faint">本体重量</dt>
          <dd className="font-semibold text-ink">{formatWeight(product.weightG)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-faint">容量</dt>
          <dd className="font-semibold text-ink">{formatCapacity(product.capacityL)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-ink-faint">外寸（ハンドル・キャスター含む）</dt>
          <dd className="font-semibold text-ink">{formatSize(product.outerSizeMm)}</dd>
        </div>
        {product.bodySizeMm ? (
          <div className="col-span-2">
            <dt className="text-xs text-ink-faint">本体寸法</dt>
            <dd className="font-semibold text-ink">{formatSize(product.bodySizeMm)}</dd>
          </div>
        ) : null}
      </dl>

      {specEntries.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {specEntries.map(([key, fact]) => (
            <li
              key={key}
              className="rounded-full border border-paper-line bg-white px-2.5 py-1 text-xs text-ink-soft"
            >
              <span className="text-ink-faint">{SPEC_LABELS[key] ?? key}</span>
              <span className="ml-1 font-semibold text-ink">{formatSpec(fact, SPEC_UNITS[key])}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {product.caveats.length > 0 ? (
        <div className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2">
          <p className="text-xs font-semibold text-warn">仕様上の注意</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-ink-soft">
            {product.caveats.map((caveat) => (
              <li key={caveat}>{caveat}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <MerchantActions
        productId={product.id}
        resolution={merchants}
        placement={placement}
        articleSlug={articleSlug}
        categoryId={categoryId}
      />

      <footer className="border-t border-paper-line pt-3 text-xs leading-relaxed text-ink-faint">
        <p>仕様の確認日: {formatDate(latestCheckedAt)}</p>
        <p className="mt-1">
          出典:{' '}
          {sourceRefs.length === 0
            ? '未登録'
            : sourceRefs.map((source, index) => (
                <span key={source.id}>
                  {index > 0 ? ' / ' : ''}
                  <a className="link-inline" href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.publisher}
                  </a>
                </span>
              ))}
        </p>
        <p className="mt-1">
          <Link className="link-inline" href={`/categories/${product.category}/`}>
            同じカテゴリを比較する
          </Link>
        </p>
      </footer>
    </article>
  );
}
