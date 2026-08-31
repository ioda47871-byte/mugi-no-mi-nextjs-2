'use client';

import Link from 'next/link';
import { CATEGORY_LABELS, capacityLabel } from '@/lib/catalog/types';
import type { Product } from '@/lib/catalog/types';
import { SPEC_LABELS, SPEC_UNITS } from '@/lib/catalog/schema';
import {
  formatCapacity,
  formatDate,
  formatSpec,
  formatWeight,
  measurementRows,
  productName,
} from '@/lib/format';
import type { ProductView } from '@/lib/view';
import MerchantActions from './MerchantActions';

/**
 * 商品カード。
 *
 * 見せる順序（読者が違いを判断するのに要る順）:
 *   1. 商品名  2. 重量  3. 容量または出力  4. 用途に関わる主な機能
 *   5. 主な注意点  6. 購入導線
 *   7. 「仕様の詳細」— 寸法の条件や不明項目を含む全項目（折りたたみ）
 *
 * 掲載するのは公表仕様と、その確認日・出典。使用感・体験は書かない。
 * 画像は権利確認できたものだけ。無い場合は文字主体で完成させる。
 */

type Props = {
  view: ProductView;
  placement: string;
  articleSlug?: string | null;
  categoryId?: string | null;
};

/** カテゴリごとに「まず見せる1つ目の数値」を変える。 */
function primaryMetric(product: Product): { label: string; value: string } {
  if (product.category === 'power-banks') {
    const wh = product.specs.ratedWh;
    const mah = product.specs.capacityMah;
    if (wh && wh.value !== null) return { label: '定格電力量', value: formatSpec(wh, 'Wh') };
    if (mah && mah.value !== null) return { label: '電池容量', value: formatSpec(mah, 'mAh') };
    return { label: '定格電力量', value: '不明' };
  }
  return { label: capacityLabel(product.measurementState), value: formatCapacity(product.capacityL) };
}

/** 用途の判断に効く機能を、カテゴリごとに少数だけ選ぶ。 */
const HIGHLIGHT_SPECS: Record<string, string[]> = {
  suitcases: ['stopper', 'openingType', 'tsaLock'],
  backpacks: ['openingType', 'luggagePassThrough', 'laptopCompartment'],
  pouches: ['compartmentCount', 'compression', 'hangingHook'],
  'power-banks': ['maxOutputW', 'builtInCable', 'outputPorts'],
};

export default function ProductCard({ view, placement, articleSlug = null, categoryId = null }: Props) {
  const { product, sourceRefs, latestCheckedAt, merchants } = view;
  const metric = primaryMetric(product);
  const rows = measurementRows(product);

  const highlights = (HIGHLIGHT_SPECS[product.category] ?? [])
    .map((key) => ({ key, fact: product.specs[key] }))
    .filter((entry) => entry.fact && entry.fact.value !== null);

  const allSpecs = Object.entries(product.specs);

  return (
    <article
      className="card flex flex-col gap-3 p-4 sm:p-5"
      data-testid="product-card"
      data-product-id={product.id}
      data-category={product.category}
    >
      <header className="space-y-1">
        <p className="text-xs font-medium text-accent-dark">{CATEGORY_LABELS[product.category]}</p>
        <h3 className="text-[1.0625rem] font-bold leading-snug text-ink">{productName(product)}</h3>
      </header>

      {/* 最初に目に入る2つの数値 */}
      <dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-paper px-3 py-2.5">
        <div>
          <dt className="text-[0.7rem] text-ink-faint">本体重量</dt>
          <dd className="text-lg font-bold leading-tight text-ink">{formatWeight(product.weightG)}</dd>
        </div>
        <div>
          <dt className="text-[0.7rem] text-ink-faint">{metric.label}</dt>
          <dd className="text-lg font-bold leading-tight text-ink">{metric.value}</dd>
        </div>
      </dl>

      {highlights.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {highlights.map(({ key, fact }) => (
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

      <p className="text-sm leading-relaxed text-ink-soft">{product.summary}</p>

      {/* 主な注意点は先頭の1件だけ。残りは詳細へ。 */}
      {product.caveats.length > 0 ? (
        <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-xs leading-relaxed text-ink-soft">
          <span className="font-semibold text-warn">注意</span> {product.caveats[0]}
        </p>
      ) : null}

      <MerchantActions
        productId={product.id}
        resolution={merchants}
        placement={placement}
        articleSlug={articleSlug}
        categoryId={categoryId}
      />

      <details className="group border-t border-paper-line pt-3">
        <summary className="cursor-pointer list-none text-sm font-medium text-accent-dark marker:content-none hover:underline">
          <span className="inline-flex min-h-8 items-center gap-1">
            仕様の詳細を見る
            <span aria-hidden="true" className="transition-transform group-open:rotate-90">
              ›
            </span>
          </span>
        </summary>

        <div className="mt-2 space-y-3">
          <dl className="divide-y divide-paper-line text-sm">
            {rows.map((row) => (
              <div key={row.label} className="flex justify-between gap-4 py-1.5">
                <dt className="text-xs leading-relaxed text-ink-faint">{row.label}</dt>
                <dd className={`text-right ${row.value === '不明' ? 'text-ink-faint' : 'text-ink'}`}>
                  {row.value}
                </dd>
              </div>
            ))}
            {allSpecs.map(([key, fact]) => (
              <div key={key} className="flex justify-between gap-4 py-1.5">
                <dt className="text-xs leading-relaxed text-ink-faint">{SPEC_LABELS[key] ?? key}</dt>
                <dd className={`text-right ${fact.value === null ? 'text-ink-faint' : 'text-ink'}`}>
                  {formatSpec(fact, SPEC_UNITS[key])}
                </dd>
              </div>
            ))}
          </dl>

          {product.caveats.length > 1 ? (
            <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-ink-soft">
              {product.caveats.slice(1).map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
          ) : null}

          <p className="text-xs leading-relaxed text-ink-faint">
            「不明」はメーカー公表仕様で確認できなかった項目です。推定値は入れていません。
          </p>

          <p className="text-xs leading-relaxed text-ink-faint">
            仕様の確認日: {formatDate(latestCheckedAt)}
            {sourceRefs.length > 0 ? (
              <>
                {' / '}出典:{' '}
                {sourceRefs.map((source, index) => (
                  <span key={source.id}>
                    {index > 0 ? '、' : ''}
                    <a className="link-inline" href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.publisher}
                    </a>
                  </span>
                ))}
              </>
            ) : null}
          </p>

          <p className="text-xs">
            <Link className="link-inline" href={`/categories/${product.category}/`}>
              同じカテゴリを比較する
            </Link>
          </p>
        </div>
      </details>
    </article>
  );
}
