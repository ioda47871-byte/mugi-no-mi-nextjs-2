import Link from 'next/link';
import { siteConfig } from '@/config/site';
import {
  CATEGORIES,
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
  ARTICLE_CATEGORY_LABELS,
} from '@/lib/catalog/types';
import { getPublishedArticles, getPublishedProducts } from '@/lib/content/load';
import { formatDate, formatWeight, productName } from '@/lib/format';

const PURPOSES = [
  {
    title: '荷物を軽くしたい',
    body: '本体重量から絞り込みます。重量が公表されていない商品は候補に出しません。',
    href: '/categories/suitcases/',
  },
  {
    title: '機内持ち込みで収めたい',
    body: '外寸（ハンドル・キャスター込み）と本体寸法を分けて確認できます。',
    href: '/categories/suitcases/',
  },
  {
    title: '荷物を整理したい',
    body: 'ポーチ自身の重量・収納時の厚み・仕切り数から選べます。',
    href: '/categories/pouches/',
  },
  {
    title: '充電まわりを軽くしたい',
    body: '重量・電池容量・定格電力量(Wh)・出力を並べて確認できます。',
    href: '/categories/power-banks/',
  },
];

export default function HomePage() {
  const articles = getPublishedArticles();
  const products = getPublishedProducts();
  const featured = articles.slice(0, 4);

  return (
    <div className="container-page py-8 sm:py-12">
      <section className="max-w-prose">
        <h1 className="text-2xl font-bold leading-snug tracking-tight text-ink sm:text-3xl">
          {siteConfig.tagline}
        </h1>
        <p className="mt-3 prose-body">
          重さ・サイズ・使い方から、旅行に合う持ちものを探せます。
          メーカー公表仕様をもとに比較しています（
          <Link className="link-inline" href="/editorial-policy/">
            比較の方法
          </Link>
          ）。
        </p>
      </section>

      <section className="mt-10" aria-labelledby="categories-heading">
        <h2 id="categories-heading" className="text-lg font-bold text-ink">
          4つの分野から比較する
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {CATEGORIES.map((category) => {
            const count = products.filter((product) => product.category === category).length;
            return (
              <Link
                key={category}
                href={`/categories/${category}/`}
                className="card group flex flex-col gap-1.5 p-4 transition-colors hover:border-accent"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-bold text-ink group-hover:text-accent-dark">
                    {CATEGORY_LABELS[category]}
                  </span>
                  <span className="shrink-0 text-xs text-ink-faint">掲載 {count} 件</span>
                </span>
                <span className="text-sm leading-relaxed text-ink-soft">
                  {CATEGORY_DESCRIPTIONS[category]}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {products.length > 0 && products.length <= 8 ? (
        <section className="mt-10" aria-labelledby="listed-heading">
          <h2 id="listed-heading" className="text-lg font-bold text-ink">
            掲載中の商品
          </h2>
          <p className="mt-1 text-xs text-ink-faint">
            名前順に並べています。おすすめ順・人気順ではありません。
          </p>
          <ul className="mt-3 divide-y divide-paper-line overflow-hidden rounded-xl border border-paper-line bg-paper-card">
            {[...products]
              .sort((a, b) => productName(a).localeCompare(productName(b), 'ja'))
              .map((product) => (
                <li key={product.id}>
                  <Link
                    href={`/categories/${product.category}/`}
                    className="flex items-baseline justify-between gap-3 p-3.5 hover:bg-paper"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-snug text-ink">
                        {productName(product)}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-faint">
                        {CATEGORY_LABELS[product.category]}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-ink">
                      {formatWeight(product.weightG)}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10" aria-labelledby="purpose-heading">
        <h2 id="purpose-heading" className="text-lg font-bold text-ink">
          目的から探す
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {PURPOSES.map((purpose) => (
            <li key={purpose.title} className="card p-4">
              <Link href={purpose.href} className="text-sm font-bold text-ink hover:text-accent-dark">
                {purpose.title}
              </Link>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{purpose.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="articles-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="articles-heading" className="text-lg font-bold text-ink">
            主な比較・選び方の記事
          </h2>
          <Link href="/articles/" className="text-sm font-medium text-accent-dark hover:underline">
            すべて見る
          </Link>
        </div>
        {featured.length === 0 ? (
          <p className="card mt-4 p-4 text-sm text-ink-soft">
            公開条件（出典・確認日・レビュー記録）を満たした記事から順に公開します。現在は公開済みの記事がありません。
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {featured.map((article) => (
              <li key={article.slug} className="card p-4">
                <Link href={`/articles/${article.slug}/`} className="block">
                  <span className="text-xs font-medium text-accent-dark">
                    {ARTICLE_CATEGORY_LABELS[article.category]}
                  </span>
                  <h3 className="mt-1 text-base font-bold leading-snug text-ink">{article.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{article.description}</p>
                  <p className="mt-2 text-xs text-ink-faint">更新: {formatDate(article.updatedAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

    </div>
  );
}
